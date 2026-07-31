# AMR Shield — Improvement Roadmap

An honest audit of the current build, what to add for real user value, what would make this project
stand out, and what the AMR field expects from a tool like this.

Everything below was checked against the code and artifacts in this repo as of 2026-07-31, not assumed.

---

## 0. Read this part first: the positioning problem

The project is presented as an antimicrobial resistance tool. What it actually does right now is
**predict a disease from a symptom checklist, then look up a hardcoded antibiotic table**. That gap is
the single biggest thing holding the project back, and closing it is worth more than any feature you
could add.

Concretely, from `backend/models/label_encoder.pkl` and `model_metadata.json`:

| What the UI claims | What the artifacts say |
| --- | --- |
| "Most Likely **Infection**" | 41 classes, and many are not infections: Diabetes, Hypertension, Heart attack, GERD, Migraine, Acne, Allergy, Varicose veins, Cervical spondylosis, Hypothyroidism |
| "**4,920** rows" (`About.jsx`, README) | `rows_after_cleaning: 304`. The raw CSV is 4,920 rows but each symptom combination repeats ~120×, so `drop_duplicates()` collapses it. Effective set: **304 rows / 41 classes ≈ 7 examples per class** |
| "LR ~92% / RF ~96% / **XGB ~98%**" (`About.jsx`, hardcoded) | Real CV F1-macro: LR 0.9935, RF **1.0**, XGB **0.8124** |
| "**WHO GLASS** Live Data Connected" (Landing + StatusBar, green pulsing dot) | No GLASS code exists. `WHO_GLASS_BASE_URL` and `CACHE_TTL_HOURS` are read in `config.py` and never used. Every resistance number is an invented constant in `frontend/src/data/antibiotics.js` |
| Antibiotic recommendations per infection | `ANTIBIOTIC_DATA` has **10 keys** for **41 classes**. 31 of 41 predictions fall through to "Consult specialist / Broad-spectrum penicillin". Several entries aren't antibiotics (Metformin, Insulin, Paracetamol, IV fluids, Tenofovir) |

Also worth knowing: `RandomForest` scoring exactly 1.0 on 304 near-duplicate rows is memorisation, not
quality. And `run_training.py` runs 5-fold CV on models that were **already fitted on the full X/y**,
so those CV numbers are optimistic regardless.

You have two honest paths. Pick one deliberately.

**Path A — Reframe as what it is.** Rename the output to "Most Likely Condition", drop the AMR branding
to a secondary "stewardship reference" panel, and market it as a symptom-based triage demo with an
antibiotic-awareness layer. Cheap, honest, done in a day. Ceiling is low.

**Path B — Make it a real AMR tool.** Keep the symptom model as a *triage front door*, then add the
layer the field actually cares about: given a suspected pathogen and a location, what is the resistance
landscape and what should be prescribed. This means real resistance data, a real AWaRe mapping, and
ideally a genotype path. Much more work, and it's the version that stands out.

I'd argue for **B, staged**: ship A's honesty fixes immediately (they're small and they stop the tool
from being misleading), then build B's data layer as the differentiator.

---

## 1. Tier 1 — credibility and safety (do these before anything else)

These are small, and while they're outstanding, nothing else you build will be believed.

1. **Add a medical disclaimer gate.** A tool that names a disease and recommends an antibiotic has no
   disclaimer modal. Only a soft footer line on Landing. Add a blocking accept-once modal (persist to
   `localStorage`) plus a persistent banner on `/results`.
2. **Stop showing fake data as real.** Either wire actual resistance data or relabel the chart footnote
   in `Results.jsx` and the "WHO GLASS: Live" pill in `StatusBar.jsx` as *illustrative reference values*.
   A green pulsing "live" dot over hardcoded constants is the kind of thing that sinks an otherwise
   good project in a demo Q&A.
3. **Serve real metrics.** `/api/v1/health` already returns the full `model_metadata` blob. `About.jsx`
   hardcodes contradicting numbers. Read from the store instead — one small change, removes a direct
   self-contradiction.
4. **Fix the agreement badge.** `Results.jsx` hardcodes `'2/3 Models Agree'` and `History.jsx` hardcodes
   `'2/3 △'`. Compute the real count from `comparison`. Today it can say "2/3" when zero models agree.
5. **Justify or change the final predictor.** `ml_service.predict_all()` takes `final_prediction` from
   XGBoost unconditionally — the weakest of the three at F1 0.8124. Use soft voting (average
   `predict_proba` across models) and surface per-model votes as supporting evidence. If you keep
   XGBoost, say why in About.
