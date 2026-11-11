# AMR Shield — Interview Prep

A codebase-grounded brief for defending this project in an interview. Every claim here is traced to real files in `amr-shield/`. Where the resume wording is more optimistic than the implementation, it's flagged plainly so you can reframe honestly instead of getting caught out.

> Read this first — the one honesty gap that matters most:
> The resume says "predicts AMR patterns." The trained ML model does **not** predict antimicrobial resistance. It predicts a **disease/condition from a list of symptoms** (41 classes, target column `Disease` in `data/raw/dataset.csv`). The *resistance* numbers come from two separate, non-ML sources: the **WHO GLASS / GHO public API** (live, 2 indicators) and a **static placeholder table** in `frontend/src/data/antibiotics.js`. See the per-bullet gap analysis below for exact framing.

---

## 1. Tech stack (concise)

| Layer | What's actually used | Evidence |
|---|---|---|
| Backend | Python, **Flask 3.0.3**, Flask-CORS, blueprint-per-route-group, app factory | `requirements.txt`, `backend/app.py` |
| ML | **scikit-learn 1.8.0** (LogisticRegression, RandomForest), **XGBoost 3.2.0**, numpy, pandas; 3-model soft-voting ensemble | `requirements.txt`, `backend/services/ml_service.py`, `models/model_metadata.json` |
| Model artifacts | Pickled `.pkl` files: `logistic_regression`, `random_forest`, `xgboost`, `scaler`, `label_encoder`, `features`; plus `condition_symptoms.json` | `backend/models/`, `backend/utils/preprocessor.py` |
| Frontend | **React 19**, **Vite 6**, **React Router 7**, **Zustand 5** (state), **Axios** (HTTP), **Recharts 2** (charts), **Tailwind CSS 4** | `frontend/package.json`, `frontend/vite.config.js` |
| Database | **MySQL** via `mysql-connector-python` — prediction history + GLASS cache | `backend/services/db_service.py`, `backend/config.py` |
| External API | **WHO GHO OData API** (`ghoapi.azureedge.net`) for live GLASS resistance rates | `backend/routes/glass.py` |
| Auth | **None.** No login, tokens, sessions, or user accounts anywhere in the codebase | (absence — verified across routes/services) |
| Storage | MySQL only. No object storage, no file uploads | `db_service.py` |
| Jobs / queues | **None.** No Celery/RQ/cron. GLASS fetch is fired "in background" from the browser via a non-awaited promise, not a server job | `frontend/src/pages/Predict.jsx`, `handleAnalyse` |
| Email | **None.** | (absence) |
| Caching | In-process dict + MySQL-backed cache for GLASS responses, TTL via `CACHE_TTL_HOURS` | `glass.py` (`_mem_cache`), `db_service.py` (`glass_cache`) |
| Hosting | Backend → **Render** (gunicorn); Frontend → **Netlify** (static build + proxy) | `render.yaml`, `netlify.toml` |

---

## 2. Whole-project architecture

### 2.1 High-level system diagram

```
                        ┌──────────────────────────────────────────┐
                        │                  USER                      │
                        │        (browser, no auth required)         │
                        └───────────────────┬────────────────────────┘
                                            │ HTTPS
                                            ▼
                 ┌───────────────────────────────────────────────────┐
                 │  FRONTEND  —  Netlify (static React SPA)            │
                 │  React 19 + Vite + React Router 7                   │
                 │  Zustand store (localStorage: history, disclaimer)  │
                 │  Axios client  ─ baseURL = VITE_API_BASE_URL|/api/v1│
                 │  Recharts bar chart + SVG donuts                    │
                 └───────────────────┬───────────────────────────────┘
                                     │  /api/*  (Netlify redirect, 200 proxy)
                                     ▼
                 ┌───────────────────────────────────────────────────┐
                 │  BACKEND  —  Render (gunicorn, 2 workers)           │
                 │  Flask app factory, CORS restricted to origin      │
                 │  Blueprints under /api/v1:                          │
                 │    health · predict · symptoms · glass · history    │
                 │  MLService: 3 pkl models loaded once at startup     │
                 │  PreprocessorService: scaler/encoder/features       │
                 └──────┬───────────────────────┬────────────────┬────┘
                        │                        │                │
                        ▼                        ▼                ▼
             ┌──────────────────┐   ┌────────────────────┐  ┌──────────────────┐
             │  In-memory ML    │   │  MySQL              │  │  WHO GHO / GLASS │
             │  models (.pkl)   │   │  prediction_history │  │  OData API       │
             │  loaded at boot  │   │  glass_cache        │  │  (live, no auth) │
             └──────────────────┘   └────────────────────┘  └──────────────────┘
```

