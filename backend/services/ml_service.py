"""
ml_service.py
-------------
Provides the MLService class responsible for:
  - Loading all three trained models (Logistic Regression, Random Forest,
    XGBoost) eagerly at application startup.
  - Running all three models on a single feature vector and combining them
    into a soft-voting ensemble prediction with calibrated-style confidence
    bands, a ranked differential list, and an explicit agreement count.
"""

import json
import logging
import os
import pickle

import numpy as np

from backend.utils.preprocessor import preprocessor_service
from backend.services.model_metadata import read_metadata


# Absolute path to the backend/models/ directory, resolved relative to this file
_MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")

# Internal mapping: display name → pkl filename
_MODEL_FILES = {
    "Logistic Regression": "logistic_regression.pkl",
    "Random Forest": "random_forest.pkl",
    "XGBoost": "xgboost.pkl",
}

# Confidence bands applied to the ensemble probability.
#
# These are deliberately conservative. With 41 classes a uniform random guess
# scores 1/41 ≈ 0.024, so a raw probability of 0.3 is far from "certain" even
# though it is 12x chance level. Probabilities here are NOT calibrated, so they
# are presented as a relative signal strength rather than a true likelihood.
CONFIDENCE_HIGH = 0.70
CONFIDENCE_MODERATE = 0.40

# Number of ranked alternatives returned alongside the top prediction.
DIFFERENTIAL_COUNT = 3

# Plausibility filter — minimum fraction of user symptoms that must overlap
# with a condition's known symptom set for it to be considered plausible.
# Example: user enters 3 symptoms, condition has 0 matching → overlap = 0.0
# A condition with zero overlap should never surface as the top answer.
PLAUSIBILITY_MIN_OVERLAP = 0.20   # at least 20% of entered symptoms must match

# Path to the condition→symptoms mapping built from the training dataset
_CONDITION_SYMPTOMS_PATH = os.path.join(_MODELS_DIR, "condition_symptoms.json")

logger = logging.getLogger(__name__)


