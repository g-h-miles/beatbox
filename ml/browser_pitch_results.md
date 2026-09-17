# Browser pitch augmentation result

Reject the fixed ±2-semitone playback augmentation. Both development and previously inspected cohorts regress with the exact browser feature pipeline. No production changes.

| Cohort | Matched / detections / references | Baseline core / four correct | Augmented core / four correct | Core joint F1 baseline → augmented |
| --- | --- | --- | --- | --- |
| AVP15–20 development | 672 / 707 / 694 | 639 / 605 | 629 / 589 | 91.22% → 89.79% |
| AVP21–28 previously inspected | 1141 / 1179 / 1163 | 962 / 839 | 956 / 835 | 82.15% → 81.64% |

The [frozen protocol](browser_pitch_protocol.md) added two waveform playback-rate variants to each of the27training grooves and extracted their1104-dimensional features in Chromium using the app implementation. Together with originals,3483training examples had weight1/3 each. Fixed C10core/C1four models were hashed before evaluation. No augmentation magnitude, regularization, gate, onset, or label adjustment followed the result. All54browser extractions completed without page errors. Both fitted model and evaluation processes exited0.

These are the raw acoustic combiner outputs before TypeSafe noncore retention. Neither cohort is an independent holdout; this experiment provides no spoken boots-and-cats or seven-class proof. Full model hashes, training manifest and predictions are in ignored `artifacts/browser-pitch/`. Public training audio only. Production models and unquantized MIDI timestamps remain unchanged.
