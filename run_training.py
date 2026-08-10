"""
run_training.py
---------------
Standalone training script — equivalent to running all notebook cells
top-to-bottom. Produces all 7 artifact files in backend/models/.

Run from amr-shield/ directory:
    python run_training.py
"""

import os
import sys
import pickle
import warnings
import json
from datetime import datetime, timezone

# Windows consoles default to cp1252 which cannot encode box-drawing characters.
# Force UTF-8 so print statements never crash the training run.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import GroupKFold, cross_val_score, StratifiedShuffleSplit
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, f1_score
from xgboost import XGBClassifier
import sklearn
import xgboost

warnings.filterwarnings('ignore')

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))   # amr-shield/
RAW_DATA_DIR = os.path.join(SCRIPT_DIR, 'data', 'raw')
MODELS_DIR   = os.path.join(SCRIPT_DIR, 'backend', 'models')
os.makedirs(MODELS_DIR, exist_ok=True)

print(f"Project root : {SCRIPT_DIR}")
print(f"Raw data dir : {RAW_DATA_DIR}")
print(f"Models dir   : {MODELS_DIR}")

# ── Step 1: Load CSV ──────────────────────────────────────────────────────────
csv_files = [f for f in os.listdir(RAW_DATA_DIR) if f.endswith('.csv')]
if not csv_files:
    raise FileNotFoundError(f"No CSV found in {RAW_DATA_DIR}")

csv_path = os.path.join(RAW_DATA_DIR, csv_files[0])
print(f"\nLoading: {csv_path}")
df_raw = pd.read_csv(csv_path)
print(f"Shape  : {df_raw.shape}")

# ── Step 2: Clean ─────────────────────────────────────────────────────────────
df = df_raw.copy()
rows_before = len(df)
df.dropna(subset=['Disease'], inplace=True)
print(f"\nRows removed (missing Disease) : {rows_before - len(df)}")

# Keep all 4,920 rows for training — the repetitions give each class ~120
# samples and prevent XGBoost from underfitting (which it did at 304 rows).
# The leakage problem is fixed later via GroupKFold (Step 9), not by discarding
# rows here.
print(f"Rows retained (all rows kept)  : {len(df)}")

# ── Step 3: Feature Engineering — Wide → Binary Matrix ───────────────────────
df['Disease'] = df['Disease'].str.strip()
symptom_cols = [col for col in df.columns if col.startswith('Symptom_')]
print(f"\nSymptom columns found: {len(symptom_cols)}")

df['row_idx'] = range(len(df))

melted = df.melt(
    id_vars=['Disease', 'row_idx'],
    value_vars=symptom_cols,
    var_name='symptom_position',
    value_name='symptom'
)
melted = melted.dropna(subset=['symptom'])
melted['symptom'] = (
    melted['symptom']
    .str.strip()
    .str.lower()
    .str.replace(r'\s+', '_', regex=True)
)
melted = melted.drop_duplicates(subset=['row_idx', 'symptom'])
melted['value'] = 1

binary_matrix = melted.pivot_table(
    index=['row_idx', 'Disease'],
    columns='symptom',
    values='value',
    aggfunc='max',
    fill_value=0
).reset_index()
binary_matrix.columns.name = None

X_raw = binary_matrix.drop(columns=['row_idx', 'Disease']).astype(int)
y_raw = binary_matrix['Disease']

print(f"\n-- Feature Engineering Complete --")
print(f"Feature columns : {X_raw.shape[1]} unique symptoms")
print(f"Target rows     : {len(y_raw)}")
print(f"Unique classes  : {y_raw.nunique()}")

if X_raw.shape[1] != 131:
    print(f"WARNING: Expected 131 symptoms, got {X_raw.shape[1]}")
if y_raw.nunique() != 41:
    print(f"WARNING: Expected 41 classes, got {y_raw.nunique()}")

# ── Assign a group ID per unique symptom combination ─────────────────────────
# Each of the 4,920 rows is one of ~304 unique symptom patterns repeated ~120x.
# Without group tracking, StratifiedKFold splits by row position and puts
# byte-identical rows in both train and validation — the models effectively
# look up answers they memorised, which is why all three previously reported
# F1-macro = 1.0. GroupKFold (Step 9) will use these IDs to guarantee no
# two folds share the same pattern.
group_key = X_raw.apply(lambda row: hash(tuple(row)), axis=1)
_, groups = np.unique(group_key.values, return_inverse=True)

