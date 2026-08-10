"""
glass.py
--------
GET /api/v1/glass/<country_code>

Fetches live antimicrobial resistance rates from the WHO Global Health
Observatory (GHO) OData API — the publicly queryable backend that powers
the WHO GLASS dashboard at data.who.int/dashboards/amr.

Two indicators are available and mapped to conditions in this project:

  AMR_INFECT_ECOLI  — % of bloodstream infections due to E. coli resistant
                      to 3rd-generation cephalosporins. Relevant for UTI,
                      Pneumonia, Typhoid.

  AMR_INFECT_MRSA   — % of bloodstream infections due to methicillin-
                      resistant Staphylococcus aureus. Relevant for Impetigo
                      and skin infections.

The GHO API requires no authentication and returns JSON via OData protocol.
Responses are cached in-process for CACHE_TTL_HOURS to avoid hammering the
WHO endpoint on every prediction.

Fallback: if the requested country has no GLASS data, the endpoint returns
the most recent data point from any available year, or a null value. The
frontend falls back to the embedded GLASS 2022 global averages in that case.
"""

import logging
import time
from datetime import datetime, timezone

import requests
from flask import Blueprint, jsonify, request

from backend.config import Config
from backend.services.db_service import get_glass_cache, set_glass_cache

glass_bp = Blueprint("glass", __name__)
logger = logging.getLogger(__name__)

# ── GHO API ───────────────────────────────────────────────────────────────────
GHO_BASE = "https://ghoapi.azureedge.net/api"
REQUEST_TIMEOUT = 8  # seconds — WHO API is generally fast

# ── Indicators tracked ────────────────────────────────────────────────────────
# Only two GLASS indicators have broad country coverage in GHO as of 2025.
# More indicators exist (e.g. Klebsiella, Acinetobacter) but are sparsely
# populated and not useful for this project's condition set.
INDICATORS = {
    "AMR_INFECT_ECOLI": {
        "label": "E. coli resistant to 3rd-gen cephalosporins",
        "pathogen": "Escherichia coli",
        "specimen": "Bloodstream infection",
        "conditions": [
            "Urinary tract infection",
            "Pneumonia",
            "Typhoid",
            "Gastroenteritis",
        ],
        "antibiotics_affected": ["Ceftriaxone", "Cefixime", "Amoxicillin"],
    },
    "AMR_INFECT_MRSA": {
        "label": "MRSA (methicillin-resistant Staphylococcus aureus)",
        "pathogen": "Staphylococcus aureus",
        "specimen": "Bloodstream infection",
        "conditions": ["Impetigo", "Acne"],
        "antibiotics_affected": ["Flucloxacillin", "Clindamycin"],
    },
}

# ── In-process fallback cache ─────────────────────────────────────────────────
# Used only if MySQL is unavailable. Keyed by "{indicator}:{country}".
_mem_cache: dict = {}


def _cache_key(indicator: str, country: str) -> str:
    return f"{indicator}:{country.upper()}"


