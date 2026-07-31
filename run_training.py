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

import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report
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
rows_after = len(df)
df.drop_duplicates(inplace=True)
print(f"Rows removed (duplicates)      : {rows_after - len(df)}")
print(f"Rows remaining                 : {len(df)}")

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

print(f"\n── Feature Engineering Complete ──")
print(f"Feature columns : {X_raw.shape[1]} unique symptoms")
print(f"Target rows     : {len(y_raw)}")
print(f"Unique classes  : {y_raw.nunique()}")

if X_raw.shape[1] != 131:
    print(f"WARNING: Expected 131 symptoms, got {X_raw.shape[1]}")
if y_raw.nunique() != 41:
    print(f"WARNING: Expected 41 classes, got {y_raw.nunique()}")

# ── Step 4: Encode, Scale, Split ─────────────────────────────────────────────
label_encoder = LabelEncoder()
y = label_encoder.fit_transform(y_raw)
print(f"\nClasses ({len(label_encoder.classes_)}): {list(label_encoder.classes_)}")

scaler = StandardScaler()
X = scaler.fit_transform(X_raw)
feature_columns = list(X_raw.columns)
print(f"\nFeature columns saved: {len(feature_columns)}")

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)
print(f"Train: {X_train.shape[0]}  Test: {X_test.shape[0]}")

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

# ── Step 9: 5-Fold Cross-Validation ──────────────────────────────────────────
print("\n5-Fold Stratified Cross-Validation (F1 macro)\n")
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
models_for_cv = [
    ('Logistic Regression', lr_model),
    ('Random Forest',       rf_model),
    ('XGBoost',             xgb_model),
]
cv_scores = {}
print(f"{'Model':<25} {'Mean F1':>10} {'Std F1':>10}")
print('-' * 47)
for name, model in models_for_cv:
    scores = cross_val_score(model, X, y, cv=cv, scoring='f1_macro', n_jobs=-1)
    cv_scores[name] = round(float(scores.mean()), 4)
    print(f"{name:<25} {scores.mean():>10.4f} {scores.std():>10.4f}")

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
        "rows_after_cleaning": len(df),
        "num_features": len(feature_columns),
        "num_classes": len(label_encoder.classes_),
    },
    "versions": {
        "scikit_learn": sklearn.__version__,
        "xgboost": xgboost.__version__,
    },
    "cross_validation_f1_macro": cv_scores,
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