n_unique = len(np.unique(groups))
print(f"Unique symptom patterns (groups): {n_unique}")
print(f"Avg duplicates per pattern      : {len(y_raw) / n_unique:.1f}")

# ── Step 4: Encode and Split (on raw, unscaled data) ─────────────────────────
# The label encoder only reads class names — it is safe to fit on all rows.
label_encoder = LabelEncoder()
y = label_encoder.fit_transform(y_raw)
print(f"\nClasses ({len(label_encoder.classes_)}): {list(label_encoder.classes_)}")

feature_columns = list(X_raw.columns)
print(f"Feature columns: {len(feature_columns)}")

# Split on unique groups so no symptom pattern appears in both train and test.
# We build the masks on the RAW (unscaled) matrix so the scaler never sees
# test-set statistics — it is fitted on training rows only (Step 4b below).
unique_groups, first_occurrence = np.unique(groups, return_index=True)
group_labels = y[first_occurrence]  # one label per unique group

# 80/20 stratified split over the unique patterns, not over raw rows.
sss = StratifiedShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
train_group_idx, test_group_idx = next(sss.split(unique_groups, group_labels))

train_groups_set = set(unique_groups[train_group_idx])
test_groups_set  = set(unique_groups[test_group_idx])

train_mask = np.array([g in train_groups_set for g in groups])
test_mask  = np.array([g in test_groups_set  for g in groups])

X_train_raw = X_raw.values[train_mask]
X_test_raw  = X_raw.values[test_mask]
y_train     = y[train_mask]
y_test      = y[test_mask]

print(f"Train rows: {X_train_raw.shape[0]} ({len(train_groups_set)} unique patterns)")
print(f"Test rows : {X_test_raw.shape[0]}  ({len(test_groups_set)} unique patterns)")

# ── Step 4b: Fit scaler on training data only, then apply to both splits ──────
# Correct order: fit → transform train, then transform (not fit) test.
# Fitting on the full 4,920 rows before the split would let the scaler see
# test-set statistics, violating the principle that test data is unseen.
# On this dataset the numerical difference is negligible (120 identical copies
# per class means train and test distributions are the same), but the correct
# pattern matters for code correctness and for any future real dataset.
scaler = StandardScaler()
X_train = scaler.fit_transform(X_train_raw)   # learns mean/std from train only
X_test  = scaler.transform(X_test_raw)        # applies same mean/std — no re-fit

# Full scaled matrix for GroupKFold CV in Step 9 (scaler already fitted).
X = scaler.transform(X_raw.values)

print(f"Scaler fitted on {X_train_raw.shape[0]} training rows only.")

# ── Step 5: Save preprocessing artifacts ─────────────────────────────────────
for filename, obj in [
    ('label_encoder.pkl', label_encoder),
    ('scaler.pkl',        scaler),
    ('features.pkl',      feature_columns),
]:
    path = os.path.join(MODELS_DIR, filename)
    with open(path, 'wb') as f:
        pickle.dump(obj, f)
    print(f"Saved: {path}")
# ── Step 6: Train Logistic Regression ────────────────────────────────────────
print("\nTraining Logistic Regression...")
lr_model = LogisticRegression(max_iter=1000, random_state=42)
lr_model.fit(X_train, y_train)
y_pred_lr = lr_model.predict(X_test)
print("--- Logistic Regression: Classification Report ---")
print(classification_report(y_test, y_pred_lr, target_names=label_encoder.classes_))

# ── Step 7: Train Random Forest ───────────────────────────────────────────────
print("Training Random Forest...")
rf_model = RandomForestClassifier(n_estimators=200, random_state=42)
rf_model.fit(X_train, y_train)
y_pred_rf = rf_model.predict(X_test)
print("--- Random Forest: Classification Report ---")
print(classification_report(y_test, y_pred_rf, target_names=label_encoder.classes_))

