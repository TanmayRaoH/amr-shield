# AMR Shield — Complete Project Explanation
## For Lecture Presentation

---

# 1. THE PROBLEM STATEMENT

## What problem does this project solve?

### In plain language:

Every year, millions of people die because the antibiotics doctors use to treat infections no longer work. This is called **Antimicrobial Resistance (AMR)** — bacteria have evolved to survive the drugs we use to kill them.

**How did this happen?**
Think of antibiotics like a poison designed specifically for bacteria. When you take antibiotics unnecessarily — for a viral cold, for example — most bacteria die, but a few with random mutations survive. Those survivors reproduce. Over generations, the whole population becomes resistant. Now that antibiotic no longer works on those bacteria. Do this across billions of people over decades, and you end up with infections that cannot be treated by any drug we have.

The World Health Organization classifies AMR as one of the top 10 global public health threats to humanity.

### The core misuse:
- A person has a fever and goes to a doctor or pharmacy
- They receive an antibiotic — even if the cause is a virus (antibiotics do nothing to viruses)
- The infection resolves on its own (as it would have), but antibiotic resistance gets slightly worse
- Multiply this by billions of prescriptions per year globally

### What AMR Shield tries to do:
1. Given a patient's symptoms, predict **what condition** they likely have
2. Based on that condition, determine **whether an antibiotic is actually needed**
3. If an antibiotic IS needed, recommend the **safest effective choice** — the one with lowest resistance rates

The tool covers 41 conditions. Only 7 of them actually require antibiotics. For the other 34 (viral infections, metabolic disorders, cardiovascular conditions), the tool explicitly tells you: "Antibiotics are not indicated here. Prescribing one anyway drives resistance."

---

---

# 2. PROJECT ARCHITECTURE OVERVIEW

## The big picture

AMR Shield has three main layers that work together:

```
┌──────────────────────────────────────────────┐
│  FRONTEND  (React — runs in user's browser)  │
│  User picks symptoms → sees results          │
└────────────────────┬─────────────────────────┘
                     │  HTTP API calls (JSON)
┌────────────────────▼─────────────────────────┐
│  BACKEND   (Python Flask — runs on server)   │
│  Validates input → runs ML models → responds │
└────────────────────┬─────────────────────────┘
                     │  reads/writes
      ┌──────────────┴──────────────┐
      │                             │
┌─────▼──────┐             ┌───────▼──────┐
│  ML Models │             │  MySQL DB    │
│  (.pkl     │             │  (history &  │
│  files)    │             │  WHO cache)  │
└────────────┘             └──────────────┘
```

**In plain language**: The user interacts with a web interface (frontend). When they click "Analyse", the browser sends the symptoms to our server (backend). The server runs three machine learning models, combines their answers, and sends back a prediction. The result is stored in a database for history tracking.

---

---

# 3. THE DATASET AND DATA PIPELINE

## Where the data comes from

The training data is the **"Disease-Symptom Prediction" dataset** from Kaggle (by itachi9604). It contains 4,920 rows (expanded to ~19,440 in our run), each row being a disease name paired with a set of symptoms.

**Example rows in the raw data:**
```
Disease          | Symptom_1   | Symptom_2    | Symptom_3     | ...
Fungal infection | itching     | skin_rash    | nodal_skin_.. | ...
Fungal infection | itching     | skin_rash    | nodal_skin_.. | ...  ← same pattern, repeated ~120×
Malaria          | high_fever  | chills       | sweating      | ...
```

### Important caveat — the dataset's structure:
The raw CSV has 4,920 rows, but each unique combination of symptoms is repeated about 120 times. When you remove duplicates, you get **~304 truly unique symptom patterns across 41 disease classes** — about 7 unique examples per disease. This is a small, synthetic dataset, not real clinical records. The high F1 scores reflect this controlled, low-variance structure, not real-world clinical generalization ability.

## Step-by-step: how data becomes models (run_training.py)

### Step 1: Load the CSV
We read the raw CSV file. It has one column for disease name and several columns (`Symptom_1`, `Symptom_2`, ... `Symptom_17`) listing individual symptoms for each case.

### Step 2: Wide → Binary Matrix (Feature Engineering)
This is the most important preprocessing step.

**The problem**: Symptoms are stored spread across multiple columns. We need a single row per case with one column per possible symptom, marked 1 (present) or 0 (absent).