Honesty notes on the diagram:
- The DB is **optional at runtime**. Every DB call in `db_service.py` is wrapped in try/except and fails soft — a prediction still returns 200 if MySQL is down; it just isn't persisted. `/health` reports `db_connected: false`.
- The "background GLASS fetch" is a browser-side promise, not a server job queue.

### 2.2 Request-lifecycle diagram (one `POST /api/v1/predict`)

```
Browser (Predict.jsx handleAnalyse)
  │  runPrediction(selectedSymptoms, countryCode)   [services/api.js]
  ▼
Axios POST /api/v1/predict   body: { symptoms: [...], country_code?: "IND" }
  │  (dev: Vite proxy 5173→5000 | prod: Netlify /api/* → Render)
  ▼
Flask @app.before_request  → debug log
  ▼
predict_bp.predict()   [routes/predict.py]
  ├─ parse JSON (silent) ─ 400 if not a JSON object
  ├─ validate "symptoms": non-empty list, ≤ 40 items, every item non-empty string
  ├─ strip + de-duplicate
  ├─ guard: ml_service.models_loaded  ─ 503 if not
  ├─ split recognized vs unrecognized against preprocessor_service.features
  ├─ require ≥ 3 recognized symptoms  ─ 400 otherwise
  ▼
preprocessor_service.preprocess(recognized)   [utils/preprocessor.py]
  ├─ build zero vector of len(features)=131, set matched symptoms = 1.0
  ├─ wrap in DataFrame with feature names
  └─ StandardScaler.transform → (1, 131) scaled vector
  ▼
ml_service.predict_all(vector, entered_symptoms)   [services/ml_service.py]
  ├─ for each of 3 models: predict_proba → align to label-index order
  ├─ soft vote: mean probability across models
  ├─ plausibility re-rank: prob × (symptom_overlap + 0.05)   [condition_symptoms.json]
  ├─ confidence band: ≥0.70 high / ≥0.40 moderate / else low
  ├─ agreement count, ranked differentials (top 3)
  └─ return dict
  ▼
save_prediction(...)   [services/db_service.py]  ── try/except, never blocks response
  ▼
jsonify(response) 200   → includes comparison, final_prediction, ensemble_confidence,
                            confidence_level, differentials, recognized/unrecognized,
                            plausibility_warning, top_overlap, timestamp
  ▼
Browser: setPredictionResult(...) in Zustand → navigate('/results')
  │  if country selected: fetchGlassData() fires separately (non-blocking)
  ▼
Results.jsx renders verdict, 3 model cards, differentials, therapy table,
             Recharts resistance bar chart, optional live-GLASS overlay
```

---

## 3. Resume bullet — deep analysis

> **Bullet:** *"ML-driven antibiotic resistance tracking app that predicts AMR patterns and aids clinical decision-making using Python/Flask and data visualization."*

### 3.1 What it actually does

Three distinct things live under one app, and only the first is ML:

