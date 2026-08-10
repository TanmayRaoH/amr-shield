"""
history.py
----------
GET  /api/v1/history        — return last 50 predictions from MySQL
DELETE /api/v1/history      — clear all prediction history
"""

import logging
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from backend.services.db_service import get_history, delete_history

history_bp = Blueprint("history", __name__)
logger = logging.getLogger(__name__)


@history_bp.route("/history", methods=["GET"])
def get_prediction_history():
    """
    GET /api/v1/history

    Returns the last 50 predictions stored in MySQL, newest first.
    Query param: ?limit=N (max 200)
    """
    try:
        limit = min(int(request.args.get("limit", 50)), 200)
    except ValueError:
        limit = 50

    rows = get_history(limit=limit)
    return jsonify({
        "status": "success",
        "count": len(rows),
        "history": rows,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }), 200


@history_bp.route("/history", methods=["DELETE"])
def clear_prediction_history():
    """DELETE /api/v1/history — wipe all prediction history from MySQL."""
    success = delete_history()
    if success:
        return jsonify({
            "status": "success",
            "message": "Prediction history cleared.",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }), 200
    else:
        return jsonify({
            "status": "error",
            "message": "Failed to clear history. Check server logs.",
        }), 500