**Technical term**: This is a "melt and pivot" operation — reshaping wide format data into a binary feature matrix.

**Before (wide format)**:
```
Disease  | Symptom_1 | Symptom_2   | Symptom_3
Malaria  | high_fever| chills      | sweating
```

**After (binary matrix — one column per unique symptom)**:
```
Disease | high_fever | chills | sweating | skin_rash | itching | ...
Malaria |     1      |   1    |    1     |     0     |    0    | ...
```

The result is a matrix with **131 binary columns** (one per unique symptom found in the dataset) and 41 possible target classes (diseases).

### Step 3: Prevent data leakage with GroupKFold
Since there are ~120 duplicate rows per unique pattern, a naive train/test split would put identical rows in both training and test sets — the model would essentially be memorizing and "looking up" answers. We assign a group ID to each unique symptom pattern and ensure no group appears in both training and testing. This is called **GroupKFold cross-validation**.

### Step 4: Train/Test Split
We do an 80% training / 20% test split, stratified by class (ensuring each disease is proportionally represented in both splits). The split is done at the group level to prevent leakage.

### Step 5: StandardScaler
We apply a `StandardScaler` to normalize features. For binary data this means each feature has mean ≈ 0 and standard deviation ≈ 1. The scaler is fit **only on training data** — never the test set. This is correct ML practice; fitting on all data would "leak" test statistics into training.

### Step 6-8: Train three models
Three classifiers are trained independently on the same data.

### Step 9: Cross-validation
5-fold GroupKFold CV to evaluate performance without test set leakage.

### Step 10: Monte Carlo validation
20 random 80/20 splits are run to confirm performance is stable and not an artifact of one lucky split.

### Step 11: Save artifacts
Seven files are saved to `backend/models/`:
- `logistic_regression.pkl`
- `random_forest.pkl`
- `xgboost.pkl`
- `scaler.pkl` — the normalization transform
- `label_encoder.pkl` — maps disease names ↔ numeric labels
- `features.pkl` — the ordered list of 131 symptom feature names
- `model_metadata.json` — timestamps, dataset stats, CV scores

---

---

# 4. THE THREE MACHINE LEARNING MODELS

## Why three models?

Using three separate models and combining their answers (an "ensemble") is more reliable than trusting one. If two models agree and one disagrees, the disagreement signals uncertainty. It also removes the arbitrary choice of which single model to trust.

---

## Model 1: Logistic Regression

### In plain language:
Imagine drawing a line (or a plane) that separates one disease from all others. Logistic Regression finds the best possible lines to separate all 41 classes from each other. It's the simplest of the three models — no complex structure, just mathematical weights assigned to each symptom.

### Technically:
Logistic Regression is a linear classifier. For multiclass problems, scikit-learn uses a "one-vs-rest" or multinomial approach. It learns a coefficient (weight) for each of the 131 features per class. The output is a probability distribution over all 41 classes.

**Hyperparameters used**: `max_iter=1000, random_state=42`

**Why it's useful**: High interpretability — you can directly read which symptoms have the strongest positive or negative weights for any given disease. F1-macro: 0.91.

---

## Model 2: Random Forest

### In plain language:
Imagine asking 50 different doctors, each trained on a randomly different subset of cases and symptoms. Each doctor gives their diagnosis. You take a vote. The majority wins. That's a Random Forest — it's a democracy of decision trees.

Each "decision tree" is like a flowchart: "Does the patient have fever? → Yes → Do they have chills? → Yes → Malaria more likely." A forest of 50 such trees, each slightly different, averages out individual errors.

### Technically:
`RandomForestClassifier(n_estimators=50, random_state=42)`. Each tree is trained on a random bootstrap sample of rows and considers only a random subset of features at each split. This variance reduction (bagging + feature randomization) makes the ensemble more robust than any single tree.

**Why 50 trees instead of 200?**: The dataset has only 304 unique patterns. Random Forest reaches full accuracy at far fewer trees on clean, small data. 50 trees also reduces memory usage for deployment on a free-tier server.

**Performance**: Best performer. F1-macro: 0.94, Test accuracy: 94.9%.

---

## Model 3: XGBoost

