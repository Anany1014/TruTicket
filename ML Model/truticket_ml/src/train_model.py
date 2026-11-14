"""
train_model.py
==============
Trains a 3-class Random Forest Classifier on `phase1_train.csv` strictly.
Features:
- Cross-validation inside training set only (Stratified 5-Fold)
- Imputation (SimpleImputer) + VarianceThreshold to drop zero-variance features
- Random Forest with class_weight='balanced'
- Saves trained model, pipeline, evaluation metrics, and feature importances
- Evaluates ONCE on phase1_test.csv without leakage or post-test tuning
"""

import json
from pathlib import Path
import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.feature_selection import VarianceThreshold
from sklearn.pipeline import Pipeline
from sklearn.model_selection import StratifiedKFold, cross_validate
from sklearn.metrics import (
    classification_report, confusion_matrix, accuracy_score,
    precision_recall_fscore_support
)

SRC_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SRC_DIR.parent
TRAIN_PATH = PROJECT_ROOT / "data" / "features" / "phase1_train.csv"
TEST_PATH = PROJECT_ROOT / "data" / "features" / "phase1_test.csv"
MODELS_DIR = PROJECT_ROOT / "models"
REPORTS_DIR = PROJECT_ROOT / "reports"
MODELS_DIR.mkdir(parents=True, exist_ok=True)
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

# Meta columns to exclude from training
META_COLS = ['session_id', 'sub_index', 'label', 'label_int', 'binary_label', 'split', 'phase']

def get_feature_and_target_matrices():
    train_df = pd.read_csv(TRAIN_PATH)
    test_df = pd.read_csv(TEST_PATH)
    
    feature_cols = [c for c in train_df.columns if c not in META_COLS]
    
    X_train = train_df[feature_cols].copy()
    y_train = train_df['label_int'].values
    labels_train = train_df['label'].values
    
    X_test = test_df[feature_cols].copy()
    y_test = test_df['label_int'].values
    labels_test = test_df['label'].values
    
    return X_train, y_train, labels_train, X_test, y_test, labels_test, feature_cols

def build_model_pipeline(random_state=42):
    # Pipeline handles imputation and variance pruning inside CV folds to prevent leakage
    pipeline = Pipeline([
        ('imputer', SimpleImputer(strategy='median')),
        ('variance_selector', VarianceThreshold(threshold=0.0)),
        ('rf', RandomForestClassifier(
            n_estimators=100,
            max_depth=6,
            min_samples_split=4,
            min_samples_leaf=2,
            class_weight='balanced',
            random_state=random_state,
            n_jobs=-1
        ))
    ])
    return pipeline