1. **Symptom → disease classification (the ML part).**
   A 3-model soft-voting ensemble (Logistic Regression, Random Forest, XGBoost) takes a binary symptom vector (131 features) and predicts one of **41 diseases/conditions** (`label_encoder.pkl`). The target in the training data is literally the `Disease` column (`data/raw/dataset.csv` header: `Disease,Symptom_1,…,Symptom_12`). It outputs a top prediction, per-model comparison, confidence band, model-agreement count, and ranked differentials. See `ml_service.predict_all()`.

2. **Antibiotic resistance context (not ML).**
   - *Live:* `GET /api/v1/glass/<country>` calls the **WHO GHO OData API** for two indicators — `AMR_INFECT_ECOLI` (E. coli vs 3rd-gen cephalosporins) and `AMR_INFECT_MRSA` — and caches them (`backend/routes/glass.py`).
   - *Static:* `frontend/src/data/antibiotics.js` holds a therapy table with resistance rates. Its own header comment says these are "**ILLUSTRATIVE PLACEHOLDER VALUES … not from WHO GLASS or any other surveillance system.**" The UI shows a provenance banner saying as much.

3. **Clinical-decision aids (rule-based, not ML).**
   An "AMR score" (`computeAmrScore`: `100 − resistance×0.7 − overuse_penalty×0.3`), WHO AWaRe stewardship warnings, and patient-context contraindication flags (penicillin allergy, pregnancy, child) — all hard-coded rules in `Results.jsx` / `antibiotics.js`.

### 3.2 Architecture & data flow
See §2.2. The key shape: stateless Flask API, models loaded once at startup and held in memory, preprocessing + inference per request, soft-voting ensemble with a plausibility re-rank, optional MySQL persistence, optional live external-API overlay rendered client-side.

### 3.3 APIs used (exact method + path, all under `/api/v1`)

| Method | Path | Purpose | Source file |
|---|---|---|---|
| GET | `/api/v1/health` | Liveness + `models_loaded` + `db_connected` + training metadata | `routes/health.py` |
| GET | `/api/v1/symptoms` | Authoritative feature list (131) + class list (41) from pkl artifacts | `routes/symptoms.py` |
| POST | `/api/v1/predict` | Run ensemble on a symptom list; body `{ "symptoms": [...], "country_code"? }` | `routes/predict.py` |
| GET | `/api/v1/glass/<country_code>` | Live WHO GLASS resistance by ISO-3 country; optional `?condition=` | `routes/glass.py` |
| GET | `/api/v1/history?limit=N` | Last N predictions (max 200) from MySQL, newest first | `routes/history.py` |
| DELETE | `/api/v1/history` | Wipe prediction history | `routes/history.py` |

Frontend callers (`frontend/src/services/api.js`): `fetchHealth`, `fetchSymptoms`, `runPrediction`, `fetchGlassData`, `fetchHistory`, `deleteHistory`.

