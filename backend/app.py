"""
app.py
------
Flask application factory and entry point for the AMR Shield API.

Responsibilities:
  - Create and configure the Flask app instance.
  - Enable CORS restricted to origins defined in CORS_ALLOWED_ORIGINS (.env).
  - Register the health and predict blueprints under the /api/v1 prefix.
  - Configure structured logging so every request and startup event is recorded.
  - Load all ML models and preprocessing artifacts at startup.
  - Run on waitress (Windows) or gunicorn (Linux/macOS) in production.
"""

import logging
import os
import sys

from flask import Flask, jsonify, request
from flask_cors import CORS

from werkzeug.exceptions import HTTPException

from backend.config import Config
from backend.routes.health import health_bp
from backend.routes.predict import predict_bp
from backend.routes.symptoms import symptoms_bp
from backend.services.ml_service import ml_service
from backend.utils.preprocessor import preprocessor_service


def _configure_logging(app: Flask) -> None:
    """
    Set up structured logging for the application.

    In development, logs at DEBUG level to stdout with timestamps.
    In production, logs at INFO level only.

    Args:
        app (Flask): The Flask application instance to configure.
    """
    log_level = logging.DEBUG if Config.is_debug() else logging.INFO

    # Remove Flask's default handler to avoid duplicate output
    app.logger.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(log_level)
    formatter = logging.Formatter(
        "[%(asctime)s] %(levelname)s in %(module)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)

    app.logger.addHandler(handler)
    app.logger.setLevel(log_level)

    # Also configure the werkzeug request logger at the same level
    logging.getLogger("werkzeug").setLevel(log_level)


def _register_error_handlers(app: Flask) -> None:
    """
    Ensure every error leaves the API as JSON, never as an HTML page.

    Without these handlers Flask returns its default HTML error document, and
    in debug mode that document contains a full stack trace — an information
    leak on a public endpoint. The frontend also cannot parse HTML, so a 500
    would surface to the user as an unhelpful generic failure.

    Args:
        app (Flask): The Flask application instance to configure.
    """

    @app.errorhandler(HTTPException)
    def handle_http_exception(exc: HTTPException):
        """Convert any werkzeug HTTP error (404, 405, 413, ...) into JSON."""
        app.logger.info(f"HTTP {exc.code} on {request.method} {request.path}: {exc.name}")
        return (
            jsonify(
                {
                    "status": "error",
                    "error": exc.name,
                    "message": exc.description,
                }
            ),
            exc.code or 500,
        )

    @app.errorhandler(Exception)
    def handle_unexpected_exception(exc: Exception):
        """
        Catch-all for unhandled exceptions.

        The exception is logged in full server-side, but the client only ever
        receives a generic message so internal details are never exposed.
        """
        app.logger.exception(
            f"Unhandled exception on {request.method} {request.path}: {exc}"
        )
        return (
            jsonify(
                {
                    "status": "error",
                    "error": "Internal Server Error",
                    "message": (
                        "An unexpected server error occurred. "
                        "Check the server logs for details."
                    ),
                }
            ),
            500,
        )


def create_app() -> Flask:
    """
    Application factory.

    Creates the Flask app, configures logging, restricts CORS to allowed
    origins from .env, registers blueprints, and loads all ML artifacts
    so they are ready before the first request arrives.

    Returns:
        Flask: The fully configured Flask application instance.
    """
    app = Flask(__name__)

    # --- Logging ---
    _configure_logging(app)

    # --- CORS ---
    # Origins are loaded from CORS_ALLOWED_ORIGINS in .env.
    # Defaults to localhost:3000 and localhost:5173 (React / Vite dev servers).
    # Never open to all origins (*) — always explicit.
    CORS(app, origins=Config.CORS_ALLOWED_ORIGINS)
    app.logger.info(f"CORS allowed origins: {Config.CORS_ALLOWED_ORIGINS}")

    # --- Blueprints ---
    app.register_blueprint(health_bp, url_prefix="/api/v1")
    app.register_blueprint(predict_bp, url_prefix="/api/v1")
    app.register_blueprint(symptoms_bp, url_prefix="/api/v1")

    # --- Error handlers ---
    _register_error_handlers(app)

    # --- Request logging ---
    @app.before_request
    def log_request() -> None:
        """Log every incoming request method and path."""
        app.logger.debug(f"Incoming request: {request.method} {request.path}")

    @app.after_request
    def log_response(response):
        """Log every outgoing response status."""
        app.logger.debug(
            f"Response: {request.method} {request.path} → {response.status_code}"
        )
        return response

    # --- Load ML artifacts at startup ---
    # Wrapped in try/except so the server starts cleanly before the notebook
    # has been run. The health endpoint reports models_loaded: false in that state.
    try:
        preprocessor_service.load_artifacts()
        ml_service.load_models()
        app.logger.info("ML models and preprocessing artifacts loaded successfully.")
        app.logger.info(f"Models loaded status: {ml_service.models_loaded}")
    except FileNotFoundError as exc:
        app.logger.warning(
            "Startup: pkl files not found — server running without models. "
            "Run `python run_training.py` to generate them. "
            f"Detail: {exc}"
        )
    except Exception as exc:
        # A version mismatch between the pickles and the installed sklearn /
        # xgboost surfaces here. Log it loudly but still boot, so /health can
        # report the degraded state instead of the process dying silently.
        app.logger.error(
            f"Startup: artifacts present but failed to load ({type(exc).__name__}: {exc}). "
            "This usually means the pickles were built with different library "
            "versions. Re-run `python run_training.py`."
        )

    return app


# Module-level singleton used by both the dev server and production WSGI servers.
# Gunicorn (Linux):  gunicorn "backend.app:app" --bind 0.0.0.0:5000 --workers 4
# Waitress (Windows): waitress-serve --host=0.0.0.0 --port=5000 backend.app:app
app = create_app()


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=Config.PORT,
        debug=Config.is_debug(),
        use_reloader=False,  # Reloader causes double-import which resets singleton state
    )