### In plain language:
Instead of building 50 trees at once (like Random Forest), XGBoost builds them **sequentially**. Each new tree focuses specifically on the mistakes made by all previous trees combined. It's like a student who reviews every wrong answer before each exam and concentrates their study on those weak spots. Over 200 rounds, the model becomes very good at fixing its own errors.

### Technically:
XGBoost (Extreme Gradient Boosting) is a gradient-boosted decision tree ensemble. The "gradient" refers to gradient descent in function space — each tree is fitted to the negative gradient (residuals) of a differentiable loss function (`mlogloss` for multiclass).

**Hyperparameters used**: `n_estimators=200, max_depth=6, learning_rate=0.05`
- `max_depth=6`: Each tree can have at most 6 levels of splits
- `learning_rate=0.05`: Each tree's contribution is small (0.05× its full weight), requiring more trees but preventing overfitting

**Performance**: Weakest of the three on this dataset. F1-macro: 0.82. It falls below the 0.85 production-readiness threshold, which is documented honestly in the About page.

---

## Model Performance Summary

| Model | CV F1-macro | CV F1-weighted | Test Accuracy | Monte Carlo F1 |
|---|---|---|---|---|
| Logistic Regression | 0.913 | 0.959 | 96.9% | 0.950 |
| Random Forest | 0.941 | 0.961 | 94.9% | 0.966 |
| XGBoost | 0.818 | 0.888 | 90.8% | 0.850 |

**Important caveat for interpreting these scores**: These numbers are high because the dataset is synthetic and low-variance. Each class has ~7 unique patterns, so the models are tested on data that is structurally similar to training data. This does NOT mean the models would perform this well on real clinical data.

---

---

# 5. THE PREDICTION PIPELINE (HOW INFERENCE WORKS)

## Step-by-step: from user symptoms to final answer

### Step 1: User selects symptoms
In the browser, the user picks symptoms from a grid of 131 chips (e.g. "burning urination", "bladder discomfort", "high fever"). The minimum is 3 symptoms — below that, the models cannot meaningfully discriminate between 41 possible conditions.

The symptom vocabulary is fetched live from `GET /api/v1/symptoms`, which reads directly from `features.pkl`. This guarantees the UI can never offer a symptom the models don't know about.

### Step 2: POST request to the backend
The browser sends a JSON request to the backend:
```json
{ "symptoms": ["burning_micturition", "bladder_discomfort", "foul_smell_of_urine"] }
```

### Step 3: Server-side validation (predict.py)
The server checks:
1. Is the body valid JSON? (400 if not)
2. Is there a `symptoms` key? (400 if not)
3. Is it a non-empty list with at most 40 items? (400 if not)
4. Are all items non-empty strings? (400 if not)
5. Are the models loaded? (503 if not)
6. Do at least 3 symptoms match known training features? (400 if not, with unrecognized ones listed)

### Step 4: Feature Engineering (preprocessor.py)
The recognized symptoms are converted into a **131-dimensional binary vector**:
- Create an array of 131 zeros
- For each recognized symptom, set the corresponding position to 1
- Apply the StandardScaler (the same one fitted during training)
- Result: a (1 × 131) scaled numeric array ready for the models

### Step 5: Running the Three Models (ml_service.py)
Each model receives the same scaled feature vector and returns a **probability distribution over all 41 classes**:

```
Logistic Regression → [0.001, 0.002, 0.0, ..., 0.95, ..., 0.003]  (41 values summing to ~1)
Random Forest       → [0.0,   0.0,   0.0, ..., 0.98, ..., 0.001]
XGBoost             → [0.002, 0.001, 0.0, ..., 0.89, ..., 0.008]
```

One small technical detail: each model's `classes_` attribute might be in a different order than the label encoder's order. The `_aligned_proba()` method maps each probability back to the correct label index so the three distributions can be safely combined.

### Step 6: Soft-Voting Ensemble
The three probability vectors are **averaged** element-by-element:
```
Ensemble = (LR_probs + RF_probs + XGB_probs) / 3
```
The class with the highest average probability becomes the initial candidate.

**Why soft voting?** It removes the arbitrary choice of which model to trust. If two models have high confidence for "UTI" and one has moderate confidence, the average still strongly picks UTI. A single dissenting model doesn't override the others.

### Step 7: Plausibility Filter
After averaging, there's one more check: does the predicted condition actually make sense given the symptoms entered?

