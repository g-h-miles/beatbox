# Native browser model hybrid comparison

The frozen browser-trained core model and four-class hat selector improved aggregate results on the previously inspected AVP test cohort, but reduced closed-hat accuracy and Personal-style four-class accuracy. This is evidence of a tradeoff, not a 95% transcription result.

## Protocol

Fourteen public AVP Fixed/Personal grooves from participants 21–28 were evaluated using the same 1,179 native browser onset detections. There were 1,163 reference hits and 1,141 one-to-one matches within 50 ms. The candidate was frozen using participants 1–14 for training and 15–20 for selection before this evaluation. This cohort had already been inspected in prior experiments; it is not a fresh final holdout. No reserved or private recordings were accessed.

Both hybrids share a single set of newly requested TypeSafe results: original audio at its recorded 44.1 kHz sample rate, `src/audio.ts` numeric descriptors, crops ending at the next predicted onset or 500 ms, and `activeDuration` excluding trailing silence. The request excludes acoustic evidence and examples. No descriptors, prompts, timestamps, thresholds, or model parameters were adjusted after seeing scores. The old 1,175-event Python-boundary response cache was not reused.

Both models use eight Ward groups and pooled pairwise margins. The deployed comparison uses the original three-class relative SVM and TypeSafe closed/open posterior to split hats. The candidate uses the frozen browser-trained three-class C=10 SVM, with the four-class C=1 model's hat-pair decision selecting closed/open. Both retain TypeSafe ride/crash/aux predictions and use the same training-only spectral diversity gate. The gate passes 13 recordings; P24 Personal fails it and retains TypeSafe unchanged.

## Results

Classification accuracy divides correct matched hits by 1,141. Joint F1 counts missing and extra detections: `2 × correctly labeled matches / (1,179 + 1,163)`.

| Pipeline | Core correct | Core accuracy | Core joint F1 | Four-label correct | Four-label joint F1 |
| --- | ---: | ---: | ---: | ---: | ---: |
| TypeSafe | 736 | 64.50% | 62.85% | 601 | 51.32% |
| Original pooled core, before guard | 950 | 83.26% | 81.13% | — | — |
| Candidate, before guard | 962 | 84.31% | 82.15% | 839 | 71.65% |
| Deployed guarded hybrid | 886 | 77.65% | 75.66% | 721 | 61.57% |
| Candidate guarded hybrid | 898 | 78.70% | 76.69% | 783 | 66.87% |

| Matched class | References | Deployed correct | Candidate correct |
| --- | ---: | ---: | ---: |
| Closed hat | 221 | 181 | 154 |
| Open hat | 232 | 59 | 138 |
| Kick | 410 | 379 | 377 |
| Snare | 278 | 102 | 114 |

Fixed-style four-label matches improve 354→438 of 606; Personal-style matches regress 367→345 of 535. Core matches improve 505→517 in Fixed and remain 381 in Personal. The aggregate gain therefore does not demonstrate improvement for every performer or style. Retention of noncore TypeSafe predictions reduces core accuracy, but this four-label dataset cannot establish a safe replacement policy for ride, crash, or auxiliary sounds.

## Reproduction and artifacts

`scripts/native-hybrid-compare.ts` prepares features by default; `--request` explicitly enables the public API requests. Completed responses are cached. Request starts are separated by at least 2.3 seconds, in batches of at most 24 hits. The script asserts raw native parity at 950 versus 962 correct core predictions before writing the report.

Local ignored artifacts under `artifacts/native-hybrid/` preserve the report, exact API features and probabilities, all native event times, frozen model groups and pooled margins, and every event's predicted labels. Source model predictions are in `artifacts/browser-relative/existing-test/predictions.json`. Python-exported model predictions on native features are used here; browser inference parity is validated separately. These results alone do not validate new speakers, spoken “boots and cats,” ride/crash/aux recognition, or actual MIDI import.