def _fetch_indicator(indicator_code: str, country_code: str) -> dict | None:
    """
    Query the GHO OData API for the most recent data point.
    Tries DB cache first, then in-memory, then live API.
    Writes result back to both caches on a live fetch.
    """
    key = _cache_key(indicator_code, country_code)

    # 1. Try MySQL cache
    cached = get_glass_cache(key)
    if cached:
        logger.debug(f"GLASS DB cache hit: {key}")
        return {
            "indicator_code": indicator_code,
            "country_code": country_code.upper(),
            "resistance_pct": cached["resistance_pct"],
            "year": cached["year"],
            "source": "WHO GHO / GLASS (cached)",
            "source_url": "https://data.who.int/dashboards/amr",
        }

    # 2. Try in-memory fallback cache
    if key in _mem_cache:
        entry = _mem_cache[key]
        age = time.time() - entry["fetched_at"]
        if age < Config.CACHE_TTL_HOURS * 3600:
            logger.debug(f"GLASS memory cache hit: {key}")
            return entry["data"]

    # 3. Live fetch from WHO GHO API
    url = (
        f"{GHO_BASE}/{indicator_code}"
        f"?$filter=SpatialDim eq '{country_code.upper()}'"
        f"&$orderby=TimeDim desc&$top=1"
    )

    try:
        resp = requests.get(url, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        records = resp.json().get("value", [])

        if not records:
            logger.info(f"GLASS: no data for {indicator_code}/{country_code}")
            result = None
        else:
            rec = records[0]
            result = {
                "indicator_code": indicator_code,
                "country_code": country_code.upper(),
                "resistance_pct": round(float(rec["NumericValue"]), 2)
                    if rec["NumericValue"] is not None else None,
                "year": rec["TimeDim"],
                "source": "WHO GHO / GLASS (live)",
                "source_url": "https://data.who.int/dashboards/amr",
            }
            logger.info(
                f"GLASS live: {indicator_code}/{country_code} "
                f"= {result['resistance_pct']}% ({result['year']})"
            )

        # Write to both caches
        r_pct = result["resistance_pct"] if result else None
        r_yr  = result["year"] if result else None
        set_glass_cache(key, country_code.upper(), indicator_code, r_pct, r_yr)
        _mem_cache[key] = {"data": result, "fetched_at": time.time()}

        return result

    except requests.exceptions.Timeout:
        logger.warning(f"GLASS API timeout for {indicator_code}/{country_code}")
        return None
    except requests.exceptions.RequestException as exc:
        logger.warning(f"GLASS API error for {indicator_code}/{country_code}: {exc}")
        return None


@glass_bp.route("/glass/<country_code>", methods=["GET"])
def glass_data(country_code: str):
    """
    GET /api/v1/glass/<country_code>

    Fetch live WHO GLASS resistance data for a country.

    Path parameter:
        country_code  ISO 3166-1 alpha-3 country code (e.g. IND, GBR, USA, DEU)

    Query parameters:
        condition  (optional) — if provided, only return indicators relevant
                   to that condition rather than all indicators.

    Success response (HTTP 200):
    {
        "status": "success",
        "country_code": "IND",
        "timestamp": "...",
        "data": {
            "AMR_INFECT_ECOLI": {
                "indicator_code": "AMR_INFECT_ECOLI",
                "label": "E. coli resistant to 3rd-gen cephalosporins",
                "pathogen": "Escherichia coli",
                "conditions": ["Urinary tract infection", ...],
                "antibiotics_affected": ["Ceftriaxone", ...],
                "resistance_pct": 80.1,
                "year": 2023,
                "source": "WHO GHO / GLASS (live)",
                "source_url": "https://data.who.int/dashboards/amr"
            },
            ...
        },
        "coverage_note": "Data available for 2 of 2 requested indicators."
    }

    The `resistance_pct` field will be null if the country has no GLASS data
    for that indicator. The frontend should fall back to the embedded GLASS
    2022 global averages in that case.
    """
    country = country_code.upper().strip()

    # Optional filter by condition
    condition_filter = request.args.get("condition", "").strip()

    results = {}
    available = 0

    for code, meta in INDICATORS.items():
        # If condition filter provided, skip indicators not relevant to it
        if condition_filter and condition_filter not in meta["conditions"]:
            continue

        raw = _fetch_indicator(code, country)

        results[code] = {
            "indicator_code": code,
            "label": meta["label"],
            "pathogen": meta["pathogen"],
            "specimen": meta["specimen"],
            "conditions": meta["conditions"],
            "antibiotics_affected": meta["antibiotics_affected"],
            "resistance_pct": raw["resistance_pct"] if raw else None,
            "year": raw["year"] if raw else None,
            "source": raw["source"] if raw else "No GLASS data for this country",
            "source_url": raw.get("source_url") if raw else None,
        }

        if raw and raw["resistance_pct"] is not None:
            available += 1

    total = len(results)
    coverage = f"Data available for {available} of {total} indicator(s)."

    if available == 0:
        coverage += (
            " This country may not be enrolled in WHO GLASS, or data has not "
            "been submitted for the requested indicators. "
            "Showing embedded GLASS 2022 global averages instead."
        )

    return jsonify(
        {
            "status": "success",
            "country_code": country,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": results,
            "coverage_note": coverage,
        }
    ), 200
