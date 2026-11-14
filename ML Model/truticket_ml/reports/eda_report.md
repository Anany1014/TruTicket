# TruTicket Phase 1: Exploratory Data Analysis (EDA) Report

## 1. Overview
- **Dataset analysed**: `phase1_train.csv` strictly (105 sessions, balanced across 3 classes: 35 Human, 35 Moderate Bot, 35 Advanced Bot).
- **Total raw features**: 45
- **Constant features detected**: 11
- **Active non-constant features**: 34

## 2. Zero-Variance (Non-Informative) Features
The following features have standard deviation of zero in the training dataset and provide zero predictive value:

- `mouse_speed_reliable` (Constant value: `1`)
- `mouse_has_data` (Constant value: `1`)
- `log_home_requests` (Constant value: `0`)
- `log_fingerprint_js_hits` (Constant value: `0`)
- `log_internal_requests` (Constant value: `0`)
- `log_gap_min_s` (Constant value: `0.0`)
- `log_http10_ratio` (Constant value: `0.0`)
- `log_has_fingerprint_js` (Constant value: `0`)
- `log_is_empty_ua` (Constant value: `0`)
- `log_referer_is_https_obs` (Constant value: `1`)
- `log_has_data` (Constant value: `1`)

## 3. High Multicollinearity Pairs (|r| >= 0.95)
These feature pairs carry almost identical redundant information:

| Feature 1 | Feature 2 | Absolute Pearson r |
|---|---|---|
| `log_mouse_post_count` | `log_max_url_repetitions` | 1.0000 |
| `mouse_total_moves` | `mouse_total_events` | 1.0000 |
| `log_post_requests` | `log_mouse_post_count` | 0.9991 |
| `log_post_requests` | `log_max_url_repetitions` | 0.9991 |
| `mouse_dist_mean` | `mouse_speed_mean_px_s` | 0.9979 |
| `log_total_requests` | `log_post_requests` | 0.9938 |
| `log_total_requests` | `log_mouse_post_count` | 0.9900 |
| `log_total_requests` | `log_max_url_repetitions` | 0.9900 |
| `log_post_requests` | `log_session_duration_s` | 0.9636 |
| `log_mouse_post_count` | `log_session_duration_s` | 0.9604 |
| `log_session_duration_s` | `log_max_url_repetitions` | 0.9604 |
| `log_unique_urls` | `log_unique_content_pages` | 0.9573 |
| `log_total_requests` | `log_session_duration_s` | 0.9519 |

## 4. Top Ranked Discriminative Features (ANOVA F-Score)
Features that exhibit the strongest statistical separation across human, moderate bot, and advanced bot classes:

| Rank | Feature | ANOVA F-statistic | p-value | Primary Signal |
|---|---|---|---|---|
| 1 | `mouse_dist_mean` | 1657.97 | 1.65e-78 | Discriminates bots vs human |
| 2 | `mouse_speed_mean_px_s` | 1498.50 | 2.43e-76 | Discriminates bots vs human |
| 3 | `mouse_dir_change_rate` | 284.52 | 1.88e-42 | Discriminates bots vs human |
| 4 | `mouse_dist_min` | 263.50 | 5.10e-41 | Discriminates bots vs human |
| 5 | `mouse_total_path_px` | 127.46 | 1.81e-28 | Discriminates bots vs human |
| 6 | `mouse_speed_std_px_s` | 112.57 | 1.54e-26 | Discriminates bots vs human |
| 7 | `mouse_direction_changes` | 72.66 | 2.41e-20 | Discriminates bots vs human |
| 8 | `mouse_straightness` | 69.19 | 1.03e-19 | Discriminates bots vs human |
| 9 | `mouse_total_moves` | 63.67 | 1.13e-18 | Discriminates bots vs human |
| 10 | `mouse_total_events` | 63.60 | 1.17e-18 | Discriminates bots vs human |

## 5. Key Findings for Model Training
1. **Mouse kinematic dynamics are overwhelmingly discriminative**: `mouse_dir_change_rate`, `mouse_speed_std_px_s`, `mouse_straightness`, and `mouse_dist_mean` provide immediate class separation.
2. **Advanced Bots mimic request volume but fail kinematics**: Advanced bots make similar HTTP request counts (~225 requests) as humans (~224 requests), but have highly mechanical direction changes (`mouse_dir_change_rate = 0.03` vs human `0.11`) and narrow speed deviation (`mouse_speed_std_px_s = 297` vs human `1194`).
3. **Moderate Bots fail both volume and kinematics**: Moderate bots exhibit lower request counts (~127) and extreme path jitter (`mouse_straightness = 0.11`, `mouse_dir_change_rate = 0.38`).
4. **Feature Selection strategy**: Pruning constant features and removing redundant collinear twins inside cross-validation avoids overfitting on small N=105 sample size.