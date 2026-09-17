# Frozen onset threshold control

Reuse saved frozen-network probabilities from the peak-distance experiment;
no audio or network inference rerun. Keep minimum distance8frames and
prominence0.05 fixed. Candidate peak heights are exactly0.2,0.3,0.4,0.5,0.6.
Choose solely by onsetF1 on public AVP1–14 grooves. On exact ties choose nearest
0.4, then smaller threshold for any remaining equal-distance tie. Persist the
choice before validation scoring. Evaluate only selected and baseline0.4 on
AVP15–20; do not generate or inspect a validation threshold grid.

Use identical unshifted times and<50ms distance-sorted one-to-one matching.
Report extras/misses, class-specific misses, and fast-reference recall for both
members of adjacent IOI<100ms pairs and separately their later members. No test,
private or reserved audio/probabilities are read, and no production changes made.

## Outcome: keep0.4

Training chose0.5 and persisted that selection before validation. It did not
improve validation: onsetF1 fell from96.00% to95.72%. This provides no reason to
change the application's threshold.

| Threshold | Training detections | Training matches | Training onsetF1 |
| --- | ---: | ---: | ---: |
| 0.2 | 1258 | 1153 | 95.33% |
| 0.3 | 1213 | 1148 | 96.71% |
| 0.4 | 1190 | 1143 | 97.24% |
| **0.5 selected** | **1166** | **1135** | **97.55%** |
| 0.6 | 1139 | 1118 | 97.22% |

All training rows have1161 reference events. Training fast-event recall is4/6,
later-member recall1/3, for all five thresholds.

| Validation metric | Baseline0.4 | Selected0.5 |
| --- | ---: | ---: |
| Detections / references | 706 /694 | 685 /694 |
| Matched | 672 | 660 |
| OnsetF1 | 96.00% | 95.72% |
| Precision | 95.18% | 96.35% |
| Recall | 96.83% | 95.10% |
| Extras | 34 | 25 |
| Misses | 22 | 34 |
| Missed closed/open/kick/snare | 6 /1 /12 /3 | 7 /3 /20 /4 |
| Fast-event recall | 9/10 | 9/10 |
| Later fast-pair member recall | 4/5 | 4/5 |

The selected threshold removes9 extras but12 correct matches, including8 kicks.
No additional validation threshold was scored, and no threshold/network/classifier
or production files were modified. Results are Python preprocessing diagnostics,
not a claim of native browser equivalence or independent generalization.

Reproduce from saved training/validation probability arrays:

```sh
OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 /tmp/beatbox-ml/bin/python ml/peak_threshold_evaluate.py
```

Artifacts: `artifacts/peak-threshold/frozen-selection.json` and `report.json`,
including full per-record retained timestamps and class-specific misses.
