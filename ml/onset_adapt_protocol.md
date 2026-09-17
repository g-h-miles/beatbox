# Fixed classifier adaptation to candidate onset boundaries

Training only: original27 public AVP1–14 grooves. Extract candidate ONNX onsets
at fixed0.4 using research browser request interception, then original browser
relative1104features for all predicted hits. No annotation crop endpoints.
Match predictions to training annotations one-to-one by distance<50ms; unlabeled
hits remain in normalization/context but are excluded from supervised fitting.
Add matched candidate-boundary features to original1161 annotated-boundary browser
features, every sampleweight1, no weighting or hyperparameter grid.

Fit separate unweighted StandardScaler + RBF SVC(gamma=scale): C10 core3 and C1
closed/open/kick/snare4. Save both and checksums before validation scoring. Predict
with fixed8Ward/full mean OVO core labels; predicted hats use the four-model's
pooled closed/open pair margin, positiveclosed otherwiseopen, as in production.

Evaluate only already cached candidate native AVP15–20 (720detections) against
baseline oldonsets639core/605four and unchangedclassifiers newonsets629core/587four.
No test/private/reserved, other models, retuning, port/deploy or production edits.

## Outcome: reject

Browser extraction completed27 candidate ONNX requests with no browser errors.
1157 matched candidate-boundary training hits were added to1161 original annotated
training hits (2318 total). Both classifier models and checksums were saved before
validation scoring. No hyperparameter or feature changes followed the result.

| Native validation pipeline | Correct core | Correct four-class | Joint coreF1 | Joint fourF1 |
| --- | ---: | ---: | ---: | ---: |
| Existing onsets + existing classifiers | 639 | 605 | 91.22% | 86.37% |
| Candidate onsets + existing classifiers | 629 | 587 | 88.97% | 83.03% |
| Candidate onsets + adapted classifiers | 623 | 592 | 88.12% | 83.73% |

Both candidate rows share720 detections/694 references/683 matches,11 misses and37
extras. Adaptation recovers5 four-class labels but loses6 core labels compared with
unchanged classifiers on candidate boundaries. Both remain below the original
pipeline. The adaptation does not justify replacing onset or classification models.

Adapted confusion, rows truth/columns predicted, closed/open/kick/snare:

```text
162 21   2   0
 10 79   0  13
  7  1 232   2
 19 16   0 119
```

These are pure acoustic combiner results on previously exposed AVP15–20, not an
independent test or guarded TypeSafe hybrid. The classifier models are separate
research artifacts; existing production assets were not written.

Reproduce with Vite5178 and the independently exported onset candidate available:

```sh
node scripts/onset-adapt-extract.mjs
OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 /tmp/beatbox-ml/bin/python ml/onset_adapt_train.py
```

Outputs under `artifacts/onset-adapt/`: native training onsets/features,
`classifier-3.pkl`, `classifier-4.pkl`, `frozen-training.json` with model checksums,
and `report.json` with full per-record and Fixed/Personal results. No private,
reserved or test data are read. No app edits, port, deployment or further tuning.
