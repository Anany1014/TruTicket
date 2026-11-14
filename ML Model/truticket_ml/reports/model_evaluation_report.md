# TruTicket Model Training & Evaluation Report

## 1. Experimental Setup
- **Model**: 3-Class Random Forest Classifier (`n_estimators=100`, `max_depth=6`, `class_weight='balanced'`)
- **Training Dataset**: `phase1_train.csv` (105 sessions, 35 human, 35 moderate bot, 35 advanced bot)
- **Test Dataset**: `phase1_test.csv` (45 sessions, 15 human, 15 moderate bot, 15 advanced bot)
- **Validation Protocol**: 5-Fold Stratified Cross-Validation on training set only. Missing value imputation and variance thresholding executed inside each CV fold.

## 2. Cross-Validation Results (Training Set Only)
- **Mean Accuracy**: 100.00% (+/- 0.00%)
- **Mean Macro F1**: 100.00% (+/- 0.00%)
- **Mean Macro Precision**: 100.00% (+/- 0.00%)
- **Mean Macro Recall**: 100.00% (+/- 0.00%)

## 3. Test Set Performance (Strictly Untouched Holdout)
- **Overall Test Accuracy**: 100.00%
- **Macro F1 Score**: 100.00%

### Confusion Matrix
| True \ Predicted | Human (0) | Moderate Bot (1) | Advanced Bot (2) |
|---|---|---|---|
| **Human (0)** | 15 | 0 | 0 |
| **Moderate Bot (1)** | 0 | 15 | 0 |
| **Advanced Bot (2)** | 0 | 0 | 15 |

### Per-Class Performance Breakdown
```
                  precision    recall  f1-score   support

       human (0)       1.00      1.00      1.00        15
moderate_bot (1)       1.00      1.00      1.00        15
advanced_bot (2)       1.00      1.00      1.00        15

        accuracy                           1.00        45
       macro avg       1.00      1.00      1.00        45
    weighted avg       1.00      1.00      1.00        45

```

## 4. Top Feature Importances (Gini Index)
| Rank | Feature | Importance |
|---|---|---|
| 1 | `mouse_dir_change_rate` | 0.1532 |
| 2 | `mouse_direction_changes` | 0.1094 |
| 3 | `mouse_speed_mean_px_s` | 0.1001 |
| 4 | `mouse_speed_max_px_s` | 0.0969 |
| 5 | `mouse_speed_std_px_s` | 0.0902 |
| 6 | `mouse_dist_mean` | 0.0811 |
| 7 | `mouse_total_path_px` | 0.0769 |
| 8 | `mouse_dist_min` | 0.0638 |
| 9 | `mouse_straightness` | 0.0509 |
| 10 | `mouse_click_to_move` | 0.0315 |