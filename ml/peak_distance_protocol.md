# Frozen onset peak-distance experiment

No network fitting or classifier changes. Use `artifacts/ml-v2/transcriber.pt`
and the established Python librosa preprocessing/inference pipeline. Peak height
is fixed at0.4 and prominence0.05. Candidate minimum peak separations are exactly
8,12,16,20 model frames. Choose by training onsetF1 on public AVP1–14 annotated
grooves only, ties retain smaller distance. Save selection before evaluating
validation15–20; evaluate only selected and baseline8 on validation. No further
tuning, test/private/reserved reads, browser port, or deployment.

Match at<50ms with distance-sorted one-to-one pairs. Report precision, recall,F1,
extras, misses and missed counts for closed/open/kick/snare. Fast-reference events
are either member of an adjacent reference pair with IOI<100ms; report their
recall separately. Also report the later member of each such pair to reveal
minimum-separation suppression. Fast classification is based on references only
for scoring, never used by the peak selector. All matching uses unshifted times.

This is a Python diagnostic. Native browser preprocessing can differ, and any
improvement needs browser parity/evaluation before application changes.

## Result: reject the global gap increase

Training selected20frames (99.77ms) before validation inference. OnsetF1 slightly
improves on validation, but the wider gap removes real fast notes and therefore
fails the cadence-preservation goal. Do not change the application peak selector.

| Distance | Training detections | Training matches | Training F1 |
| --- | ---: | ---: | ---: |
| 8frames | 1190 | 1143 | 97.24% |
| 12frames | 1180 | 1142 | 97.57% |
| 16frames | 1169 | 1141 | 97.94% |
| **20frames selected** | **1164** | **1139** | **97.98%** |

All training rows have1161 reference events. Only baseline8 and selected20 were
scored on validation; no other validation candidate was considered.

| Validation metric | Baseline8 | Selected20 |
| --- | ---: | ---: |
| Detections / references | 706 /694 | 686 /694 |
| Matched | 672 | 666 |
| OnsetF1 | 96.00% | 96.52% |
| Precision | 95.18% | 97.08% |
| Recall | 96.83% | 95.97% |
| Extra detections | 34 | 20 |
| Missed references | 22 | 28 |
| Missed closed/open/kick/snare | 6 /1 /12 /3 | 7 /1 /16 /4 |
| Fast-event recall (either pair member) | 9/10 | 6/10 |
| Fast-event recall (later pair member) | 4/5 | 2/5 |

The subset of fast notes is small, but the observed deletion is concrete. Training
also loses fast notes: either-member recall4/6→3/6 and later-member1/3→0/3.
A higher overall F1 does not establish acceptable timing/cadence behavior.
This Python baseline has706 detections versus707 in the native browser audit;
no browser-equivalence claim is made. Network weights, timestamps of retained
peaks, classifiers and production files were not changed.

Reproduce using the existing ML environment:

```sh
OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 /tmp/beatbox-ml/bin/python ml/peak_distance_evaluate.py
```

Outputs under `artifacts/peak-distance/` include per-record frozen-network
probability arrays, `frozen-selection.json` written before validation inference,
and `report.json` containing full counts, per-class misses and retained onset
times. No test/private/reserved audio is accessed.
