# Train relative SVMs using the browser audio pipeline

This bounded experiment tests whether Python/browser preprocessing differences
hurt generalization. It replaces only training feature extraction with the exact
browser `resampleRelative` and `recordingFeatures` functions. It does not change
production models, detector thresholds, feature definitions or grouping rules.

## Protocol

- Train on public AVP performers 1–14 annotated improvisation recordings only:
  27 recordings, 1,161 events. Explicit participant/mode/filename allowlists and
  resolved-path assertions prevent reading other audio.
- Decode original WAV to float32 mono at its native sample rate, then use Chromium
  OfflineAudioContext resampling and the exact application feature code. Training
  crops use annotated starts and next annotated starts, as in the original model.
- Fit separate three-class and four-class StandardScaler + RBF SVC pipelines.
  Scalers see training events only. C grid is exactly 1, 3, 10; gamma is scale.
- Evaluate cached native-browser validation features from performers 15–20:
  707 neural detections, 694 reference events, 672 one-to-one matches within50ms.
  No validation event enters model fitting. All detected events, including
  unmatched events, participate in normalization and grouping.
- Report independent predictions and fixed eight-Ward-group/full-mean OVO voting.
  Select C separately per target by grouped joint labeled-event F1; smaller C
  wins ties. The grouping settings are fixed before this experiment.
- No private audio, performers 21–28 or reserved external tests are inspected.
  This repeatedly used validation cohort is development evidence, not an
  independent estimate of final generalization.

Joint labeled-event F1 is `2 * correctly labeled matches / (detections + references)`.
Matched classification accuracy omits onset misses and extra detections.

## Results

Every row uses the same native validation cohort. Counts are out of672 matches.

| Classes | C | Raw correct | Grouped correct | Grouped core correct | Grouped joint F1 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 3 | 1 | 605 | 621 | 621 | 88.65% |
| 3 | 3 | 596 | 633 | 633 | 90.36% |
| **3** | **10 selected** | **595** | **639** | **639** | **91.22%** |
| **4** | **1 selected** | **555** | **591** | **624** | **84.37%** |
| 4 | 3 | 535 | 577 | 631 | 82.37% |
| 4 | 10 | 528 | 585 | 637 | 83.51% |

The original Python-trained three-class grouped model gives628/672 labels and
89.65% jointF1 on these exact native features. Browser-trained C10 improves this
to639/672 (95.09% matched classification) and91.22% jointF1. The requested overall
95% transcription target remains unmet.

Selected three-class grouped confusion, rows truth and columns prediction,
`hat, kick, snare`:

```text
281   2   2
  9 222   3
 17   0 136
```

Matched recalls: hat98.60%, kick94.87%, snare88.89%.

The earlier Python-trained four-class C3 grouped model gave525/672 four-class
labels and597 core labels on these native features. Browser-trained four-class
C1 improves to591 four-class labels (87.95%) and624 core labels (92.86%). Open-hat
recall improves from48/103 to84/103. Four-class jointF1 is84.37%; core jointF1
is89.08%. The best four-class C is chosen by four-class performance, not core
performance.

Selected four-class grouped confusion, `closed hat, open hat, kick, snare`:

```text
155 24   2   1
  9 84   0  10
  8  0 223   3
 18  6   0 129
```

These candidates support the preprocessing-mismatch hypothesis but do not yet
justify deployment. No new binary export, app wiring or test evaluation was done.
The existing diversity gate remains necessary for relative-feature models on
single-instrument recordings; this experiment does not replace or evaluate it.

## Reproduction and outputs

Prerequisites are the existing public AVP source and event metadata, the existing
ML environment, the cached native validation features from the four-relative
experiment, and Vite running on port5178. No dependencies were added or replaced.

```sh
OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 /tmp/beatbox-ml/bin/python ml/browser_relative_prepare.py
node ml/browser_relative_extract.mjs
OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 /tmp/beatbox-ml/bin/python ml/browser_relative_train.py
```

`artifacts/browser-relative/` contains the explicit training manifest, native
training audio floats, browser feature arrays, all trial scores and predictions
in `report.json`, and separate selected `browser-relative-3.pkl` and
`browser-relative-4.pkl` models. The original `artifacts/core-model/relative.pkl`
and production binary are never written by these scripts.

## Frozen combination and broader check

Before reading test audio, the C10 three-class model and C1 four-class model were
frozen with SHA256 checksums in `combiner-frozen.json`. A single predefined
combination takes the three-class pooled core prediction. Only when that class
is hat does it use the sign of the four-class closed/open OVO margin, averaged
within that model's own eight Ward groups. Positive means closed, otherwise open.
No thresholds or extra candidate combinations were selected.

On native validation, this combination gives605/672 four-class labels (90.03%)
and639/672 core labels (95.09%). JointF1 is86.37% four-class and91.22% core.
Validation confusion, closed/open/kick/snare:

```text
155 25   2   0
  9 92   0   2
  9  0 222   3
  9  8   0 136
```

Root then authorized a frozen evaluation on the **previously inspected** AVP
performers21–28. These are not new independent test data. The explicit path
allowlist covers14 public improvisation recordings only; reserved external and
private audio remain untouched. Original native samples pass through the actual
browser resampler, neural detector and feature extraction. All models receive
identical1179 detections,1163 reference events and1141 matched events. Existing
TypeSafe answers from a different onset cohort are not reused in these scores.

| Frozen model | Core correct | Core jointF1 | Four-class correct | Four-class jointF1 |
| --- | ---: | ---: | ---: | ---: |
| Original independent core | 877/1141 | 74.89% | — | — |
| Original grouped core | 950/1141 | 81.13% | — | — |
| Browser-trained independent core | 918/1141 | 78.39% | — | — |
| Browser-trained grouped core | 962/1141 | 82.15% | — | — |
| Browser-trained grouped four-class | 960/1141 | 81.98% | 837/1141 | 71.48% |
| Frozen core/subtype combination | 962/1141 | 82.15% | 839/1141 | 71.65% |

The grouped core improvement is12 correct labels, all in Fixed articulation
recordings (564→576 of606). Personal articulation totals remain386/535. Thus
matching preprocessing helps but does not resolve unfamiliar snare articulation.
These pure model scores do not include production's diversity gate or TypeSafe
noncore retention; that exact hybrid comparison is a separate task.

Frozen combined test confusion, closed/open/kick/snare:

```text
165 42  13   1
 81 139  2  10
 13   3 390  4
 66  54  13 145
```

Core confusion:

```text
427 15  11
 16 390  4
120 13 145
```

Reproduce the frozen checks after the train/validation commands:

```sh
OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 /tmp/beatbox-ml/bin/python ml/browser_relative_combiner.py
OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 /tmp/beatbox-ml/bin/python ml/browser_relative_test_prepare.py
node ml/browser_relative_test_extract.mjs
OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 /tmp/beatbox-ml/bin/python ml/browser_relative_test_score.py
OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 /tmp/beatbox-ml/bin/python ml/browser_relative_event_export.py
```

`existing-test-report.json` contains all model comparisons and mode breakdowns.
`existing-test/native-manifest.json` gives exact browser onset timestamps and
native sample rates. Per-record float files contain original native audio and
browser features. `existing-test/predictions.json` exports original/new core and
four-class labels, Ward groups and pooled OVO margins for every detection, plus
combined labels, allowing downstream hybrid evaluation at identical boundaries.
No models or settings were changed after these results.
