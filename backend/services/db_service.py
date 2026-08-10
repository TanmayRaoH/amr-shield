"""
db_service.py
-------------
MySQL persistence layer for AMR Shield.

Provides two functions:
  1. Prediction history — save every prediction to the `prediction_history`
     table so history survives server restarts and is accessible from any
     browser/device via GET /api/v1/history.

  2. GLASS cache — persist WHO GHO API responses to `glass_cache` so
     resistance data survives server restarts and doesn't hit the WHO API
     on every request. Falls back transparently if DB is unavailable.

The module is intentionally defensive: every public function wraps its DB
work in try/except so a MySQL outage never crashes a prediction request.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional

import mysql.connector
from mysql.connector import Error as MySQLError

from backend.config import Config

logger = logging.getLogger(__name__)


def _get_connection():
    """
    Open and return a new MySQL connection using Config credentials.
    Raises MySQLError if the connection cannot be established.
    """
    return mysql.connector.connect(
        host=Config.DB_HOST,
        port=Config.DB_PORT,
        database=Config.DB_NAME,
        user=Config.DB_USER,
        password=Config.DB_PASS,
        connection_timeout=5,
        autocommit=True,
    )


# ── Prediction history ────────────────────────────────────────────────────────

def save_prediction(
    symptoms: list,
    prediction: str,
    confidence: float,
    agreement: int,
    total_models: int,
    country_code: Optional[str],
    full_result: dict,
) -> Optional[int]:
    """
    Persist a completed prediction to the prediction_history table.

    Args:
        symptoms: List of symptom strings sent by the user.
        prediction: The final predicted condition name.
        confidence: Ensemble confidence score (0–1).
        agreement: Number of models that agreed with the final prediction.
        total_models: Total number of models in the ensemble.
        country_code: ISO 3-letter country code if provided, else None.
        full_result: Complete API response dict (stored as JSON).

    Returns:
        The auto-incremented row ID on success, or None on failure.
    """
    try:
        conn = _get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO prediction_history
                (symptoms, prediction, confidence, agreement,
                 total_models, country_code, full_result)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                json.dumps(symptoms),
                prediction,
                confidence,
                agreement,
                total_models,
                country_code,
                json.dumps(full_result),
            ),
        )
        row_id = cursor.lastrowid
        cursor.close()
        conn.close()
        logger.debug(f"Saved prediction id={row_id}: {prediction}")
        return row_id
    except MySQLError as exc:
        logger.warning(f"DB: failed to save prediction — {exc}")
        return None


def get_history(limit: int = 50) -> list:
    """
    Retrieve the most recent predictions from the database.

    Args:
        limit: Maximum number of rows to return (default 50).

    Returns:
        List of dicts, newest first, or empty list on failure.
    """
    try:
        conn = _get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT id, created_at, symptoms, prediction,
                   confidence, agreement, total_models,
                   country_code, full_result
            FROM prediction_history
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (limit,),
        )
        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        result = []
        for row in rows:
            result.append({
                "id": row["id"],
                "timestamp": row["created_at"].isoformat() + "+00:00",
                "symptoms": json.loads(row["symptoms"]),
                "prediction": row["prediction"],
                "confidence": row["confidence"],
                "agreement": row["agreement"],
                "total_models": row["total_models"],
                "country_code": row["country_code"],
                "result": json.loads(row["full_result"]) if row["full_result"] else {},
            })
        return result
    except MySQLError as exc:
        logger.warning(f"DB: failed to fetch history — {exc}")
        return []


def delete_history() -> bool:
    """Delete all rows from prediction_history. Returns True on success."""
    try:
        conn = _get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM prediction_history")
        cursor.close()
        conn.close()
        return True
    except MySQLError as exc:
        logger.warning(f"DB: failed to delete history — {exc}")
        return False


# ── GLASS cache ───────────────────────────────────────────────────────────────

def get_glass_cache(cache_key: str) -> Optional[dict]:
    """
    Look up a GLASS indicator value from the DB cache.

    Args:
        cache_key: String of the form "{indicator_code}:{country_code}".

    Returns:
        Dict with resistance_pct and data_year, or None if not cached
        or if the cached entry is older than CACHE_TTL_HOURS.
    """
    try:
        conn = _get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT resistance_pct, data_year, fetched_at
            FROM glass_cache
            WHERE cache_key = %s
            """,
            (cache_key,),
        )
        row = cursor.fetchone()
        cursor.close()
        conn.close()

        if not row:
            return None

        # Check TTL
        fetched_at = row["fetched_at"]
        if fetched_at.tzinfo is None:
            fetched_at = fetched_at.replace(tzinfo=timezone.utc)
        age_hours = (datetime.now(timezone.utc) - fetched_at).total_seconds() / 3600
        if age_hours > Config.CACHE_TTL_HOURS:
            logger.debug(f"GLASS DB cache expired for {cache_key} (age={age_hours:.1f}h)")
            return None

        return {
            "resistance_pct": row["resistance_pct"],
            "year": row["data_year"],
        }
    except MySQLError as exc:
        logger.warning(f"DB: failed to read GLASS cache — {exc}")
        return None


def set_glass_cache(
    cache_key: str,
    country_code: str,
    indicator_code: str,
    resistance_pct: Optional[float],
    data_year: Optional[int],
) -> None:
    """
    Upsert a GLASS indicator value into the DB cache.

    Uses INSERT ... ON DUPLICATE KEY UPDATE so repeated calls for the
    same cache_key refresh the value without creating duplicate rows.
    """
    try:
        conn = _get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO glass_cache
                (cache_key, country_code, indicator_code,
                 resistance_pct, data_year, fetched_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
            ON DUPLICATE KEY UPDATE
                resistance_pct = VALUES(resistance_pct),
                data_year      = VALUES(data_year),
                fetched_at     = NOW()
            """,
            (cache_key, country_code, indicator_code, resistance_pct, data_year),
        )
        cursor.close()
        conn.close()
        logger.debug(f"GLASS DB cache set: {cache_key} = {resistance_pct}%")
    except MySQLError as exc:
        logger.warning(f"DB: failed to write GLASS cache — {exc}")


def check_connection() -> bool:
    """Return True if the DB is reachable, False otherwise."""
    try:
        conn = _get_connection()
        conn.close()
        return True
    except MySQLError:
        return False