**The problem it solves**: Generic symptoms like "fever" and "nausea" appear in many diseases. Without filtering, a model might suggest a rare disease that happens to share one symptom, even though none of the other typical symptoms for that disease were entered.

**How it works**: For each candidate condition, we calculate the **symptom overlap score** — what fraction of the entered symptoms actually appear in that condition's known symptom profile (from `condition_symptoms.json`).

Then we compute a **plausibility-weighted score**:
```
plausibility_score = ensemble_probability × (overlap_fraction + 0.05)
```

The 0.05 epsilon prevents a condition with zero overlap from winning purely on probability, while still preserving the model's signal for the final ranking.

### Step 8: Confidence Banding
The ensemble probability for the top prediction is categorized:
- **High confidence**: ≥ 70% → shown as a reliable answer
- **Moderate confidence**: 40–70% → shown with a caution note
- **Low confidence**: < 40% → shown as "Insufficient signal — clinical evaluation recommended"

### Step 9: Differentials
The top 3 conditions by plausibility-weighted score are returned as "ranked alternatives." Each includes its raw ensemble probability and overlap score. A close second-place condition tells the clinician: "this is not a clear-cut case."

### Step 10: Model Agreement
We count how many of the three individual models agree with the ensemble's final answer:
- 3/3 → "All models agree" (green badge)
- 2/3 → "Partial agreement" (amber badge)
- 1/3 → "One model agrees" (visible warning)

### Step 11: Save to Database
Before returning the response, the result is saved to MySQL (non-blocking — database failure never delays or breaks the prediction response).

### Step 12: Return JSON response
The full response is returned to the browser, including: final prediction, per-model comparison, ensemble confidence, confidence level, agreement count, differentials, recognized/unrecognized symptom lists, and a timestamp.

---

---

# 6. THE BACKEND (Flask API)

## What is Flask?

Flask is a lightweight Python web framework. Think of it as the "switchboard operator" — it receives incoming HTTP requests, routes each one to the right function, and sends back a response. In AMR Shield, Flask acts as the API server.

## Application Factory Pattern (app.py)

Rather than creating the Flask app at module level, we use an **application factory** — a `create_app()` function. This is a best practice that:
- Makes the app easier to test (you can create multiple app instances with different configs)
- Keeps startup logic organized in one place
- Allows the server to start even if ML artifacts are missing (graceful degradation)

On startup, `create_app()` does the following in order:
1. Configure logging (DEBUG level in development, INFO in production)
2. Set up CORS (Cross-Origin Resource Sharing) — allowing only specific frontend origins to call the API, never `*`
3. Register the 5 route blueprints under `/api/v1`
4. Register JSON error handlers so errors are never returned as HTML pages
5. Load ML artifacts (`preprocessor_service.load_artifacts()`)
6. Load ML models (`ml_service.load_models()`)

If step 5 or 6 fails (e.g., no models trained yet), the server still starts. The `/health` endpoint reports `models_loaded: false` so the frontend can show a clear warning instead of crashing.

## The Five API Endpoints

### GET /api/v1/health
Returns server status, whether models are loaded, and the full model metadata (dataset stats, CV scores, training timestamp). The frontend polls this every 30 seconds to update the status bar.

### GET /api/v1/symptoms
Returns the exact list of 131 symptom feature names and 41 condition names, read directly from `features.pkl` and `label_encoder.pkl`. This is the **single source of truth** — the frontend uses this list to populate the symptom picker, so the two can never drift out of sync.

### POST /api/v1/predict
The main endpoint. Accepts a list of symptoms, runs the full validation → preprocessing → ensemble inference → plausibility filtering pipeline, saves to the database, and returns the full result JSON.

### GET /api/v1/glass/\<country_code\>
Fetches live antimicrobial resistance data from the **WHO Global Health Observatory (GHO) API**. Two indicators are tracked:
- `AMR_INFECT_ECOLI` — percentage of bloodstream E. coli infections resistant to 3rd-generation cephalosporins. Relevant for UTI, Pneumonia, Typhoid.
- `AMR_INFECT_MRSA` — percentage of bloodstream infections due to MRSA. Relevant for Impetigo, skin infections.