class MLService:
    """
    Manages the three AMR Shield prediction models and orchestrates
    multi-model inference.

    Models are loaded once at application startup via load_models() and
    held in memory for the lifetime of the process. No model loading
    occurs during request handling.
    """

    def __init__(self):
        """Initialise the service with empty model slots."""
        self._models: dict = {}
        self._models_loaded: bool = False
        self._condition_symptoms: dict = {}   # condition → set of known symptoms

    def load_models(self) -> None:
        """
        Load logistic_regression.pkl, random_forest.pkl, and xgboost.pkl
        from backend/models/ into memory.

        This method is called once during Flask app startup. It is NOT
        called per-request.

        Raises:
            FileNotFoundError: If any of the three model files are missing.
            Exception: Re-raises any pickle deserialization error with context.
        """
        for display_name, filename in _MODEL_FILES.items():
            model_path = os.path.join(_MODELS_DIR, filename)
            if not os.path.isfile(model_path):
                raise FileNotFoundError(
                    f"Model file not found: {model_path}. "
                    f"Run `python run_training.py` to generate {filename}."
                )
            with open(model_path, "rb") as f:
                self._models[display_name] = pickle.load(f)

        self._models_loaded = True

        # Load condition→symptoms plausibility map
        if os.path.isfile(_CONDITION_SYMPTOMS_PATH):
            with open(_CONDITION_SYMPTOMS_PATH, "r", encoding="utf-8") as f:
                raw = json.load(f)
            self._condition_symptoms = {k: set(v) for k, v in raw.items()}
            logger.info(
                f"Loaded plausibility map for {len(self._condition_symptoms)} conditions "
                f"from condition_symptoms.json"
            )
        else:
            logger.warning(
                "condition_symptoms.json not found — plausibility filtering disabled. "
                "Re-run `python run_training.py` to generate it."
            )

        # Log metadata so operators can confirm which training run is active
        metadata = read_metadata()
        if metadata:
            logger.info(
                f"Models trained at: {metadata.get('trained_at', 'unknown')} | "
                f"Dataset: {metadata['dataset'].get('filename', 'unknown')} | "
                f"Features: {metadata['dataset'].get('num_features')} | "
                f"Classes: {metadata['dataset'].get('num_classes')}"
            )
        else:
            logger.warning(
                "model_metadata.json not found. "
                "Re-run `python run_training.py` to generate versioning metadata."
            )

    @property
    def models_loaded(self) -> bool:
        """Return True if all three models have been loaded successfully."""
        return self._models_loaded

    def _aligned_proba(self, model, feature_vector: np.ndarray, n_classes: int) -> np.ndarray:
        """
        Return a model's class probabilities aligned to LabelEncoder index order.

        A model's predict_proba() output is ordered by its own ``classes_``
        attribute, which is not guaranteed to cover every label or to be in
        index order. This maps each probability back to its absolute class
        index so probabilities from different models can be summed safely.

        Args:
            model: A fitted classifier exposing predict_proba().
            feature_vector (np.ndarray): A (1, n_features) scaled array.
            n_classes (int): Total number of classes known to the LabelEncoder.

        Returns:
            np.ndarray: A (n_classes,) probability vector in label-index order.
        """
        raw = np.asarray(model.predict_proba(feature_vector)[0], dtype=float)
        aligned = np.zeros(n_classes, dtype=float)

        model_classes = getattr(model, "classes_", None)
        if model_classes is not None and len(model_classes) == len(raw):
            for position, class_label in enumerate(model_classes):
                aligned[int(class_label)] = raw[position]
        else:
            # Fallback: assume raw is already in index order
            aligned[: len(raw)] = raw

        return aligned

    def _overlap_score(self, condition: str, entered_symptoms: list) -> float:
        """
        Return the fraction of entered symptoms that appear in the condition's
        known symptom set.

        A score of 0.0 means none of the entered symptoms are associated with
        this condition in the training data — it should not surface as a top
        answer regardless of what the model's probability says.

        Args:
            condition (str): The class name to check against.
            entered_symptoms (list[str]): Symptoms the user submitted.

        Returns:
            float: Overlap fraction in [0.0, 1.0], or 1.0 if the map is absent
                   (i.e. plausibility filtering is disabled → no penalty).
        """
        if not self._condition_symptoms or not entered_symptoms:
            return 1.0
        known = self._condition_symptoms.get(condition, set())
        if not known:
            return 1.0   # Unknown condition — don't penalise
        matches = sum(1 for s in entered_symptoms if s in known)
        return matches / len(entered_symptoms)

    def predict_all(self, feature_vector: np.ndarray, entered_symptoms: list = None) -> dict:
        """
        Run all three models on the provided feature vector and combine them
        into a soft-voting ensemble result.

        Why soft voting instead of trusting one model:
        the previous implementation took final_prediction from XGBoost
        unconditionally. Averaging the class probabilities across all three
        models removes that arbitrary choice and lets a confident majority
        outweigh a single dissenting model. Per-model F1 scores are reported
        in model_metadata.json (generated by run_training.py) and surfaced
        through GET /api/v1/health.

        For each model the method:
          1. Calls predict_proba() and aligns the output to label-index order.
          2. Takes argmax as that model's prediction, so the reported prediction
             and confidence are always mutually consistent.
          3. Decodes the index to a class name via preprocessor_service.

        Args:
            feature_vector (np.ndarray): A (1, n_features) scaled array as
                                         returned by preprocessor_service.preprocess().

        Returns:
            dict: {
                "comparison": {
                    "<model name>": {"prediction": str, "confidence": float}, ...
                },
                "final_prediction": str,
                "final_prediction_source": str,
                "ensemble_confidence": float,
                "confidence_level": "high" | "moderate" | "low",
                "low_confidence": bool,
                "model_agreement": bool,
                "agreement_count": int,
                "total_models": int,
                "agreeing_models": list[str],
                "differentials": [{"condition": str, "probability": float, "overlap": float}, ...],
                "plausibility_warning": bool,
                "top_overlap": float,
            }

        Raises:
            RuntimeError: If load_models() has not been called before this method.
        """
        if not self._models_loaded:
            raise RuntimeError(
                "Models have not been loaded. Call load_models() before predict_all()."
            )

        class_names = preprocessor_service.classes
        n_classes = len(class_names)

        comparison = {}
        probability_sum = np.zeros(n_classes, dtype=float)

        for display_name, model in self._models.items():
            aligned = self._aligned_proba(model, feature_vector, n_classes)
            probability_sum += aligned

            predicted_index = int(np.argmax(aligned))
            comparison[display_name] = {
                "prediction": class_names[predicted_index],
                "confidence": round(float(aligned[predicted_index]), 4),
            }

        # --- Soft vote: mean probability across all models ---
        ensemble_probabilities = probability_sum / len(self._models)

        # --- Plausibility-aware ranking ---
        # The raw ensemble can surface conditions that share a few generic symptoms
        # (e.g. mild_fever, nausea) with many diseases, causing unrelated conditions
        # to rank highly on vague input. We compute a symptom-overlap score for each
        # candidate and use it to re-rank: a condition with zero overlap with the
        # entered symptoms is moved below conditions that have at least some.
        #
        # We do NOT zero-out probabilities — the model's signal is preserved for
        # the comparison table. We only reorder the final answer and differentials.
        symptoms_for_filter = entered_symptoms or []

        # Plausibility-weighted score: prob * (overlap + epsilon)
        # epsilon prevents a zero-overlap condition from being chosen only if a
        # plausible alternative exists.
        EPSILON = 0.05
        plausibility_scores = np.zeros(len(class_names), dtype=float)
        for idx, name in enumerate(class_names):
            overlap = self._overlap_score(name, symptoms_for_filter)
            plausibility_scores[idx] = ensemble_probabilities[idx] * (overlap + EPSILON)

        # Final prediction: argmax of plausibility-weighted scores
        final_index = int(np.argmax(plausibility_scores))
        final_prediction = class_names[final_index]
        ensemble_confidence = round(float(ensemble_probabilities[final_index]), 4)
        top_overlap = round(self._overlap_score(final_prediction, symptoms_for_filter), 4)
        plausibility_warning = top_overlap < PLAUSIBILITY_MIN_OVERLAP

        if plausibility_warning:
            logger.warning(
                f"Plausibility warning: '{final_prediction}' has only "
                f"{top_overlap:.0%} symptom overlap with entered symptoms. "
                f"Result may be unreliable."
            )

        # --- Agreement: how many individual models back the ensemble answer ---
        agreeing_models = [
            name
            for name, result in comparison.items()
            if result["prediction"] == final_prediction
        ]
        agreement_count = len(agreeing_models)
        total_models = len(comparison)

        # --- Confidence banding ---
        if ensemble_confidence >= CONFIDENCE_HIGH:
            confidence_level = "high"
        elif ensemble_confidence >= CONFIDENCE_MODERATE:
            confidence_level = "moderate"
        else:
            confidence_level = "low"

        # --- Ranked differentials ---
        # Use plausibility-weighted scores for ranking, but report raw probability.
        # Attach overlap score per differential so the UI can flag low-overlap entries.
        top_indices = np.argsort(plausibility_scores)[::-1][:DIFFERENTIAL_COUNT]
        differentials = [
            {
                "condition": class_names[int(i)],
                "probability": round(float(ensemble_probabilities[int(i)]), 4),
                "overlap": round(self._overlap_score(class_names[int(i)], symptoms_for_filter), 4),
            }
            for i in top_indices
            if ensemble_probabilities[int(i)] > 0
        ]

        return {
            "comparison": comparison,
            "final_prediction": final_prediction,
            "final_prediction_source": "Soft-voting ensemble (mean probability)",
            "ensemble_confidence": ensemble_confidence,
            "confidence_level": confidence_level,
            "low_confidence": confidence_level == "low",
            "model_agreement": agreement_count == total_models,
            "agreement_count": agreement_count,
            "total_models": total_models,
            "agreeing_models": agreeing_models,
            "differentials": differentials,
            "plausibility_warning": plausibility_warning,
            "top_overlap": top_overlap,
        }


# Module-level singleton — imported by routes and app.py
ml_service = MLService()