6. **Fix the two dead symptoms.** `frontend/src/data/symptoms.js` lists `dischromic_patches` and
   `spotting_urination`; `features.pkl` has `dischromic__patches` and `spotting__urination` (double
   underscore, from stray spaces in the raw CSV). Those two chips can never match and are silently
   dropped into `unrecognized_symptoms`. Fix by adding **`GET /api/v1/symptoms`** that returns
   `features.pkl` — then the list can never drift again.
7. **Surface errors and loading.** `predictionLoading` and `predictionError` are written to the store and
   **read nowhere**. A failed prediction currently leaves the user on `/predict` with zero feedback.
   Add a spinner, an error banner, and disable the button while in flight.
8. **Add a low-confidence abstain path.** Confidence is raw `max(predict_proba)`, uncalibrated. Below a
   threshold (say 0.5), show "Insufficient signal — recommend clinical evaluation" instead of a
   confident disease name. In clinical AI, knowing when to shut up is a feature.
9. **Add Flask error handlers.** `app.py` has none, so an unhandled exception returns Flask's HTML page,
   with a traceback when `FLASK_ENV=development`. `predict.py` also calls `preprocess()` and
   `predict_all()` unguarded.
10. **Fix `trained_at`.** `model_metadata.json` says `2026-07-31`. Check the system clock.

---

## 2. Tier 2 — what to give the user (value)

### 2.1 Explainability — the biggest missing piece

There is no SHAP, no LIME, no feature importance, nothing. For a clinical decision-support tool this is
the number one credibility gap, and it's the thing reviewers ask about first.

Add a "Why this result?" panel showing per-symptom contribution to the prediction. `shap.TreeExplainer`
on the Random Forest or XGBoost model is fast enough to run per-request on a 131-feature vector, and you
can precompute the explainer at load time next to `load_models()`.

The payoff is disproportionate: it turns a black box into something a clinician can argue with, and it
lets a user discover that, say, their result hinged entirely on one symptom they weren't sure about.

### 2.2 Real resistance data instead of invented constants

`antibiotics.js` is 10 hand-written entries with uncited resistance percentages. Replace with real,
citable sources:

- **WHO GLASS** — the annual AMR surveillance report publishes country-level resistance proportions by
  pathogen–antibiotic pair. There is no clean public REST API, so realistically you download the report
  data and ship it as a versioned seed table with a citation and a year stamp. That's still a massive
  upgrade over invented numbers, and it makes the country selector real.
- **WHO AWaRe classification (2023)** — a genuinely published Access/Watch/Reserve list covering ~250
  antibiotics. Embed it properly with citation. Your `aware` field becomes defensible instead of guessed.
- **ECDC Surveillance Atlas / EARS-Net** for Europe, **CDC NHSN / AR&PM** for the US, if you want
  regional depth.
- **BV-BRC (formerly PATRIC)** and **NCBI Pathogen Detection** for genome-linked AMR phenotypes.
- **CARD**, **ResFinder**, **AMRFinderPlus** for resistance gene reference data.

Move all of this **server-side** behind `GET /api/v1/antibiotics/{condition}`. Right now the entire
knowledge base is client-side JS, so it can't be versioned, audited, or corrected without a frontend
rebuild — and anyone can read that the numbers are fabricated by opening devtools.

### 2.3 Clinical context inputs that change the answer

The form collects symptoms and a decorative country. Real prescribing depends on things you're not
asking:

- **Age** and **weight** — dosing, and contraindications (fluoroquinolones in children, tetracyclines under 8)
- **Pregnancy status** — hard contraindications
- **Known drug allergies**, especially penicillin — the single most common reason a first-line choice is wrong
- **Renal function** (or just "known kidney disease") — dose adjustment for aminoglycosides, vancomycin
- **Symptom duration and severity** — separates self-limiting viral from bacterial
- **Recent antibiotic use in the last 90 days** — the strongest single predictor of resistance in an individual patient
- **Recent hospitalisation / ICU / catheter / surgery** — healthcare-associated vs community-acquired changes the entire empiric choice
- **Immunocompromised status**

Each of these is a checkbox or a number, and each one visibly changes the recommendation. That's what
makes a tool feel clinical rather than like a quiz.

### 2.4 Persistence and history that actually persists

`useAppStore` has no `persist` middleware. History is in-memory, capped at 50, and wiped on refresh —
while `History.jsx` tells the user "N saved predictions". `mysql-connector-python==9.0.0` is pinned in
`requirements.txt` and never imported.

