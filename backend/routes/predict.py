"""
predict.py
----------
Defines the /api/v1/predict endpoint.

Accepts a JSON body containing a list of symptom strings, validates every
item in the list, runs the full preprocessing and soft-voting inference
pipeline, and returns a structured comparison of all three model predictions
along with a ranked differential list and any unrecognized symptom strings.
"""

import logging
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from backend.services.ml_service import ml_service
from backend.utils.preprocessor import preprocessor_service
from backend.services.db_service import save_prediction

predict_bp = Blueprint("predict", __name__)

logger = logging.getLogger(__name__)

# Upper bound on the symptoms list. The training data averages ~4 symptoms per
# case and the feature space is 131 wide, so a request with hundreds of entries
# is either a mistake or an abuse attempt. Capping it also bounds request cost.
MAX_SYMPTOMS = 40

# Minimum recognized symptoms required for a meaningful prediction. Below this
# the models have too little signal to discriminate between 41 classes.
MIN_SYMPTOMS = 3


@predict_bp.route("/predict", methods=["POST"])
def predict():
    """
    POST /api/v1/predict

    Request body (JSON):
        {
            "symptoms": ["itching", "skin_rash", "high_fever"]
        }

    Validation rules:
        - Request body must be valid JSON.
        - The "symptoms" key must be present.
        - The value of "symptoms" must be a non-empty list of at most
          MAX_SYMPTOMS items.
        - Every item in the list must be a non-empty string.
        - At least MIN_SYMPTOMS items must match a known training feature.

    Success response (HTTP 200):
        {
            "status": "success",
            "comparison": { "<model>": {"prediction": str, "confidence": float}, ... },
            "final_prediction": str,
            "final_prediction_source": "Soft-voting ensemble (mean probability)",
            "ensemble_confidence": float,
            "confidence_level": "high" | "moderate" | "low",
            "low_confidence": bool,
            "model_agreement": bool,
            "agreement_count": int,
            "total_models": int,
            "agreeing_models": [str],
            "differentials": [{"condition": str, "probability": float}],
            "recognized_symptoms": [str],
            "unrecognized_symptoms": [str],
            "timestamp": "2024-01-01T00:00:00.000000+00:00"
        }

    Error responses:
        HTTP 400 — Missing, invalid, or malformed "symptoms" field.
        HTTP 503 — Models not loaded yet (training has not been run).
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

    if not isinstance(body, dict):
        logger.warning("Predict request rejected: body is not a JSON object.")
        return (
            jsonify({"status": "error", "message": "Request body must be a JSON object."}),
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

    # --- Validate list length ceiling ---
    if len(symptoms) > MAX_SYMPTOMS:
        logger.warning(
            f"Predict request rejected: {len(symptoms)} symptoms exceeds "
            f"the maximum of {MAX_SYMPTOMS}."
        )
        return (
            jsonify(
                {
                    "status": "error",
                    "message": (
                        f'"symptoms" may contain at most {MAX_SYMPTOMS} items. '
                        f"Received {len(symptoms)}."
                    ),
                }
            ),
            400,
        )

    # --- Validate every item in the list is a non-empty string ---
    invalid_items = [
        {"index": i, "value": item if isinstance(item, (str, int, float, bool)) else None}
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

    # Normalise: strip whitespace, then de-duplicate while preserving order.
    # Duplicates are harmless to the model (the feature is binary) but they
    # inflate the counts reported back to the user.
    seen = set()
    symptoms = [
        s for s in (raw.strip() for raw in symptoms) if not (s in seen or seen.add(s))
    ]

    # --- Guard: models must be loaded before inference ---
    if not ml_service.models_loaded:
        logger.error("Predict request rejected: models not loaded.")
        return (
            jsonify(
                {
                    "status": "error",
                    "message": (
                        "Models are not loaded. "
                        "Run `python run_training.py` and restart the server."
                    ),
                }
            ),
            503,
        )

    # --- Identify recognized vs unrecognized symptoms ---
    try:
        known_features = set(preprocessor_service.features)
    except FileNotFoundError as exc:
        logger.error(f"Predict request failed — artifacts missing: {exc}")
        return (
            jsonify(
                {
                    "status": "error",
                    "message": (
                        "Model artifacts are not available. "
                        "Run `python run_training.py` and restart the server."
                    ),
                }
            ),
            503,
        )

    recognized_symptoms = [s for s in symptoms if s in known_features]
    unrecognized_symptoms = [s for s in symptoms if s not in known_features]

    if unrecognized_symptoms:
        logger.warning(
            f"Unrecognized symptoms in request (will be ignored): {unrecognized_symptoms}"
        )

    if len(recognized_symptoms) < MIN_SYMPTOMS:
        logger.warning(
            f"Predict request rejected: only {len(recognized_symptoms)} recognized "
            f"symptom(s), minimum is {MIN_SYMPTOMS}."
        )
        return (
            jsonify(
                {
                    "status": "error",
                    "message": (
                        f"At least {MIN_SYMPTOMS} recognized symptoms are required. "
                        f"Received {len(recognized_symptoms)}. Symptom strings must "
                        f"match the training feature names returned by "
                        f"GET /api/v1/symptoms."
                    ),
                    "recognized_symptoms": recognized_symptoms,
                    "unrecognized_symptoms": unrecognized_symptoms,
                }
            ),
            400,
        )

    # --- Preprocess and run inference ---
    # Wrapped because a corrupt or version-mismatched artifact surfaces here,
    # and an unhandled exception would otherwise return an HTML error page.
    try:
        feature_vector = preprocessor_service.preprocess(recognized_symptoms)
        result = ml_service.predict_all(feature_vector, entered_symptoms=recognized_symptoms)
    except Exception as exc:
        logger.exception(f"Inference failed: {exc}")
        return (
            jsonify(
                {
                    "status": "error",
                    "message": (
                        "Inference failed unexpectedly. This usually means the "
                        "model artifacts were built with a different library "
                        "version than the server is running. Re-run "
                        "`python run_training.py` and restart."
                    ),
                }
            ),
            500,
        )

    logger.info(
        f"Prediction complete — final: '{result['final_prediction']}' "
        f"({result['confidence_level']} confidence, "
        f"{result['ensemble_confidence']}), "
        f"agreement: {result['agreement_count']}/{result['total_models']}, "
        f"recognized: {len(recognized_symptoms)}/{len(symptoms)} symptoms."
    )

    # --- Build and return response ---
    response = {
        "status": "success",
        "comparison": result["comparison"],
        "final_prediction": result["final_prediction"],
        "final_prediction_source": result["final_prediction_source"],
        "ensemble_confidence": result["ensemble_confidence"],
        "confidence_level": result["confidence_level"],
        "low_confidence": result["low_confidence"],
        "model_agreement": result["model_agreement"],
        "agreement_count": result["agreement_count"],
        "total_models": result["total_models"],
        "agreeing_models": result["agreeing_models"],
        "differentials": result["differentials"],
        "plausibility_warning": result["plausibility_warning"],
        "top_overlap": result["top_overlap"],
        "recognized_symptoms": recognized_symptoms,
        "unrecognized_symptoms": unrecognized_symptoms,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    # --- Persist to MySQL (non-blocking — failure never breaks the response) ---
    country_code = body.get("country_code") if isinstance(body, dict) else None
    save_prediction(
        symptoms=recognized_symptoms,
        prediction=result["final_prediction"],
        confidence=result["ensemble_confidence"],
        agreement=result["agreement_count"],
        total_models=result["total_models"],
        country_code=country_code,
        full_result=response,
    )

    return jsonify(response), 200