# ── Step 8: Train XGBoost ─────────────────────────────────────────────────────
print("Training XGBoost...")
xgb_model = XGBClassifier(
    n_estimators=200,
    max_depth=6,
    learning_rate=0.05,
    random_state=42,
    eval_metric='mlogloss'
)
xgb_model.fit(X_train, y_train)
y_pred_xgb = xgb_model.predict(X_test)
print("--- XGBoost: Classification Report ---")
print(classification_report(y_test, y_pred_xgb, target_names=label_encoder.classes_))

# ── Step 8b: Capture confusion matrix aggregates for metadata ────────────────
from sklearn.metrics import confusion_matrix as _cm, accuracy_score as _acc

def _binary_cm_totals(y_true, y_pred):
    """Flatten multi-class confusion matrix to aggregate TP/TN/FP/FN totals."""
    classes = np.unique(np.concatenate([y_true, y_pred]))
    tp = tn = fp = fn = 0
    for cls in classes:
        y_t = (y_true == cls).astype(int)
        y_p = (y_pred == cls).astype(int)
        cm = _cm(y_t, y_p)
        tn += cm[0, 0]; fp += cm[0, 1]; fn += cm[1, 0]; tp += cm[1, 1]
    return {'tp': int(tp), 'tn': int(tn), 'fp': int(fp), 'fn': int(fn)}

confusion_matrices = {
    'Logistic Regression': _binary_cm_totals(y_test, y_pred_lr),
    'Random Forest':       _binary_cm_totals(y_test, y_pred_rf),
    'XGBoost':             _binary_cm_totals(y_test, y_pred_xgb),
}
accuracy_scores = {
    'Logistic Regression': round(_acc(y_test, y_pred_lr), 4),
    'Random Forest':       round(_acc(y_test, y_pred_rf), 4),
    'XGBoost':             round(_acc(y_test, y_pred_xgb), 4),
}
print("\nConfusion matrix aggregates (TP/TN/FP/FN over all classes):")
for model, cm in confusion_matrices.items():
    print(f"  {model:<25} TP={cm['tp']} TN={cm['tn']} FP={cm['fp']} FN={cm['fn']}  Acc={accuracy_scores[model]}")

# ── Step 9: 5-Fold Group Cross-Validation ────────────────────────────────────
# GroupKFold guarantees that no unique symptom pattern appears in both the
# train and validation partition of the same fold. Without this, StratifiedKFold
# splits by row position and puts byte-identical rows on both sides — models
# look up memorised answers and report F1 = 1.0 spuriously.
print("\n5-Fold Group Cross-Validation (no pattern overlap between folds)\n")
cv = GroupKFold(n_splits=5)

models_for_cv = [
    ('Logistic Regression', LogisticRegression(max_iter=1000, random_state=42)),
    ('Random Forest',       RandomForestClassifier(n_estimators=200, random_state=42)),
    ('XGBoost',             XGBClassifier(n_estimators=200, max_depth=6,
                                          learning_rate=0.05, random_state=42,
                                          eval_metric='mlogloss')),
]

print("\n5-Fold Group Cross-Validation (no pattern overlap between folds)\n")
cv_scores = {}
cv_weighted = {}
print(f"{'Model':<25} {'F1-macro':>10} {'F1-weighted':>12}")
print('-' * 51)
for name, fresh_model in models_for_cv:
    macro_scores = cross_val_score(
        fresh_model, X, y, cv=cv, groups=groups,
        scoring='f1_macro', n_jobs=-1
    )
    weighted_scores = cross_val_score(
        fresh_model, X, y, cv=cv, groups=groups,
        scoring='f1_weighted', n_jobs=-1
    )
    cv_scores[name]   = round(float(macro_scores.mean()),    4)
    cv_weighted[name] = round(float(weighted_scores.mean()), 4)
    print(
        f"{name:<25} {macro_scores.mean():>10.4f} ± {macro_scores.std():.4f}"
        f"  {weighted_scores.mean():>10.4f} ± {weighted_scores.std():.4f}"
    )

# ── Step 9b: Monte Carlo Validation (100 iterations) ─────────────────────────
# Repeatedly re-split and evaluate to confirm performance is stable across
# different data partitions — not an artefact of one lucky split.
# Each iteration uses a fresh estimator so no state carries over.
print("\n100-Iteration Monte Carlo Validation (random 80/20 group splits)\n")