Two levels:
- **Cheap:** add Zustand `persist` to `localStorage`. Fifteen minutes, fixes the lie.
- **Proper:** the MySQL `predictions` table from your requirements doc, plus `GET`/`DELETE /api/v1/history`.
  This also unlocks the aggregate features in §3.

### 2.5 Output the user can take with them

- **PDF / print report** — a clean one-page summary with inputs, prediction, confidence, explanation,
  recommendations, sources, timestamp, and disclaimer. This is the artifact a user actually wants.
- **Shareable result link** — `/results/:id` backed by the DB. Currently `/results` reads from the store
  and dies on refresh, so a result can't be sent to a colleague.
- Fix `downloadCSV` in `History.jsx` while you're there: it doesn't escape embedded double quotes.

---

## 3. Tier 3 — what makes this project distinguishable

Symptom-checker-plus-three-sklearn-models is a crowded space. These are the directions where you'd be
doing something most comparable projects don't.

### 3.1 Local antibiogram upload — strongest practical differentiator

Resistance is **hyper-local**. A hospital's own antibiogram differs sharply from its national average,
which is why every hospital publishes one annually. Let a user upload their institution's antibiogram
CSV (pathogen × antibiotic × %susceptible) and have recommendations re-rank against *their* local
resistance instead of a global average.

This is the thing that would make an actual infectious disease pharmacist care. It's also technically
modest: a CSV parser, a join, and a re-rank. High signal, low cost.

### 3.2 Genotype → phenotype from a sequence

Let a user paste or upload a bacterial FASTA/contig file, screen it for known resistance genes against
a CARD/ResFinder-style reference, and predict the resistance phenotype from the genes found. This is
where the AMR research field genuinely is right now, and almost no student project touches it because
the symptom-checker path is easier.

Even a deliberately scoped version — a curated subset of well-characterised genes (`mecA`, `blaKPC`,
`blaNDM`, `vanA`, `gyrA` mutations) with exact-match or BLAST-style screening — would be more
distinctive than anything in the current build.

### 3.3 Stewardship coaching, not just a recommendation

Reframe from "here's a drug" to "here's how to prescribe well":

- **Empiric → definitive de-escalation guidance**: what to start now, and what to narrow to once
  culture results land in 48–72h. De-escalation is *the* core stewardship behaviour.
- **Spectrum-narrowness scoring**: prefer the narrowest agent that covers the likely pathogen, and show
  why. Broad-spectrum overuse is the actual driver of resistance.
- **AWaRe budget framing**: WHO's target is ≥70% of country antibiotic consumption from the Access
  group. Show where a given choice sits against that.
- **"Do you need an antibiotic at all?"** — for viral-likely presentations, the correct output is *no
  antibiotic*, and saying so loudly is a stewardship feature. Your class list includes Common Cold,
  Allergy, and Chicken pox. A tool that confidently declines to recommend an antibiotic is more
  credible than one that always finds something.

### 3.4 Counterfactual and next-line reasoning

"If first-line fails or the isolate is resistant to X, then Y" — a decision tree the user can walk.
Interactive, and it demonstrates you understand treatment as a sequence rather than a single lookup.

### 3.5 Resistance trend forecasting

If you get multi-year GLASS data, fit a simple trend per pathogen–antibiotic pair and show where
resistance is heading, not just where it is. "Ciprofloxacin resistance in *E. coli* here has gone
28% → 41% over five years" is a more compelling visual than a static bar, and recharts is already
installed.

### 3.6 Low-resource-setting focus

AMR mortality burden is heaviest in low- and middle-income settings, and that's also where lab
confirmation is least available — which is exactly the scenario where empiric guidance matters most.
Leaning into that (PWA, offline-capable, works on a low-end Android, tiny bundle, no login) gives the
project a clear *who is this for* answer. Most competing projects have no answer to that question.

---

## 4. Ease of use

Ordered roughly by impact per hour of work.