The data is fetched from `ghoapi.azureedge.net`, cached in MySQL (with a 24-hour TTL), and falls back to an in-memory cache if MySQL is down. If the country has no GLASS enrollment data, the frontend falls back to embedded WHO GLASS 2022 global averages.

### GET/DELETE /api/v1/history
Retrieves or clears the prediction history from the MySQL `prediction_history` table. Falls back gracefully if the database is unreachable.

## Blueprints

Flask **Blueprints** are a way to organize routes into separate modules. Each endpoint group is its own Blueprint registered with a URL prefix. This keeps the code modular — `predict.py` doesn't need to know that `health.py` exists.

## Error Handling

Without explicit error handlers, Flask returns HTML error pages. Since the frontend expects JSON, we register two catch-all handlers:
- `handle_http_exception`: Catches all werkzeug HTTP errors (404, 405, 413...) and returns JSON
- `handle_unexpected_exception`: Catches any unhandled exception, logs the full traceback server-side, and returns a generic message to the client (never exposing internal details)

---

---

# 7. THE DATABASE (MySQL)

## Why MySQL?

MySQL provides **persistent storage** across server restarts. Without it, prediction history only lives in browser memory and disappears on refresh. Two tables are used:

### Table: prediction_history
Stores every prediction made:
```sql
id           -- auto-increment unique ID
created_at   -- timestamp
symptoms     -- JSON array of symptom strings
prediction   -- final predicted condition name
confidence   -- ensemble confidence score (0–1)
agreement    -- number of models that agreed
total_models -- always 3
country_code -- ISO 3-letter code if provided
full_result  -- the complete API response JSON
```

### Table: glass_cache
Caches WHO GHO API responses to avoid hitting the WHO API on every request:
```sql
id              -- auto-increment unique ID
cache_key       -- "{indicator_code}:{country_code}" (e.g. "AMR_INFECT_ECOLI:IND")
country_code    -- ISO 3-letter country code
indicator_code  -- GHO indicator identifier
resistance_pct  -- the resistance percentage
data_year       -- the year the data point is from
fetched_at      -- when we fetched it (for TTL calculation)
```

## Graceful degradation
If MySQL is not available, the server continues running. Prediction history falls back to browser localStorage, GLASS data falls back to in-memory cache, and predictions still work normally. Every database call is wrapped in try/except — a MySQL outage never crashes a prediction.

---

# 8. THE FRONTEND

## Technology Stack

| Technology | Purpose |
|---|---|
| **React 18** | UI component framework |
| **Vite** | Build tool and development server |
| **React Router v6** | Client-side page navigation |
| **Zustand** | Global state management |
| **Axios** | HTTP client for API calls |
| **Recharts** | Bar charts for resistance visualization |
| **Tailwind CSS v4** | Utility-first styling |

## Pages

### Landing (/)
The home page. Explains what AMR Shield is, shows the 3-stage pipeline diagram, a status bar showing API health, and a "Launch App" button.

### Predict (/predict)
The main input page where users:
1. Search and select symptoms from a 131-item grid (grouped into 15 categories)
2. Optionally specify patient context: country, age group, penicillin allergy, pregnancy
3. Click "Analyse" to run the prediction

The symptom vocabulary is loaded from the backend (`GET /api/v1/symptoms`), so it's always in sync with the trained models. A fallback static list is used until the API responds.

**Preset cases**: Three one-click demo cases (Suspected UTI, Febrile respiratory, Skin presentation) let anyone immediately see a real result without hand-picking symptoms.

**Lay-language search**: Searching "burning pee" automatically resolves to `burning_micturition`, "throwing up" → `vomiting`, etc. This makes the tool accessible to non-medical users.

### Results (/results)
The most complex page. Displays:
- The final predicted condition with confidence percentage and model agreement badge
- A "Antibiotics not indicated" / "Antibiotic guidance" banner — the core stewardship message
- Symptoms entered (with unrecognized ones struck through)
- Per-model comparison cards (Logistic Regression, Random Forest, XGBoost) with individual confidence donuts
- Ranked differential alternatives with probabilities and overlap warnings
- Therapy/antibiotic guidance cards with WHO AWaRe category labels
- **AMR Scoring Engine breakdown table**: shows exactly how each antibiotic is scored
- Resistance bar chart
- Live WHO GLASS data overlay (if country was selected)
- Contraindication warnings based on patient context (penicillin allergy, pregnancy, child age)

