# Dual-detector association: guarded hybrid feasibility

Preserving the previous guarded labels while using the candidate detector's timestamps gives a small validation improvement: core joint F1 rises **89.51%→90.10%**, and four-label joint F1 **84.65%→85.15%**. This is a research feasibility result, not application integration or a 95% transcription result.

## Frozen comparison

The same 12 public AVP P15–20 recordings and 694 reference events are used. The predeclared association pairs old and candidate detections one-to-one in closest-time order within four frames (19.95465 ms). Candidate timestamps remain unchanged. Of 720 candidate events, 695 inherit the **exact cached current guarded-hybrid label** from their paired old event. This preserves baseline TypeSafe noncore retention; it does not apply the rejected group override.

Only the remaining 25 candidate events receive new TypeSafe requests. Their measured descriptors use the original audio, candidate onset, next candidate onset or 500 ms endpoint, and active duration. The existing diversity gate uses descriptors from all candidate events. For an unpaired event, the frozen candidate-crop acoustic label applies only if TypeSafe chooses a core class and the gate passes; otherwise the TypeSafe label is retained. The old and candidate gates pass on all 12 recordings.

The API prompt and model are unchanged, no examples or raw audio are sent, and requests contain at most 24 events with starts separated by at least 2.3 seconds. Exactly 25 new events were classified. No fitting, tuning, test/private audio access, or app code changes occurred. The cached baseline was asserted at 707 detections, 627 correct core labels, and 593 correct four-class labels before reporting.

## Results

| Measure | Cached current hybrid | Associated candidate hybrid |
| --- | ---: | ---: |
| Detected events | 707 | 720 |
| Matches within 50 ms | 672 | 683 |
| Missing reference events | 22 | 11 |
| Unmatched detections | 35 | 37 |
| Onset F1 | 95.93% | 96.61% |
| Correct core labels | 627 | 637 |
| Correct four-class labels | 593 | 602 |
| Core joint F1 | 89.51% | 90.10% |
| Four-class joint F1 | 84.65% | 85.15% |

Joint F1 uses `2 × correctly labeled matches / (detections + references)`. Matching is one-to-one by nearest absolute timing error within 50 ms. Both detection counts and matched reference membership change, so these label totals are not a same-event classifier-only comparison.

Conditional core accuracy is 93.30%→93.27%, and conditional four-class accuracy is 88.24%→88.14%. The improvement comes from recovering more correctly labeled events, rather than better accuracy among matched events. All 25 new TypeSafe choices were core, so this run does not exercise new-event noncore retention on genuine noncore sounds.

| Reference class | Old matched / correct | Candidate matched / correct |
| --- | ---: | ---: |
| Closed hat | 182 / 154 | 185 / 156 |
| Open hat | 103 / 90 | 102 / 89 |
| Kick | 234 / 219 | 242 / 227 |
| Snare | 153 / 130 | 154 / 130 |

Fixed-style correct core/four counts improve 329/315→332/318; Personal counts improve 298/278→305/284. Open-hat correct counts regress by one. Snare correct counts remain unchanged despite one additional matched snare.

| Recording | Core correct: old→candidate | Four-class correct: old→candidate |
| --- | ---: | ---: |
| P15 Fixed | 55→58 | 55→58 |
| P16 Fixed | 43→43 | 36→36 |
| P17 Fixed | 28→29 | 23→24 |
| P18 Fixed | 120→120 | 120→120 |
| P19 Fixed | 45→44 | 45→44 |
| P20 Fixed | 38→38 | 36→36 |
| P15 Personal | 17→18 | 17→18 |
| P16 Personal | 70→71 | 68→69 |
| P17 Personal | 21→21 | 20→20 |
| P18 Personal | 125→125 | 125→125 |
| P19 Personal | 37→38 | 23→23 |
| P20 Personal | 28→32 | 25→29 |

## Limits and artifacts

This design needs the previous detector/classification path to supply inherited labels in addition to the candidate onset path. It has not been implemented in the production UI or evaluated for its total runtime here. Cached baseline API answers make the paired-label comparison exact; this is not a fresh complete production request for both pipelines. The already-used validation cohort cannot establish unseen-speaker performance, genuine ride/crash/aux safety, or MIDI import quality.

`scripts/onset-association-hybrid.ts` prepares inputs by default and enables the 25 unpaired requests with `--request`. It reads the frozen mappings from `artifacts/onset-only/association-report.json` and cached baseline labels/audio from `artifacts/typesafe-group-validation/`. Full candidate descriptors, new probabilities, inherited event indices, labels, reference matches, and per-record reports are preserved under ignored `artifacts/onset-association-hybrid/`. No timestamps are snapped to the old detector, beat grid, or annotation.
