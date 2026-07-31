"""
preprocessor.py
---------------
Provides the PreprocessorService class responsible for:
  - Loading serialized artifacts (scaler, label encoder, feature list) lazily
    on the first call and caching them in memory for all subsequent calls.
  - Transforming a raw list of symptom strings into a scaled feature vector
    ready for model inference.
  - Decoding a numeric prediction back to a human-readable infection name.
"""

import os
import pickle

import numpy as np
import pandas as pd


# Absolute path to the backend/models/ directory, resolved relative to this file
_MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")


class PreprocessorService:
    """
    Handles feature engineering and artifact management for the AMR Shield
    prediction pipeline.

    Artifacts are loaded lazily: the first call to preprocess() or
    encode_label() triggers load_artifacts(), and the loaded objects are
    cached as instance attributes for all subsequent calls.
    """

    def __init__(self):
        """Initialise the service with empty artifact slots."""
        self._scaler = None
        self._label_encoder = None
        self._features = None
        self._artifacts_loaded = False

    def load_artifacts(self) -> None:
        """
        Load scaler.pkl, label_encoder.pkl, and features.pkl from
        backend/models/ into memory.

        Raises:
            FileNotFoundError: If any of the three artifact files are missing.
            Exception: Re-raises any pickle deserialization error with context.
        """
        scaler_path = os.path.join(_MODELS_DIR, "scaler.pkl")
        encoder_path = os.path.join(_MODELS_DIR, "label_encoder.pkl")
        features_path = os.path.join(_MODELS_DIR, "features.pkl")

        for path, label in [
            (scaler_path, "scaler.pkl"),
            (encoder_path, "label_encoder.pkl"),
            (features_path, "features.pkl"),
        ]:
            if not os.path.isfile(path):
                raise FileNotFoundError(
                    f"Artifact not found: {path}. "
                    f"Run the model_training notebook to generate {label}."
                )

        with open(scaler_path, "rb") as f:
            self._scaler = pickle.load(f)

        with open(encoder_path, "rb") as f:
            self._label_encoder = pickle.load(f)

        with open(features_path, "rb") as f:
            self._features = pickle.load(f)

        self._artifacts_loaded = True

    def _ensure_loaded(self) -> None:
        """
        Trigger lazy loading of artifacts if they have not been loaded yet.
        This is called internally before any operation that requires artifacts.
        """
        if not self._artifacts_loaded:
            self.load_artifacts()

    @property
    def features(self) -> list:
        """
        The ordered list of training feature (symptom) names.

        This is the single source of truth for which symptom strings the models
        accept. The frontend fetches it via GET /api/v1/symptoms rather than
        hardcoding its own list, which previously allowed the two lists to drift.

        Returns:
            list[str]: A copy of the feature name list, in training order.
        """
        self._ensure_loaded()
        return list(self._features)

    @property
    def num_features(self) -> int:
        """Number of feature columns the models were trained on."""
        self._ensure_loaded()
        return len(self._features)

    @property
    def classes(self) -> list:
        """
        The ordered list of target class names as learned by the LabelEncoder.

        Index position corresponds to the numeric label used by the models, so
        classes[i] is the name for numeric label i.

        Returns:
            list[str]: A copy of the class name list.
        """
        self._ensure_loaded()
        return [str(c) for c in self._label_encoder.classes_]

    @property
    def num_classes(self) -> int:
        """Number of target classes the models can predict."""
        self._ensure_loaded()
        return len(self._label_encoder.classes_)

    def preprocess(self, symptoms_list: list) -> np.ndarray:
        """
        Convert a list of symptom strings into a scaled feature vector.

        Steps:
          1. Create a zero-filled numpy array with one element per training
             feature column.
          2. For each symptom in symptoms_list that matches a known feature
             column, set the corresponding element to 1.0.
          3. Apply the loaded StandardScaler to normalise the vector.
          4. Return the 2-D array expected by scikit-learn / XGBoost predictors.

        Args:
            symptoms_list (list): A list of symptom name strings, e.g.
                                  ["fever", "cough", "dysuria"].

        Returns:
            np.ndarray: A (1, n_features) scaled array ready for prediction.

        Raises:
            FileNotFoundError: Propagated from load_artifacts() if pkl files
                               are missing.
        """
        self._ensure_loaded()

        # Build a zero vector aligned to the training feature columns
        feature_vector = np.zeros(len(self._features), dtype=float)

        # Activate features that match the provided symptoms
        for symptom in symptoms_list:
            if symptom in self._features:
                idx = self._features.index(symptom)
                feature_vector[idx] = 1.0

        # The scaler was fitted on a named DataFrame, so transform it with one.
        # Passing a bare ndarray works but emits a "X does not have valid feature
        # names" warning on every request, and it silently relies on column order
        # matching rather than verifying it.
        frame = pd.DataFrame([feature_vector], columns=self._features)

        # Apply the StandardScaler fitted during training
        scaled_vector = self._scaler.transform(frame)

        return scaled_vector

    def encode_label(self, numeric_label: int) -> str:
        """
        Convert a numeric class index back to the original infection name.

        Args:
            numeric_label (int): The integer class index returned by a model's
                                 predict() call.

        Returns:
            str: The human-readable infection / disease name, e.g. "UTI".

        Raises:
            FileNotFoundError: Propagated from load_artifacts() if pkl files
                               are missing.
            ValueError: If numeric_label is outside the range of known classes.
        """
        self._ensure_loaded()

        classes = self._label_encoder.classes_
        if numeric_label < 0 or numeric_label >= len(classes):
            raise ValueError(
                f"numeric_label {numeric_label} is out of range for "
                f"{len(classes)} known classes."
            )

        return str(classes[numeric_label])


# Module-level singleton — imported and used by ml_service and routes
preprocessor_service = PreprocessorService()
