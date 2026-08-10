# AMR Shield

**Symptom-driven condition prediction with antibiotic stewardship guidance**

AMR Shield takes a list of symptoms, runs them through three independently trained
classifiers (Logistic Regression, Random Forest, XGBoost), averages their probability
distributions into a soft-voting ensemble, and returns the result with an honest
agreement count, a confidence band, and ranked alternatives. Where antibiotics are
not appropriate for the predicted condition, it says so instead of recommending a drug.

> ### Not a medical device
>
> This is a research and teaching demonstration. It must not be used to diagnose,
> treat, or make prescribing decisions for any real person.
>
> - The models are trained on **304 unique symptom combinations across 41 classes**
>   (~7 examples per class). The raw CSV has 4,920 rows, but each combination repeats
>   roughly 120 times, so de-duplication collapses it.
> - Only **7 of the 41 classes** are conditions where antibiotics have a role. The rest
>   are viral infections or not infections at all (diabetes, hypertension, migraine).
> - **Resistance percentages and AMR scores are illustrative placeholders**, not
>   surveillance data. There is no WHO GLASS integration yet.
> - Confidence scores are raw, uncalibrated probabilities.
>
> See `improvements.md` for the full audit and roadmap.

---

## Project structure

```
amr-shield/
├── backend/
│   ├── app.py                  # Flask app factory, JSON error handlers, entry point
│   ├── config.py               # Environment variable loader
│   ├── models/                 # Trained artifacts (generated, gitignored)
│   ├── routes/
│   │   ├── health.py           # GET  /api/v1/health
│   │   ├── predict.py          # POST /api/v1/predict
│   │   └── symptoms.py         # GET  /api/v1/symptoms
│   ├── services/
│   │   ├── ml_service.py       # Soft-voting ensemble inference
│   │   └── model_metadata.py   # Training run metadata read/write
│   └── utils/
│       └── preprocessor.py     # Feature engineering and artifact loader
├── frontend/
│   ├── public/favicon.svg
│   └── src/
│       ├── components/         # Navbar, StatusBar, DisclaimerModal, PipelineDiagram
│       ├── data/               # Symptom groupings, therapy reference table
│       ├── pages/              # Landing, Predict, Results, History, About
│       ├── services/api.js     # Axios client with error normalisation
│       └── store/              # Zustand store (history persisted to localStorage)
├── data/raw/                   # Place the Kaggle CSV here before training
├── notebooks/model_training.ipynb
├── run_training.py             # Standalone training script (preferred)
├── improvements.md             # Audit and roadmap
├── requirements.txt
└── README.md
```

---

## Setup

### Backend

```bash
# From amr-shield/
python -m venv venv
venv\Scripts\activate          # Windows
source venv/bin/activate       # macOS / Linux

pip install -r requirements.txt
copy .env.example .env         # Windows  (cp on macOS/Linux)
```

Every environment variable has a working default, so `.env` is optional for local
development.

### Train the models

The repository does not ship the dataset or the trained artifacts — `.gitignore`
excludes `data/raw/*.csv` and `backend/models/*.pkl`. You need to generate them.

