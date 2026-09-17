# Browser absolute plus relative features: rejected

Concatenating raw and standardized-relative descriptors worsens native validation.
The relative half has exact numeric parity with the original cached descriptors
for all39 training/validation recordings, so the result is not a changed-relative
feature implementation. Both2208feature classifiers were frozen before validation
features were read. No settings were adjusted after scoring.

| Model | Correct core /four | Joint core /four F1 |
| --- | ---: | ---: |
| Production relative-only pooled | 639 /605 | 91.22% /86.37% |
| Absolute+relative raw | 559 /519 | 79.80% /74.09% |
| Absolute+relative pooled | 554 /490 | 79.09% /69.95% |

All rows use707 native detections,694 reference events and672 matches, with22 misses
and35 extras unchanged. This condition does not improve either core identity or
hat subtype accuracy. No test cohort was accessed.

Candidate four-class confusion, reference rows/prediction columns,
closed/open/kick/snare:

```text
Raw                    Eight-group pooled
102 27   2 51          80 40   0 62
 13 85   0  5          24 76   0  3
 17  8 207  2           9 13 209  3
 14 12   2 125         21  7   0 125
```

The pooled model confuses65 hats with snares, versus2 in the production core
baseline. Preserving absolute acoustic shape in this representation does not
resolve the unfamiliar-timbre problem. It instead introduces substantial errors.

Training used only the original1161 AVP1–14 annotated browser examples with
unweighted StandardScaler+C10core/C1four RBF models and no grid. The exact frozen
specification is in `ml/browser_absolute_relative_protocol.md`. Root's browser
extractor produced the2208float feature files and verified both halves' layout.

```sh
OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 /tmp/beatbox-ml/bin/python ml/browser_absolute_relative_train.py
```

Artifacts: `artifacts/browser-absolute-relative/classifier-3.pkl`,
`classifier-4.pkl`, `frozen-training.json` and `report.json` with complete predictions
and confusions. This is pure acoustic development validation, not the guarded
TypeSafe hybrid. No private/reserved/test examples, production changes, port,
deployment or further tuning were involved.
