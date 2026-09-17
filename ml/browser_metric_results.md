# Cross-speaker linear metric: rejected

The fixed rank32 metric substantially worsens native AVP15–20 classification.
No test cohort was accessed, and no follow-up settings were selected from this
result. The frozen original baseline reproduces639/672 pooled core labels.

| Model | Correct raw | Correct pooled | Raw joint coreF1 | Pooled joint coreF1 |
| --- | ---: | ---: | ---: | ---: |
| Original production core | 595/672 | 639/672 | 84.94% | 91.22% |
| Fixed learned rank32 metric | 512/672 | 531/672 | 73.09% | 75.80% |

All conditions use the same707 native detections,694 references and672 matches;
22 missed references and35 unmatched detections are unchanged. Only feature
geometry/classification changes. The candidate remains below the original in
both independent and grouped predictions.

Candidate confusion, reference rows/predicted columns `hat,kick,snare`:

```text
Raw                 Eight-group pooled
223 26  36          251   9 25
 33 189 12           27 195 12
 41 12 100           51  17 85
```

Training's fixed triplet objective falls to0.07026 byepoch100, but validation
performance does not follow. This does not establish that the metric can model
unseen articulations; a small training objective is not a generalization result.
Snare correct falls136→85 with pooling. There is no reason to inspect the existing
test cohort or run the unchanged hat subtype combiner for this rejected candidate.

The settings were fixed in `ml/browser_metric_protocol.md` before fitting:
training-only input standardization, PCA-whitened rank32 linear initialization,
seed1709 cross-participant same-class positives, fixed nearest competing-class
negatives, equal participant×class anchor weights,100 full-batch Adam epochs and
one regularized margin objective. A projected training StandardScaler and C10RBF
SVM were saved with the projection before any validation features were read.

Reproduce using existing browser training/validation caches:

```sh
OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 /tmp/beatbox-ml/bin/python ml/browser_metric.py
```

Artifacts under `artifacts/browser-metric/`: `metric.pkl` (input scaler, projection,
projected scaler/classifier), `frozen-training.json` with complete training loss
history/model checksum, and `report.json` with predictions, confusions and
Fixed/Personal breakdowns. No private/reserved/test examples, production changes,
app edits, ports, deployment or retuning were involved.
