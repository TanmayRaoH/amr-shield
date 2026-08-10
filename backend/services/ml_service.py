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

    def predict_all(self, feature_vector: np.ndarray) -> dict:
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
                "differentials": [{"condition": str, "probability": float}, ...],
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
        final_index = int(np.argmax(ensemble_probabilities))
        final_prediction = class_names[final_index]
        ensemble_confidence = round(float(ensemble_probabilities[final_index]), 4)

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

        # --- Ranked differentials (top N by ensemble probability) ---
        top_indices = np.argsort(ensemble_probabilities)[::-1][:DIFFERENTIAL_COUNT]
        differentials = [
            {
                "condition": class_names[int(i)],
                "probability": round(float(ensemble_probabilities[int(i)]), 4),
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
        }


# Module-level singleton — imported by routes and app.py
ml_service = MLService()