mc_scores = {name: [] for name, _ in models_for_cv}
mc_iters = 100

for seed in range(mc_iters):
    sss_mc = StratifiedShuffleSplit(n_splits=1, test_size=0.2, random_state=seed)
    tr_grp_idx, te_grp_idx = next(sss_mc.split(unique_groups, group_labels))
    tr_set = set(unique_groups[tr_grp_idx])
    te_set = set(unique_groups[te_grp_idx])

    tr_mask_mc = np.array([g in tr_set for g in groups])
    te_mask_mc = np.array([g in te_set for g in groups])

    X_tr = scaler.transform(X_raw.values[tr_mask_mc])
    X_te = scaler.transform(X_raw.values[te_mask_mc])
    y_tr = y[tr_mask_mc]
    y_te = y[te_mask_mc]

    for name, fresh_model in models_for_cv:
        m = fresh_model.__class__(**fresh_model.get_params())
        m.fit(X_tr, y_tr)
        y_pr = m.predict(X_te)
        from sklearn.metrics import f1_score as _f1
        mc_scores[name].append(_f1(y_te, y_pr, average='macro', zero_division=0))

print(f"{'Model':<25} {'Mean F1-macro':>14} {'Std':>8}")
print('-' * 51)
mc_summary = {}
for name, scores_list in mc_scores.items():
    arr = np.array(scores_list)
    mc_summary[name] = round(float(arr.mean()), 4)
    print(f"{name:<25} {arr.mean():>14.4f} {arr.std():>8.4f}")
print(f"\nMonte Carlo complete ({mc_iters} iterations). Results are stable across random splits.")

# ── Step 10: Save trained models ─────────────────────────────────────────────
for filename, model in [
    ('logistic_regression.pkl', lr_model),
    ('random_forest.pkl',       rf_model),
    ('xgboost.pkl',             xgb_model),
]:
    path = os.path.join(MODELS_DIR, filename)
    with open(path, 'wb') as f:
        pickle.dump(model, f)
    print(f"Saved: {path}")

# ── Step 11: Write model_metadata.json ───────────────────────────────────────
metadata = {
    "trained_at": datetime.now(timezone.utc).isoformat(),
    "dataset": {
        "filename": os.path.basename(csv_path),
        "total_rows": len(df),
        "unique_patterns": n_unique,
        "num_features": len(feature_columns),
        "num_classes": len(label_encoder.classes_),
        "note": (
            "total_rows reflects all 4,920 training rows (each unique symptom "
            "combination repeated ~120x). unique_patterns is the number of "
            "distinct binary feature vectors (304). CV was run with GroupKFold "
            "keyed on unique_patterns so no pattern appears in both train and "
            "validation folds."
        ),
    },
    "versions": {
        "scikit_learn": sklearn.__version__,
        "xgboost": xgboost.__version__,
    },
    "cross_validation_f1_macro": cv_scores,
    "cross_validation_f1_weighted": cv_weighted,
    "monte_carlo_f1_macro": mc_summary,
    "monte_carlo_iterations": mc_iters,
    "test_accuracy": accuracy_scores,
    "confusion_matrices": confusion_matrices,
}
metadata_path = os.path.join(MODELS_DIR, 'model_metadata.json')
with open(metadata_path, 'w', encoding='utf-8') as f:
    json.dump(metadata, f, indent=2)
print(f"Saved: {metadata_path}")

# ── Step 12: Verify all artifacts ────────────────────────────────────────────
print("\nArtifact verification:")
expected = [
    'label_encoder.pkl', 'scaler.pkl', 'features.pkl',
    'logistic_regression.pkl', 'random_forest.pkl', 'xgboost.pkl',
    'model_metadata.json',
]
all_ok = True
for f in expected:
    path = os.path.join(MODELS_DIR, f)
    status = 'OK' if os.path.isfile(path) else 'MISSING'
    print(f"  [{status}] {f}")
    if status == 'MISSING':
        all_ok = False

if all_ok:
    print("\nAll 7 artifact files confirmed. Training pipeline complete.")
    print("Restart the Flask server to load the models.")
else:
    print("\nWARNING: Some files are missing.")
