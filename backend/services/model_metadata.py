"""
model_metadata.py
-----------------
Manages a model_metadata.json file in backend/models/ that records when
models were last trained, which dataset was used, and the package versions
they were trained with.

This prevents silent model/code version mismatches and gives operators a
clear audit trail without requiring a full MLflow or DVC setup.

Written to disk by the training notebook (via write_metadata()).
Read at startup by MLService (via read_metadata()).
"""

import json
import os
from datetime import datetime, timezone
from typing import Optional

_MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
_METADATA_PATH = os.path.join(_MODELS_DIR, "model_metadata.json")


def write_metadata(
    dataset_filename: str,
    dataset_rows: int,
    unique_patterns: int,
    num_features: int,
    num_classes: int,
    sklearn_version: str,
    xgboost_version: str,
    model_scores: dict,
    model_scores_weighted: Optional[dict] = None,
) -> None:
    """
    Write a model_metadata.json file to backend/models/.

    Called at the end of the training script after all pkl files are saved.

    Args:
        dataset_filename (str): Name of the CSV file used for training.
        dataset_rows (int): Total number of rows in the CSV (including duplicates).
        unique_patterns (int): Number of distinct binary feature vectors.
        num_features (int): Number of feature columns used.
        num_classes (int): Number of unique target classes.
        sklearn_version (str): scikit-learn version string at training time.
        xgboost_version (str): xgboost version string at training time.
        model_scores (dict): Dict of {model_name: mean_f1_macro} from GroupKFold CV.
        model_scores_weighted (dict | None): Dict of {model_name: mean_f1_weighted}.
    """
    metadata = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "dataset": {
            "filename": dataset_filename,
            "total_rows": dataset_rows,
            "unique_patterns": unique_patterns,
            "num_features": num_features,
            "num_classes": num_classes,
            "note": (
                "total_rows reflects all CSV rows (each unique symptom combination "
                "repeated ~120x). unique_patterns is the number of distinct binary "
                "feature vectors. CV uses GroupKFold keyed on unique_patterns so no "
                "pattern appears in both train and validation folds."
            ),
        },
        "versions": {
            "scikit_learn": sklearn_version,
            "xgboost": xgboost_version,
        },
        "cross_validation_f1_macro": model_scores,
        "cross_validation_f1_weighted": model_scores_weighted or {},
    }

    os.makedirs(_MODELS_DIR, exist_ok=True)
    with open(_METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)


def read_metadata() -> Optional[dict]:
    """
    Read and return the model_metadata.json file if it exists.

    Returns:
        dict: The metadata dict, or None if the file does not exist.
    """
    if not os.path.isfile(_METADATA_PATH):
        return None
    with open(_METADATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def metadata_exists() -> bool:
    """Return True if model_metadata.json exists in backend/models/."""
    return os.path.isfile(_METADATA_PATH)