| Issue | Where | Fix |
| --- | --- | --- |
| **Mobile nav is unusable** — nav links are `hidden md:flex` with no hamburger, so under 768px no route is reachable except via "Launch App" | `components/Navbar.jsx` | Add a hamburger + drawer |
| **Dark mode toggle does nothing** — `darkMode` flips in the store, but there are zero `dark:` classes in the codebase, no `dark` class applied to `<html>`, and no `@custom-variant dark` in `index.css` (required for Tailwind v4 class-based dark mode). Landing advertises it as a feature | `Navbar.jsx`, `index.css`, all pages | Either implement properly with `localStorage` persistence, or remove the toggle and the marketing claim |
| No demo / sample case | `Predict.jsx` | Add 3 one-click preset cases ("Suspected UTI", "Febrile respiratory", "Skin infection"). Biggest single conversion win — nobody wants to hand-pick 3 symptoms from 129 chips to see if your tool is worth their time |
| Search only matches raw feature names | `Predict.jsx` search box | Add a synonym/lay-language map: "burning pee" → `burning_micturition`, "throwing up" → `vomiting`, "runny nose" → `runny_nose`. Also fuzzy match for typos |
| Country selector is decorative — never sent to the API | `Predict.jsx` | Remove it, or make it real via §2.2 |
| 3-symptom minimum with no explanation | `Predict.jsx` | Say *why* ("below 3 symptoms the models can't discriminate"), and warn above ~8 that the training data averages ~4 symptoms per case |
| Favicon 404 on every load — `frontend/public/` doesn't exist but `index.html` links `/favicon.svg` | `frontend/public/` | Add the file |
| Accessibility | throughout | Emoji as meaningful content (⚠️ 🔍 📋 ☀️ 🌙); resistance conveyed by colour alone; symptom chips lack `aria-pressed`; history table lacks `<caption>` and `scope`; no `focus-visible` styling; no skip link |
| No `VITE_API_BASE_URL` | `services/api.js` | The built bundle hardcodes relative `/api/v1`, so it only works behind a reverse proxy and can't point at a separate API host |
| Duplicate health polling every 30s | `App.jsx` **and** `StatusBar.jsx` | Both poll independently and write the same store slice. Keep one |
| `StatusBar` "0 today" is a literal string | `StatusBar.jsx` | Serve a real `today_count` from the DB once §2.4 lands |
| No confirmation on "Clear All" history | `History.jsx` | Add one |

---

## 5. Engineering foundations

Currently missing entirely. Worth noting even though none of it is user-visible, because it's the
difference between a demo and something someone would trust in a repo.

- **Zero tests.** No pytest, no `test_*.py`, no vitest/RTL, no `test` script in `package.json`. Start
  with `predict.py`'s validation branches — they're pure logic with clear inputs and give the best
  coverage-per-line in the codebase.
- **No linting.** No ESLint, no Prettier, no pre-commit. `@types/react` is installed but the code is
  plain JSX with no type checking.
- **No auth, no rate limiting, no request size cap** on a public POST endpoint. CORS is correctly pinned
  to an explicit origin list rather than `*`, which is the one thing done right. Add at minimum a rate
  limit and a max symptoms-array length.
- **Duplicated training logic** between `run_training.py` and `notebooks/model_training.ipynb`. They
  will drift. Make the notebook import from the script.
- **CV methodology bug** in `run_training.py`: cross-validation runs on already-fitted models over the
  full `X`/`y`. Use a fresh estimator inside `cross_val_score`, and report per-class metrics — with ~7
  examples per class, macro-F1 alone hides a lot.
- **No deployment config.** No Dockerfile, no compose file, no CI workflow, no nginx conf. The
  gunicorn/waitress commands exist only as comments in `app.py` and are unverified. `frontend/dist/`
  exists but is empty.
- **No pickle version guard.** Artifacts are locked to scikit-learn 1.8.0 / xgboost 3.2.0 with no
  compatibility check at load time. Also verify `pandas==3.0.3` and `numpy==2.4.4` actually resolve on
  a clean install before claiming reproducibility.
- **No reproducibility path.** `.gitignore` excludes the dataset CSV and all model artifacts, so a fresh
  clone can't run. That's a defensible policy, but it needs a dataset download script and a checksum.
- **README gaps:** no frontend section at all (no `npm install` / `npm run dev` / `npm run build`), still
  points at the notebook instead of `run_training.py`, `/health` example omits `model_metadata`,
  `/predict` example omits `recognized_symptoms`/`unrecognized_symptoms`, `CORS_ALLOWED_ORIGINS` missing
  from the env table, no license, no screenshots, no dataset citation (links to bare `kaggle.com`), no
  disclaimer.
- **No observability.** No request IDs, no metrics, no error tracking, no prediction audit log.

---

## 6. Field context worth knowing

Things about the AMR domain that should shape design decisions, and that also make you sound like you
did the reading.

**The real AMR prediction problem isn't symptom → disease.** In practice it's: given an isolated
pathogen, a specimen type, and patient context, predict susceptibility (S/I/R) per antibiotic. That's
what clinical microbiology labs produce and what prescribers act on. Symptom → disease is a triage layer
that sits *in front of* the AMR problem. Being explicit about that boundary in your About page is a
strength, not an admission — it shows you know where your tool sits in the workflow.

