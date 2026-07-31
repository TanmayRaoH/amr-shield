"""
symptoms.py
-----------
Defines the /api/v1/symptoms endpoint.

Serves the exact feature list the models were trained on, straight from
features.pkl. The frontend uses this as the source of truth for its symptom
picker instead of maintaining a parallel hardcoded list.

This exists because the two lists had already drifted: the frontend offered
"dischromic_patches" and "spotting_urination" while the trained features are
"dischromic__patches" and "spotting__urination" (double underscore, produced by
stray spaces in the raw CSV). Those two chips could never match and were
silently discarded on every request.
"""

import logging
from datetime import datetime, timezone

from flask import Blueprint, jsonify

from backend.utils.preprocessor import preprocessor_service

symptoms_bp = Blueprint("symptoms", __name__)

logger = logging.getLogger(__name__)


@symptoms_bp.route("/symptoms", methods=["GET"])
def list_symptoms():
    """
    GET /api/v1/symptoms

    Success response (HTTP 200):
        {
            "status": "success",
            "count": 131,
            "symptoms": ["abdominal_pain", "abnormal_menstruation", ...],
            "conditions": ["AIDS", "Acne", ...],
            "condition_count": 41,
            "timestamp": "..."
        }

    Error responses:
        HTTP 503 — Artifacts not present yet (training has not been run).
    """
    try:
        payload = {
            "status": "success",
            "count": preprocessor_service.num_features,
            "symptoms": preprocessor_service.features,
            "conditions": preprocessor_service.classes,
            "condition_count": preprocessor_service.num_classes,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        return jsonify(payload), 200

    except FileNotFoundError as exc:
        logger.error(f"Symptoms request failed — artifacts missing: {exc}")
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
