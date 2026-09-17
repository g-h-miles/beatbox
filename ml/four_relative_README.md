# Four-class relative SVM: rejected for browser use

The four-class model separates closed hat, open hat, kick and snare. A small
validation gain with Python audio preprocessing did not survive native browser
resampling. Do not replace the production core model with this candidate.

## Frozen protocol

Training uses 1,161 public AVP annotated groove hits from performers 1–14 and the
existing 1,104 recording-relative features. No private recordings are included.
The only selection grid was RBF SVM C = 1, 3, 10, with `gamma='scale'` and a
training-fitted StandardScaler. C was chosen by four-class joint F1 on performers
15–20, with smaller C winning ties. C3 won. The original three-class model is
never overwritten. Performers 21–28 and reserved external tests were not read.

Every detected event participates in recording normalization, including events
that cannot be matched to a reference. Matching is distance-sorted, one-to-one,
within 50 ms. Features and crop boundaries never use reference labels. The
primary Python cohort has 706 detections, 694 annotations and 672 matches; the
original three-class model must reproduce 592 correct labels before fitting.

Joint labeled-event F1 is `2 * correctly labeled matches / (detections + references)`.
Matched classification accuracy excludes onset misses and false positives, so
it must not be presented as full transcription performance.

## Results

| Model / preprocessing | Correct four-class | Correct core | Four-class joint F1 | Core joint F1 |
| --- | ---: | ---: | ---: | ---: |
| Existing hybrid, Python cohort | 538/672 | 582/672 | 76.86% | 83.14% |
| C1, Python | 544/672 | 588/672 | 77.71% | 84.00% |
| **C3 selected**, Python | 552/672 | 595/672 | 78.86% | 85.00% |
| C10, Python | 549/672 | 593/672 | 78.43% | 84.71% |
| Frozen C3, native browser | 522/672 | 590/672 | 74.52% | 84.23% |
| C3 + fixed 8-group pooling, Python | 582/672 | 609/672 | 83.14% | 87.00% |
| C3 + fixed 8-group pooling, native browser | 525/672 | 597/672 | 74.95% | 85.22% |

The native browser cohort has 707 detections, 694 annotations and 672 matches.
It uses OfflineAudioContext resampling and the frozen browser neural detector.
The two preprocessing paths differ; they are not asserted to be bit-identical.
The grouped result uses exactly eight Ward groups on standardized features and
replaces all six OVO margins by their within-group means before LIBSVM voting.
Those settings came from the separate three-class experiment and were not tuned
for this candidate.

Confusion matrices have reference rows and prediction columns, in order
`closed hat, open hat, kick, snare`:

```text
C3 Python                 C3 browser
127 26   3  26             127 25   3  27
 17 74   0  12              43 52   0   8
  8  0 225   2               9  1 220   4
 15  6   5 126              17  6   7 123

C3 grouped Python         C3 grouped browser
132 22   2  26             128 26   2  26
  5 91   0   7              46 48   0   9
  7  0 227   1               8  0 224   2
 13  6   1 132              11  6  11 125
```

Open-hat recall falls from 91/103 to 48/103 in the grouped candidate. The four-class
model therefore does not justify a browser port despite its Python score. This
is development evidence from repeatedly used validation voices, not independent
test performance or a claim of 95% accuracy.

## Reproduction

Prerequisites: the existing relative-parity fixtures/caches, event metadata and
ML environment used by the other relative-model experiments. Native extraction
requires Vite running at `http://127.0.0.1:5178` and installed Playwright Chromium.
No dependencies were added or replaced.

```sh
node ml/four_relative_native.mjs
OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 /tmp/beatbox-ml/bin/python ml/four_relative_train.py
OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 /tmp/beatbox-ml/bin/python ml/four_relative_consistency.py
```

Artifacts are under `artifacts/four-relative/`: `four-relative.pkl`, `report.json`,
`consistency-report.json`, `native-manifest.json` and per-record native feature
arrays. The pickle contains only the separately fitted public-data model.

## Original three-class model: native browser release check

`ml/relative_consistency_native.py` applies the original frozen three-class model
and the fixed eight-group/full-margin rule to exactly those cached native browser
features. There is no refitting or parameter selection. All 707 events contribute
to grouping, including unmatched detections. The baseline assertion is 590/672.

| Native browser model | Correct / matched | Classification | Joint labeled-event F1 |
| --- | ---: | ---: | ---: |
| Original independent SVM | 590/672 | 87.80% | 84.23% |
| Fixed grouped SVM | 628/672 | 93.45% | 89.65% |
| Grouped: Fixed articulation subset | 338/341 | 99.12% | 94.81% |
| Grouped: Personal articulation subset | 290/331 | 87.61% | 84.30% |

Grouped confusion, `hat, kick, snare`:

```text
280   2   3
  8 224   2
 18  11 124
```

Matched-event recalls are hat 280/285 (98.25%), kick 224/234 (95.73%), snare
124/153 (81.05%). Onset F1 remains 95.93%; this rule changes labels only.
The overall core transcription target of 95% is still unmet. Single-instrument
recordings remain outside the relative model's valid use without the separately
implemented diversity gate; this check does not test or replace that gate.

```sh
OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 /tmp/beatbox-ml/bin/python ml/relative_consistency_native.py
```

Output: `artifacts/relative-consistency/native-report.json`, including baseline,
grouped scores, mode breakdowns, model checksum and per-record matched predictions.