### History (/history)
Shows all past predictions in a table, loaded from MySQL (falls back to localStorage). Includes filter-by-condition, sort by date, and CSV export.

### About (/about)
Methodology page with live performance metrics (loaded from `/api/v1/health`, never hardcoded), dataset facts, scope limitations, and references.

---

---

# 9. STATE MANAGEMENT (Zustand)

## What is state management and why is it needed?

In a React app with multiple pages, information needs to be shared across components. For example, when a user clicks "Analyse" on the Predict page, the result needs to be available on the Results page. Without a shared state manager, you'd have to pass data through props through every intermediate component — messy and brittle.

**Zustand** is a lightweight state management library (simpler than Redux).

## The AMR Shield store (useAppStore.js)

The Zustand store holds:

| State Slice | What it stores | Persisted? |
|---|---|---|
| `health` | API health check response | No (re-fetched) |
| `knownSymptoms` / `knownConditions` | Vocabulary from /symptoms | No (re-fetched) |
| `selectedSymptoms` | Currently checked symptoms | No |
| `predictionResult` | Last prediction response | No (intentionally — stale results shouldn't restore) |
| `predictionLoading` / `predictionError` | Loading/error state | No |
| `glassData` | Live WHO GLASS response | No |
| `history` | Past 50 predictions | **Yes** (localStorage) |
| `disclaimerAccepted` | Whether user accepted disclaimer | **Yes** (localStorage) |

### Why only history and disclaimer are persisted:
Health status, vocabulary, and the active prediction are all either time-sensitive or fetched fresh on load. The history is user data that should survive browser restarts. The disclaimer acceptance also persists so the modal doesn't re-appear every time.

### Persist middleware
Zustand's `persist` middleware wraps the store and automatically saves the specified slices to `localStorage` as JSON. On app load, it restores these values before any rendering.

---

# 10. THE ANTIBIOTIC SCORING ENGINE

## AMR Score Formula

One of the key technical contributions of the project is a formula for ranking antibiotics by their safety for use — not just by efficacy, but by the risk of worsening resistance.

```
AMR Score = 100 − (resistance_rate × 0.7) − (overuse_penalty × 0.3)
```

**Higher score = safer choice.**

### Components:
**resistance_rate**: The percentage of infections caused by the relevant pathogen that are already resistant to this antibiotic (from WHO GLASS 2022 data, or live from the WHO GHO API).

**overuse_penalty**: Derived from the WHO AWaRe classification:
| AWaRe Category | Penalty | Meaning |
|---|---|---|
| Access | 5 | Broad-spectrum agents that should be the first line |
| Watch | 25 | Higher resistance potential — use selectively |
| Reserve | 40 | Last-resort agents — use only when nothing else works |

### Example calculation for Ciprofloxacin (UTI):
```
Resistance rate: 32.1% (WHO GLASS 2022)
AWaRe category: Watch → penalty = 25
AMR Score = 100 − (32.1 × 0.7) − (25 × 0.3) = 100 − 22.47 − 7.5 = 70.03
```

Compare to Nitrofurantoin for UTI:
```
Resistance rate: 8.2%
AWaRe category: Access → penalty = 5
AMR Score = 100 − (8.2 × 0.7) − (5 × 0.3) = 100 − 5.74 − 1.5 = 92.76
```

Nitrofurantoin scores ~93 vs Ciprofloxacin's ~70 → Nitrofurantoin is recommended first.

### Live data override
If the user selects a country, the backend fetches real resistance rates from the WHO GHO API for that specific country. These live rates override the static GLASS 2022 global averages for affected antibiotics, and the AMR scores are recomputed in real-time in the browser.

---

---

# 11. THE WHO GLASS INTEGRATION

## What is WHO GLASS?

WHO GLASS (Global Antimicrobial Resistance and Use Surveillance System) is the World Health Organization's global surveillance network for antimicrobial resistance data. Countries enroll in GLASS and submit laboratory data on resistant infections. WHO publishes this data through their Global Health Observatory (GHO) API.

## How AMR Shield uses it

The backend's `glass.py` queries the **WHO GHO OData API** at `ghoapi.azureedge.net` — no authentication required.

Two specific **indicators** (data series) are used:

| Indicator Code | What it measures | Relevant conditions |
|---|---|---|
| `AMR_INFECT_ECOLI` | % of bloodstream E. coli infections resistant to 3rd-gen cephalosporins | UTI, Pneumonia, Typhoid, Gastroenteritis |
| `AMR_INFECT_MRSA` | % of bloodstream infections due to MRSA | Impetigo, skin infections |

## Data flow
1. User selects a country (e.g. India)
2. After prediction, browser fires `GET /api/v1/glass/IND`
3. Backend checks MySQL cache for a recent value (< 24 hours old)
4. If not cached: makes a live call to WHO GHO API, gets the most recent data point for that country and indicator
5. Stores result in MySQL for future requests
6. Returns `resistance_pct` and `year` to the frontend
7. Frontend overlays this live rate onto the relevant antibiotic therapy cards and recomputes AMR scores

## Fallback behavior
If a country has no GLASS enrollment, the `resistance_pct` field is `null` and the frontend falls back to the embedded WHO GLASS 2022 global averages from `antibiotics.js`.

---

# 12. VALIDATION AND CONFIDENCE

## Cross-Validation

**5-Fold GroupKFold CV**: The dataset is split into 5 non-overlapping folds. Each fold uses a different 80% of unique symptom patterns for training and the remaining 20% for validation. No identical pattern appears on both sides of any fold boundary. F1-macro is reported (average across all 41 classes, unweighted — treats each class equally regardless of size).

## Monte Carlo Validation

20 random 80/20 group-aware splits, each with freshly trained estimators. This tests whether performance is stable across different random partitions of the data, or if it's just one lucky split. The mean F1-macro across all 20 runs confirms stability.

## Confidence Bands

The ensemble probability for the top prediction is the raw mean of the three models' `predict_proba()` outputs. This is NOT a calibrated probability — it does not mean "the model is correct 70% of the time when it says 70%." It should be interpreted as a **relative ranking** — how strongly does the ensemble prefer this class over all others?

The bands (high ≥70%, moderate 40–70%, low <40%) are deliberately conservative. With 41 classes, a random guess scores ~2.4%. An ensemble confidence of 40% is already far above chance, but still represents meaningful uncertainty.

## Plausibility Warning

When fewer than 20% of entered symptoms are associated with the top predicted condition (per `condition_symptoms.json`), a visible warning is shown: "Only X% of your entered symptoms are associated with this condition in training data."

---

---

# 13. DEPLOYMENT

## Frontend: Netlify
The React app is built into a static bundle (`npm run build` → `frontend/dist/`). This bundle is deployed to **Netlify**, a static site hosting platform. Netlify serves the HTML/JS/CSS files globally via CDN.

The frontend calls the backend API at the URL set in `VITE_API_BASE_URL`. In production, this points to the Render backend URL.

## Backend: Render
The Flask server runs on **Render's free tier**. The production server uses **Waitress** (on Windows) or **Gunicorn** (on Linux) — production-grade WSGI servers rather than Flask's built-in development server.

```
# Linux/macOS
gunicorn "backend.app:app" --bind 0.0.0.0:5000 --workers 4

# Windows
waitress-serve --host=0.0.0.0 --port=5000 backend.app:app
```

The `render.yaml` and `netlify.toml` files in the project root contain the deployment configuration.

## Environment Variables
Configuration is managed through environment variables loaded by `python-dotenv`:

| Variable | Purpose |
|---|---|
| `FLASK_ENV` | `development` or `production` |
| `PORT` | Port Flask listens on |
| `CORS_ALLOWED_ORIGINS` | Comma-separated list of allowed frontend origins |
| `DB_HOST/PORT/NAME/USER/PASS` | MySQL connection details |
| `WHO_GLASS_BASE_URL` | WHO GHO API base URL |
| `CACHE_TTL_HOURS` | How long to cache GLASS data (default 24h) |

---

# 14. HONEST LIMITATIONS AND ACADEMIC CONTEXT

These are important to state clearly — especially in a lecture or academic presentation.

## What this tool IS:
- A **symptom-to-condition classifier** that acts as a triage layer
- A **stewardship reference tool** showing which conditions do not need antibiotics
- A **demonstration of ML ensemble methods** applied to a healthcare-adjacent problem
- A **live integration example** connecting a trained model to a real external API (WHO GHO)

## What this tool is NOT:
- A medical diagnostic device
- A resistance predictor (it predicts conditions from symptoms, not resistance from pathogens)
- Trained on real clinical data (the dataset is synthetic and low-variance)
- Calibrated (confidence scores are raw `predict_proba` values, not true probabilities)

## Key limitations to mention:
1. **Small dataset**: ~304 unique symptom patterns across 41 classes ≈ 7 unique examples per class. High F1 reflects the clean, repeated structure, not real clinical generalization.
2. **No patient context in the model**: The ML models only see symptoms. Age, sex, recent antibiotic history, symptom duration — all of which change real prescribing — are not in the model.
3. **No SHAP explanations**: There's no per-symptom attribution explaining WHY the model chose a particular condition.
4. **Uncalibrated confidence**: A 90% confidence from the ensemble does not mean the model is right 90% of the time.
5. **XGBoost below threshold**: XGBoost's F1-macro (0.82) falls below the 0.85 production-readiness criterion. This is documented openly in the About page.
6. **Resistance data is illustrative for most conditions**: Only UTI/Pneumonia/Typhoid/Impetigo have live WHO GHO connections. Other conditions use static GLASS 2022 global averages embedded in `antibiotics.js`.

## The real AMR problem (for context):
The actual problem clinical researchers work on is different from this project: given an **isolated pathogen** (from a lab culture), a **specimen type**, and **patient context**, predict **susceptibility per antibiotic** (Susceptible / Intermediate / Resistant). That's what microbiology labs produce and what prescribers act on. This project sits *in front of* that problem as a triage layer. Being explicit about this boundary is a strength.

---

# 15. HOW TO RUN THE PROJECT

## Backend setup
```bash
# From amr-shield/
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt

# Set up MySQL (optional — project runs without it)
# Create database 'amr_shield' and run the SQL from README.md

# Copy environment file
copy .env.example .env

# Train the models (download dataset.csv to data/raw/ first)
python run_training.py

# Start the Flask server
python -m backend.app
```

## Frontend setup
```bash
cd frontend
npm install
npm run dev     # http://localhost:5173
```

## Verify everything is working
- Visit `http://localhost:5000/api/v1/health` — should show `models_loaded: true`
- Visit `http://localhost:5173` — Landing page should show green API status
- Go to Predict, select 3+ symptoms, click Analyse

---

# 16. QUICK REFERENCE: KEY TECHNICAL TERMS

| Term | Plain Language Explanation |
|---|---|
| **Binary feature matrix** | A table where each row is a case and each column is a symptom, with 1 if present and 0 if absent |
| **StandardScaler** | Makes all features have the same scale (mean 0, std 1) so no feature dominates by being numerically large |
| **LabelEncoder** | Converts disease names ("Malaria") to numbers (14) and back — models work with numbers, humans want names |
| **Soft voting ensemble** | Combine models by averaging their probability distributions, not just taking a majority vote |
| **predict_proba()** | A sklearn method that returns probabilities for each class, not just the single most likely class |
| **F1-macro** | A performance metric averaging F1 score equally across all classes — treats rare and common classes the same |
| **GroupKFold** | Cross-validation that ensures no identical data pattern appears in both train and validation |
| **Blueprint (Flask)** | A way to organize routes into separate files that are plugged into the main app |
| **CORS** | Cross-Origin Resource Sharing — security mechanism controlling which websites can call an API |
| **WHO AWaRe** | WHO's classification of antibiotics into Access (first line), Watch (selective use), Reserve (last resort) |
| **GLASS** | WHO's global surveillance system for antimicrobial resistance data |
| **OData API** | A standard REST API protocol used by the WHO GHO — queryable with filters and sorting |
| **Zustand** | A lightweight React state management library (simpler alternative to Redux) |
| **Vite** | A fast frontend build tool and development server for React projects |
| **WSGI** | Web Server Gateway Interface — the standard way Python web apps communicate with production web servers |
| **Plausibility filter** | A check that the predicted condition's known symptoms actually overlap with what the user entered |

---

*AMR Shield — Research and educational demonstration. Not a medical device.*
*Dataset: Disease-Symptom Prediction (itachi9604), Kaggle.*
*Resistance data: WHO GLASS 2022 Annual Report (global averages) + live WHO GHO API.*
*AWaRe classification: WHO, 2023 update.*