def train_and_evaluate():
    print("=" * 60)
    print("TruTicket Random Forest Classifier Training (Phase 1)")
    print("=" * 60)
    
    X_train, y_train, labels_train, X_test, y_test, labels_test, feature_cols = get_feature_and_target_matrices()
    
    print(f"X_train shape: {X_train.shape}, X_test shape: {X_test.shape}")
    print(f"Target distribution train: {dict(pd.Series(y_train).value_counts())}")
    print(f"Target distribution test : {dict(pd.Series(y_test).value_counts())}")
    
    pipeline = build_model_pipeline(random_state=42)
    
    # 1. Stratified 5-Fold Cross-Validation on Training set ONLY
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    scoring = ['accuracy', 'f1_macro', 'precision_macro', 'recall_macro']
    cv_results = cross_validate(pipeline, X_train, y_train, cv=skf, scoring=scoring, return_train_score=True)
    
    print("\n--- 5-Fold Stratified Cross-Validation Results (Training Set Only) ---")
    print(f"Mean CV Accuracy       : {np.mean(cv_results['test_accuracy']):.4f} (+/- {np.std(cv_results['test_accuracy']):.4f})")
    print(f"Mean CV Macro F1       : {np.mean(cv_results['test_f1_macro']):.4f} (+/- {np.std(cv_results['test_f1_macro']):.4f})")
    print(f"Mean CV Macro Precision: {np.mean(cv_results['test_precision_macro']):.4f} (+/- {np.std(cv_results['test_precision_macro']):.4f})")
    print(f"Mean CV Macro Recall   : {np.mean(cv_results['test_recall_macro']):.4f} (+/- {np.std(cv_results['test_recall_macro']):.4f})")
    
    # 2. Fit on Full Training Set
    pipeline.fit(X_train, y_train)
    
    # Extract selected feature names and importances
    selector = pipeline.named_steps['variance_selector']
    rf_step = pipeline.named_steps['rf']
    selected_mask = selector.get_support()
    selected_features = [f for f, s in zip(feature_cols, selected_mask) if s]
    importances = rf_step.feature_importances_
    
    feat_imp = pd.DataFrame({
        'feature': selected_features,
        'importance': importances
    }).sort_values('importance', ascending=False).reset_index(drop=True)
    
    print("\nTop 10 Features by Random Forest Importance:")
    print(feat_imp.head(10).to_string(index=False))
    feat_imp.to_csv(REPORTS_DIR / "rf_feature_importances.csv", index=False)
    
    # 3. Evaluate Once on Test Set
    y_test_pred = pipeline.predict(X_test)
    y_test_proba = pipeline.predict_proba(X_test)
    
    test_acc = accuracy_score(y_test, y_test_pred)
    prec_macro, rec_macro, f1_macro, _ = precision_recall_fscore_support(y_test, y_test_pred, average='macro')
    cm = confusion_matrix(y_test, y_test_pred)
    target_names = ['human (0)', 'moderate_bot (1)', 'advanced_bot (2)']
    report_dict = classification_report(y_test, y_test_pred, target_names=target_names, output_dict=True)
    report_str = classification_report(y_test, y_test_pred, target_names=target_names)
    
    print("\n--- Test Set Evaluation (phase1_test.csv) ---")
    print(f"Test Accuracy: {test_acc:.4f}")
    print(f"Test Macro F1: {f1_macro:.4f}")
    print("\nConfusion Matrix (Rows=True, Cols=Pred):")
    print(cm)
    print("\nClassification Report:")
    print(report_str)
    
    # 4. Save Model Pipeline
    model_bundle = {
        'pipeline': pipeline,
        'feature_cols': feature_cols,
        'selected_features': selected_features,
        'class_map': {0: 'human', 1: 'moderate_bot', 2: 'advanced_bot'},
        'cv_metrics': {
            'accuracy_mean': float(np.mean(cv_results['test_accuracy'])),
            'accuracy_std': float(np.std(cv_results['test_accuracy'])),
            'f1_macro_mean': float(np.mean(cv_results['test_f1_macro'])),
            'f1_macro_std': float(np.std(cv_results['test_f1_macro']))
        },
        'test_metrics': {
            'accuracy': float(test_acc),
            'f1_macro': float(f1_macro),
            'confusion_matrix': cm.tolist(),
            'classification_report': report_dict
        }
    }
    
    model_save_path = MODELS_DIR / "random_forest_pipeline.joblib"
    joblib.dump(model_bundle, model_save_path)
    print(f"\nModel pipeline bundle saved to: {model_save_path}")
    
    # Save Evaluation Summary Report
    eval_md = [
        "# TruTicket Model Training & Evaluation Report",
        "",
        "## 1. Experimental Setup",
        "- **Model**: 3-Class Random Forest Classifier (`n_estimators=100`, `max_depth=6`, `class_weight='balanced'`)",
        "- **Training Dataset**: `phase1_train.csv` (105 sessions, 35 human, 35 moderate bot, 35 advanced bot)",
        "- **Test Dataset**: `phase1_test.csv` (45 sessions, 15 human, 15 moderate bot, 15 advanced bot)",
        "- **Validation Protocol**: 5-Fold Stratified Cross-Validation on training set only. Missing value imputation and variance thresholding executed inside each CV fold.",
        "",
        "## 2. Cross-Validation Results (Training Set Only)",
        f"- **Mean Accuracy**: {np.mean(cv_results['test_accuracy']) * 100:.2f}% (+/- {np.std(cv_results['test_accuracy']) * 100:.2f}%)",
        f"- **Mean Macro F1**: {np.mean(cv_results['test_f1_macro']) * 100:.2f}% (+/- {np.std(cv_results['test_f1_macro']) * 100:.2f}%)",
        f"- **Mean Macro Precision**: {np.mean(cv_results['test_precision_macro']) * 100:.2f}% (+/- {np.std(cv_results['test_precision_macro']) * 100:.2f}%)",
        f"- **Mean Macro Recall**: {np.mean(cv_results['test_recall_macro']) * 100:.2f}% (+/- {np.std(cv_results['test_recall_macro']) * 100:.2f}%)",
        "",
        "## 3. Test Set Performance (Strictly Untouched Holdout)",
        f"- **Overall Test Accuracy**: {test_acc * 100:.2f}%",
        f"- **Macro F1 Score**: {f1_macro * 100:.2f}%",
        "",
        "### Confusion Matrix",
        "| True \\ Predicted | Human (0) | Moderate Bot (1) | Advanced Bot (2) |",
        "|---|---|---|---|",
        f"| **Human (0)** | {cm[0][0]} | {cm[0][1]} | {cm[0][2]} |",
        f"| **Moderate Bot (1)** | {cm[1][0]} | {cm[1][1]} | {cm[1][2]} |",
        f"| **Advanced Bot (2)** | {cm[2][0]} | {cm[2][1]} | {cm[2][2]} |",
        "",
        "### Per-Class Performance Breakdown",
        "```",
        report_str,
        "```",
        "",
        "## 4. Top Feature Importances (Gini Index)",
        "| Rank | Feature | Importance |",
        "|---|---|---|"
    ]
    for rank, row in feat_imp.head(10).iterrows():
        eval_md.append(f"| {rank + 1} | `{row['feature']}` | {row['importance']:.4f} |")
        
    with open(REPORTS_DIR / "model_evaluation_report.md", "w", encoding="utf-8") as f:
        f.write("\n".join(eval_md))
        
    print(f"Evaluation report written to {REPORTS_DIR / 'model_evaluation_report.md'}")
    return model_bundle

if __name__ == "__main__":
    train_and_evaluate()
