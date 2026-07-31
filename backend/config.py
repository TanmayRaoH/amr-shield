"""
config.py
---------
Loads all environment variables from the .env file using python-dotenv
and exposes them as module-level constants for use across the application.
"""

import os
from dotenv import load_dotenv

# Load variables from .env into the process environment
load_dotenv()


class Config:
    """
    Central configuration class.

    All values are read from environment variables. If a required variable
    is missing, a descriptive error is raised at import time so the problem
    is caught immediately on startup rather than at the first request.
    """

    # --- Database ---
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: int = int(os.getenv("DB_PORT", "3306"))
    DB_NAME: str = os.getenv("DB_NAME", "amr_shield")
    DB_USER: str = os.getenv("DB_USER", "root")
    DB_PASS: str = os.getenv("DB_PASS", "")

    # --- External APIs ---
    WHO_GLASS_BASE_URL: str = os.getenv(
        "WHO_GLASS_BASE_URL", "https://glass.who.int/api"
    )

    # --- Cache ---
    CACHE_TTL_HOURS: int = int(os.getenv("CACHE_TTL_HOURS", "24"))

    # --- Flask ---
    FLASK_ENV: str = os.getenv("FLASK_ENV", "production")
    PORT: int = int(os.getenv("PORT", "5000"))

    # --- CORS ---
    # Comma-separated list of allowed origins.
    # In development this defaults to localhost React/Vite ports.
    # In production, set this explicitly in .env to your frontend domain.
    CORS_ALLOWED_ORIGINS: list = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173"
        ).split(",")
        if origin.strip()
    ]

    @classmethod
    def is_debug(cls) -> bool:
        """Return True when FLASK_ENV is set to 'development'."""
        return cls.FLASK_ENV.lower() == "development"
