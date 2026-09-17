# Recognition work: September 16–17, 2026

The requested >95% correctly timed and labeled zero-calibration transcription target has **not** been achieved. Onset detection and instrument classification are separate measurements. Do not market onset F1 as whole-transcription accuracy.

## Supported improvements

A frozen temporal onset model reduces false subdivisions and keeps longer, coherent classification crops. On the previously inspected AVP test cohort it produced 1,175 detections against 1,163 reference hits, with 1,139 matches within 50 ms: **97.43% onset F1**. Mean timing error among matched hits was 2.65 ms. These are four supported AVP classes, not ride/crash/breath or spoken-word validation.

With the same frozen recording-relative SVM, replacing RMS boundaries with neural boundaries improved conditional core classification from 73.22% to 78.84% and correctly labeled end-to-end F1 from 66.88% to 76.82%. Fixed articulations reached 91.07% conditional classification; free-choice articulations remained 64.98%. This SVM is not a production model.

A separate, preselected four-recording production-TypeSafe comparison (AVP performers 15/16, Fixed and Personal) tested the current prompt without examples or new trained-classifier evidence:

| Input pipeline | Four-label conditional accuracy | Four-label joint F1 | Core joint F1 |
| --- | ---: | ---: | ---: |
| Existing RMS | 76.85% | 71.40% | 75.97% |
| Neural boundaries, full crop duration | 73.37% | 68.71% | 80.00% |
| Neural boundaries, active sound duration | 79.40% | 74.35% | 79.06% |

Long crop windows were being described as long sounds even when their tails were silent, turning closed hats into open hats. Active duration uses a fixed 5 ms RMS window, 1 ms hop and 12%-of-peak threshold; it does not move note timestamps. Neural timing and every other submitted feature remained identical in that ablation. Four recordings support further validation, not a general accuracy claim.

## Rejected paths

- Broader AVP + MDV + Beatboxset1 supervised models did not reliably generalize. Selected CNN validation core accuracies were 79.0%, 70.4%, and 66.0% respectively; MDV noncore recall was 72.2%. Reserved MDV performers 11–13 remained untouched.
- ImageNet ResNet18 transfer did not improve the existing candidates.
- Training-only phonetic supervision did not improve the comparable acoustic network.
- Conservative within-recording repetition consensus changed no labels on the four TypeSafe comparison recordings. Relaxing its gates after inspecting labels would be benchmark tuning.
- Whisper base.en and Cloudflare Whisper large-v3-turbo both invented unrelated words over the public Freesound “G Beat Box boots n cats” recording. These outputs cannot be used as drum-label ground truth or forced into boot/cat mappings. Synthetic spoken tests are separate and do not establish human beatbox performance.

## Privacy and reproducibility

Raw recordings, personal checkpoints, and detailed benchmark outputs remain under ignored `artifacts/`. Public dataset sources and license boundaries are recorded in `scripts/data-sources.md`. Private training recordings never become public assets. Public test cohorts repeatedly examined during development are explicitly described as previously inspected; they are not fresh blind tests.

Reproduction scripts include `ml/neural_crop_evaluate.py`, `scripts/neural-typesafe-compare.ts --active-duration`, and the `ml/core_*` experiments. The app continues to preserve unquantized event times in MIDI; inferred tempo must never reposition detected notes.
