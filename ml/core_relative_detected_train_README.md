# Training on detected crops (rejected)

This checks whether the SVM benefits from training crops that follow the deployed neural detector rather than reference onset boundaries. Only AVP performers 1–14 supply training examples. The complete recording, including unmatched predicted hits, is normalized first; unmatched labels are then excluded from the supervised fit. Candidate one uses 1,143 matched detected training events. Candidate two combines them with the original 1,161 reference-boundary events. Both use fixed C=3 and the existing descriptors and scaler pipeline.

On the existing P15–20 development cohort (706 detections, 694 references, 672 matches), the original model gets 592 correct core labels and84.57% labeled-event F1. Detected-only training gets580 and82.86%; combined training gets585 and83.57%. Neither improves the baseline, so neither is promoted. No test, reserved or private audio was used and no deployed model changed.

Run `python ml/core_relative_detected_train.py`. Checkpoints/reports are ignored in `artifacts/core-model/relative-detected-train`.
