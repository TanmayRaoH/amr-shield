"""
ml_service.py
-------------
Provides the MLService class responsible for:
  - Loading all three trained models (Logistic Regression, Random Forest,
    XGBoost) eagerly at application startup.
  - Running all three models on a single feature vector and returning a
    structured comparison dict along with a final prediction and a
    model-agreement flag.
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
                    f"Run the model_training notebook to generate {filename}."
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
                "Re-run the training notebook to generate versioning metadata."
            )

    @property
    def models_loaded(self) -> bool:
        """Return True if all three models have been loaded successfully."""
        return self._models_loaded

    def predict_all(self, feature_vector: np.ndarray) -> dict:
        """
        Run all three models on the provided feature vector and return a
        structured result dict.

        For each model the method:
          1. Calls predict() to obtain the numeric class index.
          2. Decodes the index to an infection name via preprocessor_service.
          3. Calls predict_proba() and takes the max probability as the
             confidence score, cast to Python float and rounded to 4 d.p.

        The final_prediction is taken from XGBoost. model_agreement is True
        only when all three models return the same infection name.

        Args:
            feature_vector (np.ndarray): A (1, n_features) scaled array as
                                         returned by preprocessor_service.preprocess().

        Returns:
            dict: {
                "comparison": {
                    "Logistic Regression": {"prediction": str, "confidence": float},
                    "Random Forest":       {"prediction": str, "confidence": float},
                    "XGBoost":             {"prediction": str, "confidence": float},
                },
                "final_prediction": str,
                "model_agreement": bool,
            }

        Raises:
            RuntimeError: If load_models() has not been called before this method.
        """
        if not self._models_loaded:
            raise RuntimeError(
                "Models have not been loaded. Call load_models() before predict_all()."
            )

        comparison = {}
        predictions = []

        for display_name, model in self._models.items():
            # Numeric class index → infection name string
            numeric_label = int(model.predict(feature_vector)[0])
            infection_name = preprocessor_service.encode_label(numeric_label)

            # Max class probability, cast to Python float to ensure JSON serialisability
            confidence = round(float(max(model.predict_proba(feature_vector)[0])), 4)

            comparison[display_name] = {
                "prediction": infection_name,
                "confidence": confidence,
            }
            predictions.append(infection_name)

        # XGBoost is the authoritative final prediction
        final_prediction = comparison["XGBoost"]["prediction"]

        # All three models must agree for model_agreement to be True
        model_agreement = len(set(predictions)) == 1

        return {
            "comparison": comparison,
            "final_prediction": final_prediction,
            "model_agreement": model_agreement,
        }


# Module-level singleton — imported by routes and app.py
ml_service = MLService()
