"""
health.py
---------
Defines the /api/v1/health endpoint.

Returns a lightweight status payload that can be polled by load balancers,
monitoring tools, or the frontend to confirm the API is alive, that the ML
models have been loaded, and when they were last trained.
"""

from datetime import datetime, timezone

from flask import Blueprint, jsonify

from backend.services.ml_service import ml_service
from backend.services.model_metadata import read_metadata

health_bp = Blueprint("health", __name__)


@health_bp.route("/health", methods=["GET"])
def health_check():
    """
    GET /api/v1/health

    Returns a JSON payload indicating the current health of the service.

    Response body:
        {
            "status":        "healthy",
            "models_loaded": true | false,
            "version":       "1.0.0",
            "timestamp":     "2024-01-01T00:00:00.000000+00:00",
            "model_metadata": {
                "trained_at": "...",
                "dataset": { ... },
                "versions": { ... },
                "cross_validation_f1_macro": { ... }
            } | null
        }

    HTTP status codes:
        200 — Service is running (models may or may not be loaded).
    """
    metadata = read_metadata()

    payload = {
        "status": "healthy",
        "models_loaded": ml_service.models_loaded,
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "model_metadata": metadata,
    }
    return jsonify(payload), 200
