"""
predict.py
----------
Defines the /api/v1/predict endpoint.

Accepts a JSON body containing a list of symptom strings, validates every
item in the list, runs the full preprocessing and multi-model inference
pipeline, and returns a structured comparison of all three model predictions
along with a list of any unrecognized symptom strings.
"""

import logging
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, request

from backend.services.ml_service import ml_service
from backend.utils.preprocessor import preprocessor_service

predict_bp = Blueprint("predict", __name__)

logger = logging.getLogger(__name__)


@predict_bp.route("/predict", methods=["POST"])
def predict():
    """
    POST /api/v1/predict

    Request body (JSON):
        {
            "symptoms": ["itching", "skin_rash", "fever"]
        }

    Validation rules:
        - Request body must be valid JSON.
        - The "symptoms" key must be present.
        - The value of "symptoms" must be a non-empty list.
        - Every item in the list must be a non-empty string.

    Success response (HTTP 200):
        {
            "status": "success",
            "comparison": {
                "Logistic Regression": {"prediction": "...", "confidence": 0.0000},
                "Random Forest":       {"prediction": "...", "confidence": 0.0000},
                "XGBoost":             {"prediction": "...", "confidence": 0.0000}
            },
            "final_prediction": "...",
            "model_agreement": true | false,
            "recognized_symptoms": ["itching", "skin_rash"],
            "unrecognized_symptoms": ["fever"],
            "timestamp": "2024-01-01T00:00:00.000000+00:00"
        }

    Error responses:
        HTTP 400 — Missing, invalid, or malformed "symptoms" field.
        HTTP 503 — Models not loaded yet (notebook not run).
        HTTP 500 — Unexpected server-side error during inference.
    """
    # --- Parse request body ---
    body = request.get_json(silent=True)

    if body is None:
        logger.warning("Predict request rejected: body is not valid JSON.")
        return (
            jsonify({"status": "error", "message": "Request body must be valid JSON."}),
            400,
        )

    # --- Validate "symptoms" key presence ---
    if "symptoms" not in body:
        logger.warning("Predict request rejected: missing 'symptoms' key.")
        return (
            jsonify(
                {
                    "status": "error",
                    "message": 'Missing required field: "symptoms".',
                }
            ),
            400,
        )

    symptoms = body["symptoms"]

    # --- Validate "symptoms" is a non-empty list ---
    if not isinstance(symptoms, list) or len(symptoms) == 0:
        logger.warning(
            f"Predict request rejected: 'symptoms' is not a non-empty list. "
            f"Received type: {type(symptoms).__name__}."
        )
        return (
            jsonify(
                {
                    "status": "error",
                    "message": '"symptoms" must be a non-empty list of symptom strings.',
                }
            ),
            400,
        )

    # --- Validate every item in the list is a non-empty string ---
    invalid_items = [
        {"index": i, "value": item}
        for i, item in enumerate(symptoms)
        if not isinstance(item, str) or len(item.strip()) == 0
    ]
    if invalid_items:
        logger.warning(
            f"Predict request rejected: {len(invalid_items)} invalid item(s) in symptoms list."
        )
        return (
            jsonify(
                {
                    "status": "error",
                    "message": (
                        "Every item in 'symptoms' must be a non-empty string. "
                        "Invalid items found."
                    ),
                    "invalid_items": invalid_items,
                }
            ),
            400,
        )

    # Normalise: strip whitespace from each symptom string
    symptoms = [s.strip() for s in symptoms]

    # --- Guard: models must be loaded before inference ---
    if not ml_service.models_loaded:
        logger.error("Predict request rejected: models not loaded.")
        return (
            jsonify(
                {
                    "status": "error",
                    "message": (
                        "Models are not loaded. "
                        "Run notebooks/model_training.ipynb and restart the server."
                    ),
                }
            ),
            503,
        )

    # --- Identify recognized vs unrecognized symptoms ---
    # preprocessor_service._features is available after load_artifacts().
    # We call _ensure_loaded() defensively to guarantee it is populated.
    preprocessor_service._ensure_loaded()
    known_features = set(preprocessor_service._features)

    recognized_symptoms = [s for s in symptoms if s in known_features]
    unrecognized_symptoms = [s for s in symptoms if s not in known_features]

    if unrecognized_symptoms:
        logger.warning(
            f"Unrecognized symptoms in request (will be ignored): {unrecognized_symptoms}"
        )

    if len(recognized_symptoms) == 0:
        logger.warning("Predict request: zero recognized symptoms — all inputs unknown.")
        return (
            jsonify(
                {
                    "status": "error",
                    "message": (
                        "None of the provided symptoms are recognized. "
                        "All symptom strings must match training feature names exactly."
                    ),
                    "unrecognized_symptoms": unrecognized_symptoms,
                }
            ),
            400,
        )

    # --- Preprocess ---
    feature_vector = preprocessor_service.preprocess(symptoms)

    # --- Run multi-model inference ---
    result = ml_service.predict_all(feature_vector)

    logger.info(
        f"Prediction complete — final: '{result['final_prediction']}', "
        f"agreement: {result['model_agreement']}, "
        f"recognized: {len(recognized_symptoms)}/{len(symptoms)} symptoms."
    )

    # --- Build and return response ---
    response = {
        "status": "success",
        "comparison": result["comparison"],
        "final_prediction": result["final_prediction"],
        "model_agreement": result["model_agreement"],
        "recognized_symptoms": recognized_symptoms,
        "unrecognized_symptoms": unrecognized_symptoms,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    return jsonify(response), 200