### 3.4 End-to-end workflow
User accepts disclaimer → picks ≥3 symptoms (vocabulary fetched from `/symptoms` so UI can't offer an unknown feature) → optionally sets country + patient context → `POST /predict` → ensemble result stored in Zustand and persisted to MySQL → redirect to `/results` → if a country was chosen, a separate `GET /glass/<country>` overlays live resistance onto the therapy table → result also cached to localStorage history.

### 3.5 Honesty gaps — reframe these

| Resume phrase | Reality in code | Defensible reframing |
|---|---|---|
| "predicts AMR patterns" | Model predicts **disease from symptoms**, not resistance. Resistance comes from WHO GLASS API + a placeholder table. | "The ML model classifies the likely condition from symptoms; I then layer WHO GLASS surveillance data and a WHO-AWaRe stewardship score on top to guide antibiotic choice." |
| "resistance tracking app" | "Tracking" = fetch + cache 2 WHO indicators on demand and persist prediction history. No longitudinal trend tracking. | "It surfaces current WHO GLASS resistance rates per country and keeps a history of predictions." |
| "aids clinical decision-making" | True but rule-based: AWaRe warnings, contraindication flags, AMR score. Explicitly labeled "research/educational, not for prescribing." | "It's a decision-support demo — stewardship warnings and contraindication checks — not a certified clinical tool, and the UI says so." |
| "data visualization" | Real but modest: one **Recharts** bar chart (resistance by antibiotic) + hand-rolled **SVG** confidence donuts and progress bars in `Results.jsx`. | "Resistance is visualized with a Recharts bar chart and custom SVG confidence gauges." — accurate, don't oversell it as dashboards. |
| Model quality | `model_metadata.json` reports CV F1-macro 0.82–0.94 and ~95–97% test accuracy on a synthetic dataset where each symptom pattern repeats ~120×. | "High accuracy, but on a small synthetic dataset — 304 unique symptom patterns across 41 classes — so I used GroupKFold to avoid leakage and I'm candid it's not clinically validated." |

### 3.6 Likely questions (grounded answers)

**Q: Does your model actually predict antibiotic resistance?**
No. The classifier predicts the likely disease from symptoms (41 classes, `Disease` target). Resistance figures come from the WHO GLASS/GHO API (live, 2 indicators) and a clearly-labeled placeholder table. I combine the predicted condition with resistance data to rank antibiotics — the resume's "predicts AMR patterns" overstates the ML; I'd describe it as condition prediction plus resistance-aware guidance.

**Q: Why three models and how do you combine them?**
Soft voting — I average `predict_proba` across all three (`ml_service.predict_all`). An earlier version trusted XGBoost's output unconditionally; averaging removes that arbitrary choice and lets a confident majority outweigh one dissenter. I align each model's probabilities to the LabelEncoder index order first (`_aligned_proba`) so summing is valid even if a model's `classes_` ordering differs.

**Q: What's the plausibility re-rank for?**
With 41 classes and vague symptoms (fever, nausea), the raw ensemble can rank an unrelated condition highly. I compute symptom overlap against `condition_symptoms.json` and score each candidate as `prob × (overlap + 0.05)`, so a zero-overlap condition drops below a plausible one. I preserve raw probabilities for the comparison table and only reorder the final answer and differentials, and I flag `plausibility_warning` when top overlap < 20%.

**Q: Are the confidence numbers calibrated?**
No, and the code and UI both say so. They're uncalibrated `predict_proba` outputs presented as relative signal strength with conservative bands (≥0.70 high, ≥0.40 moderate). For 41 classes, chance is ~2.4%, so I avoid implying the number is a true likelihood.

**Q: How do you keep the UI symptom list in sync with the model?**
The frontend fetches the vocabulary from `/api/v1/symptoms`, which reads straight from `features.pkl`. This was a real bug fix — the hardcoded list had drifted (`dischromic_patches` vs the trained `dischromic__patches` with a double underscore from stray CSV spaces), so those chips silently never matched.

---

## 4. Hosting & deployment (from real configs)

**Backend — Render** (`render.yaml`):
- Type: `web`, runtime `python`, `PYTHON_VERSION 3.13.0`
- Build: `pip install -r requirements.txt`
- Start: `gunicorn "backend.app:app" --bind 0.0.0.0:$PORT --workers 2 --timeout 120`
- Env vars set in config: `FLASK_ENV=production`, `CORS_ALLOWED_ORIGINS=https://amr-shield.netlify.app`
- Entry: `app = create_app()` module-level singleton in `backend/app.py`. On Windows the comment documents a Waitress alternative (`waitress-serve … backend.app:app`).

**Frontend — Netlify** (`netlify.toml`):
- Build: `cd frontend && npm install && npm run build`, publish `frontend/dist`, `NODE_VERSION 20`
- Proxy redirect: `/api/*` → `https://amr-shield.onrender.com/api/:splat` (status 200, `force=true`), placed **before** the SPA fallback
- SPA fallback: `/*` → `/index.html` (200) so React Router deep links work

**Env vars actually read:**
- Backend (`backend/config.py`): `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASS`, `WHO_GLASS_BASE_URL`, `CACHE_TTL_HOURS`, `FLASK_ENV`, `PORT`, `CORS_ALLOWED_ORIGINS`
- Frontend (`frontend/.env.example`): `VITE_API_BASE_URL` (only `VITE_`-prefixed vars reach the browser; unset in dev because Vite proxies `/api`)

**Health checks:** `GET /api/v1/health` returns `models_loaded` and `db_connected` — pollable by Render/monitors; the frontend polls it every 30s (`App.jsx`, single interval).

Honesty note: MySQL hosting isn't declared in these configs. `render.yaml` provisions no database and sets no DB env vars, so DB credentials would have to be configured separately (or the app runs in its fail-soft, no-persistence mode). I can't verify a managed MySQL from the repo — say that rather than claim one.

---

## 5. Build handling

- **Frontend build:** Vite 6 (`vite build` → `frontend/dist`). Plugins: `@vitejs/plugin-react`, `@tailwindcss/vite`. Dev server on 5173 proxies `/api` → `localhost:5000` (`vite.config.js`).
- **Backend "build":** just `pip install -r requirements.txt`; no compile step. Models are produced out-of-band by `run_training.py` (referenced throughout; **not present in the repo snapshot** — only the `notebooks/model_training.ipynb` is). Flag this: the code repeatedly tells users to "run `python run_training.py`" but I only see the notebook, so I'd verify how the `.pkl`s are actually regenerated before claiming a one-command retrain.
- **Production hardening present:** CORS locked to explicit origins (never `*`), gunicorn with 2 workers + 120s timeout, JSON-only error handlers that hide stack traces in prod, request size bounded by `MAX_SYMPTOMS=40`, uncaught exceptions logged server-side with a generic client message.
- **Lint/tests:** **None found.** No test files, no test runner, no lint config, no CI. `package.json` has only `dev/build/preview`. If asked, say plainly there are no automated tests — that's a real gap, and a good "what would you add next" answer.

---

## 6. Error handling across layers

**Backend**
- Global handlers in `app.py`: `HTTPException` → JSON `{status, error, message}`; catch-all `Exception` → logged in full, client gets a generic 500. Prevents HTML error pages / stack-trace leaks.
- `predict.py`: granular 400s (bad JSON, missing/empty/oversized list, non-string items, too few recognized symptoms), 503 (models not loaded / artifacts missing), 500 (inference failure, with a version-mismatch hint).
- Startup (`create_app`): model loading wrapped in try/except so the server boots even without `.pkl`s; `/health` then reports the degraded state instead of crashing.
- DB (`db_service.py`): every function try/excepts `MySQLError` and fails soft — returns `None`/`[]`/`False`, never breaks a request.
- GLASS (`glass.py`): request timeout (8s) and `RequestException` handled; falls back to cache or `null`, and the response carries a `coverage_note`.

**Frontend**
- `api.js` `normaliseError` centralizes axios failures into a user-safe message with `status`/`details` attached: distinct copy for timeout (`ECONNABORTED`), no-response ("Cannot reach the API… port 5000"), 503, 5xx, 429, and server-provided messages.
- Zustand tracks `healthError`, `predictionError`, `glassError` separately; Predict/Results render targeted banners (API unreachable, models-not-loaded, prediction failed, low confidence, plausibility warning).
- GLASS fetch failure is non-fatal — the result still renders, overlay just doesn't appear.
- `Results.jsx` redirects to `/predict` if there's no active result (guards against deep-linking to a stale page).

---

## 7. Major highlights

- **3-model soft-voting ensemble** with index-aligned probabilities and a transparent per-model comparison UI.
- **Plausibility-aware re-ranking** using a symptom-overlap map — a genuinely thoughtful guard against spurious predictions on vague input.
- **Honest UX about uncertainty:** uncalibrated-probability disclaimer, low-confidence abstention, plausibility warnings, and a persistent "research/educational only" banner.
- **Live external data integration** with layered caching (in-process + MySQL) and graceful degradation when a country has no GLASS data.
- **Single source of truth for the symptom vocabulary** (served from `features.pkl`) to prevent UI/model drift — fixed a real silent bug.
- **Clinical-safety rules:** WHO AWaRe stewardship flags + patient-context contraindications (penicillin allergy, pregnancy, pediatric).
- **Production-minded Flask:** app factory, blueprints, locked CORS, JSON-only errors, startup model loading, structured logging.

---

## 8. Architecture Q&A to expect

**Q: Walk me through what happens on one prediction.** → §2.2.

**Q: Why load models at startup instead of per request?** → Pickle deserialization is expensive; loading once into a module-level singleton (`ml_service`) keeps inference request-time cheap. The `/predict` guard `models_loaded` handles the not-yet-loaded case.

**Q: Why is the DB optional / fail-soft?** → A prediction is the core value; losing persistence shouldn't fail it. Every DB call try/excepts and returns a neutral value, so a MySQL outage degrades to "no history" rather than a 500. `/health` surfaces `db_connected`.

**Q: How does caching work for GLASS?** → Three tiers in `_fetch_indicator`: MySQL cache (TTL `CACHE_TTL_HOURS`) → in-process dict → live GHO fetch, writing back to both on a live hit. Keyed `"{indicator}:{COUNTRY}"`.

**Q: How do you prevent the frontend offering invalid symptoms?** → It fetches the vocabulary from `/symptoms` (backed by `features.pkl`) and only falls back to a static list until that resolves.

**Q: What scales poorly / what would you fix?** → No tests/CI; placeholder resistance values in `antibiotics.js`; synthetic, pattern-repeated dataset limits real-world validity; GLASS "background" fetch is client-side not a server job; no auth/rate-limiting beyond input caps; MySQL hosting undocumented in deploy config. These are honest, strong "next steps" answers.

**Q: Why GroupKFold in training?** → `model_metadata.json` notes CV used GroupKFold keyed on unique symptom patterns so the same pattern never appears in both train and validation folds — avoiding leakage from the ~120× row duplication.

---

## 9. Elevator pitches per feature

- **Prediction engine:** "Pick your symptoms, and a three-model ensemble predicts the most likely condition, shows how each model voted, and ranks the alternatives — with an honest confidence band."
- **Plausibility guard:** "If your symptoms barely match the predicted condition, it tells you — it won't pretend a lucky pattern-match is a diagnosis."
- **Resistance overlay:** "Choose a country and it pulls live WHO GLASS resistance rates to re-rank antibiotics for where you actually are."
- **Stewardship:** "It flags WHO 'Watch/Reserve' antibiotics and patient contraindications, nudging toward narrower, safer choices."
- **Visualization:** "A Recharts bar chart and custom SVG gauges make resistance and model confidence readable at a glance."
- **History:** "Every prediction is saved to MySQL and your browser, so you can revisit past analyses."
- **Reliability:** "Models load at boot, errors return clean JSON, and the app keeps working even if the database or WHO API is down."

---

## 10. Verification notes

- Claims trace to: `backend/app.py`, `config.py`, `routes/{health,predict,symptoms,glass,history}.py`, `services/{ml_service,db_service,model_metadata}.py`, `utils/preprocessor.py`, `models/model_metadata.json`, `data/raw/dataset.csv`; `frontend/{package.json,vite.config.js,.env.example}`, `src/{App.jsx,services/api.js,store/useAppStore.js,pages/Predict.jsx,pages/Results.jsx,data/antibiotics.js}`; `render.yaml`, `netlify.toml`, `requirements.txt`.
- **Could not verify:** a managed MySQL instance (not in deploy configs); `run_training.py` (referenced in code/messages but only the notebook exists in the snapshot); any automated tests/CI/lint (none found). These are stated as gaps above rather than assumed.