**Susceptibility is defined by breakpoints, not by percentages.** Labs measure MIC (minimum inhibitory
concentration) and interpret it against **CLSI** (US) or **EUCAST** (Europe) breakpoint tables, which are
revised annually and sometimes disagree. Any serious resistance feature needs to say which standard and
which year it used.

**Empiric vs definitive therapy is the central distinction.** Empiric = before culture results, based on
likely pathogen and local resistance. Definitive = after, narrowed to the confirmed organism. Your tool
is inherently an *empiric* aid, and framing it that way is both accurate and the strongest argument for
why it's useful.

**Resistance data is local and time-bound.** National averages are a fallback, not an answer. Hospital
antibiograms exist precisely because within-country variation is large. This is why §3.1 matters.

**AWaRe is a real, usable standard.** WHO's Access / Watch / Reserve classification (2023 update) covers
roughly 250 antibiotics, with a country-level target of ≥70% of consumption from Access. Your `aware`
field is currently guessed per entry — grounding it in the published list is a small change with real
credibility value.

**Consumption drives resistance.** The standard consumption metric is **DDD** (defined daily dose) per
1,000 inhabitants per day, tracked by ESAC-Net and WHO. If you want a population-level dashboard, plotting
consumption against resistance is the canonical analysis and it's genuinely interesting.

**Regulatory framing matters more than people expect.** Software that recommends a specific drug for a
specific patient looks like a regulated medical device (FDA SaMD, EU MDR, and likely high-risk under the
EU AI Act). The FDA's clinical decision support guidance carves out tools where the clinician can
**independently review the basis** for the recommendation — which is exactly why explainability (§2.1)
and source citations (§2.2) aren't just nice-to-haves. Designing for "here is the evidence, you decide"
rather than "take this drug" is both safer and a better product.

**Calibration matters more than accuracy in clinical ML.** A model that says 90% and is right 90% of the
time is more useful than a more accurate model with meaningless confidence scores. Your donut charts
display raw uncalibrated `predict_proba` as if it were a probability. `CalibratedClassifierCV`, plus a
reliability plot in About, would be a genuinely sophisticated addition — and with 304 rows you should
expect the calibration to look bad, which is itself the honest finding.

**The dataset you're using has known limitations, and naming them is a credibility win.** The Kaggle
disease–symptom dataset is synthetic-ish, symptom combinations are near-duplicated ~120×, there's no
patient context, no severity, no duration, no lab data, and no temporal element. Say this plainly in
About. Reviewers find these problems anyway; finding them yourself first reads as competence.

---

## 7. Suggested sequencing

**Week 1 — stop being wrong.** Tier 1 items 1–10. Disclaimer modal, honest labels, real metrics from
`/health`, computed agreement badge, `GET /api/v1/symptoms`, loading and error UI, Flask error handlers.
Small diffs, and after this nothing in the app contradicts itself.

**Week 2 — make it usable.** Mobile nav, dark mode (or remove it), preset demo cases, symptom synonyms,
`localStorage` persistence, favicon, PDF export.

**Week 3 — make it credible.** SHAP explainability panel, soft-voting ensemble, calibration, low-confidence
abstain, real AWaRe classification server-side, honest limitations section in About.

**Week 4+ — make it distinctive.** Pick **one** of §3.1 (local antibiogram upload) or §3.2 (genotype
screening) and do it properly. One well-executed differentiator beats five half-built ones, and both of
these are things a reviewer will not have seen before in this project category.

---

## Sources

- [WHO GLASS — Global Antimicrobial Resistance and Use Surveillance System](https://www.who.int/initiatives/glass)
- [WHO AWaRe antibiotic book and classification](https://www.who.int/publications/i/item/9789240062382)
- [ECDC Surveillance Atlas of Infectious Diseases](https://www.ecdc.europa.eu/en/surveillance-atlas-infectious-diseases)
- [EUCAST clinical breakpoints](https://www.eucast.org/clinical_breakpoints)
- [CARD — Comprehensive Antibiotic Resistance Database](https://card.mcmaster.ca/)
- [NCBI AMRFinderPlus](https://www.ncbi.nlm.nih.gov/pathogens/antimicrobial-resistance/AMRFinder/)
- [BV-BRC — Bacterial and Viral Bioinformatics Resource Center](https://www.bv-brc.org/)
- [FDA — Clinical Decision Support Software guidance](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software)

Content from external sources was paraphrased and summarised for compliance with licensing restrictions.