1. Download the
   [Disease-Symptom Prediction dataset](https://www.kaggle.com/datasets/itachi9604/disease-symptom-description-dataset)
   and place the CSV in `data/raw/`.
2. Run the training script:

   ```bash
   python run_training.py
   ```

3. Confirm that **7 files** appear in `backend/models/`: six `.pkl` artifacts
   (`logistic_regression`, `random_forest`, `xgboost`, `scaler`, `label_encoder`,
   `features`) plus `model_metadata.json`.

`notebooks/model_training.ipynb` covers the same pipeline interactively.

### Run the API

```bash
python -m backend.app
```

Serves on `http://localhost:5000`. It starts even without trained artifacts —
`/api/v1/health` reports `models_loaded: false` in that state.

### Frontend

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173, proxies /api to localhost:5000
```

```bash
npm run build     # production bundle into frontend/dist/
npm run preview   # serve the built bundle locally
```

For a deployment where the API is on a different host, copy
`frontend/.env.example` to `frontend/.env.local` and set `VITE_API_BASE_URL`.
Without it the bundle uses the relative path `/api/v1` and needs a reverse proxy
in front of both the static files and Flask.

---

## API reference

### GET /api/v1/health

```json
{
  "status": "healthy",
  "models_loaded": true,
  "version": "1.0.0",
  "timestamp": "2026-08-10T12:00:00.000000+00:00",
  "model_metadata": {
    "trained_at": "2026-08-10T12:00:00.000000+00:00",
    "dataset": {
      "filename": "dataset.csv",
      "total_rows": 4920,
      "unique_patterns": 304,
      "num_features": 131,
      "num_classes": 41,
      "note": "total_rows is all 4,920 CSV rows. unique_patterns is the number of distinct binary feature vectors (~304). CV uses GroupKFold keyed on unique_patterns."
    },
    "versions": { "scikit_learn": "1.8.0", "xgboost": "3.2.0" },
    "cross_validation_f1_macro": {
      "Logistic Regression": 0.95,
      "Random Forest": 0.97,
      "XGBoost": 0.93
    },
    "cross_validation_f1_weighted": {
      "Logistic Regression": 0.95,
      "Random Forest": 0.97,
      "XGBoost": 0.93
    }
  }
}
```

> Numbers above are illustrative. Run `python run_training.py` to generate real values.

### GET /api/v1/symptoms

Returns the exact feature and class lists from the trained artifacts. The frontend
uses this as its source of truth so the symptom picker can never offer a value the
models do not recognise.

```json
{
  "status": "success",
  "count": 131,
  "symptoms": ["abdominal_pain", "abnormal_menstruation", "..."],
  "conditions": ["AIDS", "Acne", "..."],
  "condition_count": 41,
  "timestamp": "..."
}
```

### POST /api/v1/predict

**Request**

```json
{ "symptoms": ["itching", "skin_rash", "nodal_skin_eruptions", "dischromic__patches"] }
```

At least 3 symptoms must match known features, and at most 40 items are accepted.
Symptom strings must match the values from `GET /api/v1/symptoms` exactly.

**Success (200)**

```json
{
  "status": "success",
  "comparison": {
    "Logistic Regression": { "prediction": "Fungal infection", "confidence": 0.9999 },
    "Random Forest":       { "prediction": "Fungal infection", "confidence": 1.0 },
    "XGBoost":             { "prediction": "Fungal infection", "confidence": 0.9966 }
  },
  "final_prediction": "Fungal infection",
  "final_prediction_source": "Soft-voting ensemble (mean probability)",
  "ensemble_confidence": 0.9989,
  "confidence_level": "high",
  "low_confidence": false,
  "model_agreement": true,
  "agreement_count": 3,
  "total_models": 3,
  "agreeing_models": ["Logistic Regression", "Random Forest", "XGBoost"],
  "differentials": [
    { "condition": "Fungal infection", "probability": 0.9989 },
    { "condition": "Acne", "probability": 0.0001 },
    { "condition": "Impetigo", "probability": 0.0001 }
  ],
  "recognized_symptoms": ["itching", "skin_rash", "nodal_skin_eruptions", "dischromic__patches"],
  "unrecognized_symptoms": [],
  "timestamp": "2026-07-31T18:46:01.833062+00:00"
}
```

`confidence_level` is `high` at ≥0.70, `moderate` at ≥0.40, and `low` below that.
A `low` result sets `low_confidence: true`, and the UI presents it as insufficient
signal rather than an answer.

**Errors**

| Status | Cause |
| --- | --- |
| 400 | Malformed body, missing `symptoms`, non-string items, more than 40 items, or fewer than 3 recognised symptoms |
| 404 / 405 | Unknown route or method |
| 500 | Inference failure (usually an artifact/library version mismatch) |
| 503 | Models or artifacts not loaded — run `python run_training.py` |

All errors return JSON of the shape `{"status": "error", "message": "..."}`.
Stack traces are logged server-side and never sent to the client.

---

## Production

```bash
# Linux / macOS
gunicorn "backend.app:app" --bind 0.0.0.0:5000 --workers 4

# Windows
waitress-serve --host=0.0.0.0 --port=5000 backend.app:app
```

Set `FLASK_ENV=production` and list your real frontend origin in
`CORS_ALLOWED_ORIGINS`. Note there is currently **no authentication and no rate
limiting** on the API — see `improvements.md` §5 before exposing it publicly.

---

## Environment variables

| Variable | Description | Default | Used? |
| --- | --- | --- | --- |
| `FLASK_ENV` | `development` or `production` | `production` | Yes |
| `PORT` | Port the Flask server listens on | `5000` | Yes |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allow-list of browser origins. Never `*`. | `http://localhost:3000,http://localhost:5173` | Yes |
| `DB_HOST` | MySQL host | `localhost` | Not yet |
| `DB_PORT` | MySQL port | `3306` | Not yet |
| `DB_NAME` | MySQL database name | `amr_shield` | Not yet |
| `DB_USER` | MySQL username | `root` | Not yet |
| `DB_PASS` | MySQL password | *(empty)* | Not yet |
| `WHO_GLASS_BASE_URL` | WHO GLASS API base URL | `https://glass.who.int/api` | Not yet |
| `CACHE_TTL_HOURS` | Resistance data cache TTL in hours | `24` | Not yet |

Frontend (Vite, must be `VITE_`-prefixed):

| Variable | Description | Default |
| --- | --- | --- |
| `VITE_API_BASE_URL` | API base URL for the built bundle | `/api/v1` |

---

## Data and licensing

- Dataset: [Disease-Symptom Prediction (itachi9604)](https://www.kaggle.com/datasets/itachi9604/disease-symptom-description-dataset), Kaggle.
- [WHO AWaRe classification](https://www.who.int/publications/i/item/9789240062382) (2023) informs the Access/Watch/Reserve labels. Antituberculosis agents fall outside its scope and are marked accordingly.
- [WHO GLASS](https://www.who.int/initiatives/glass) is referenced as the intended resistance data source but is **not integrated**.
