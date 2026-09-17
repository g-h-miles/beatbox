# Exact-browser isolated insertion contexts: rejected

Adding2943 isolated training hits through their own participant/mode groove
contexts does not improve the frozen classifier. Original1161 groove features
remain byte-identical. The4104-row models were frozen before native validation.
No parameters were changed after scoring and no test cohort was read.

| Model | Correct core /four | Joint core /four F1 |
| --- | ---: | ---: |
| Production baseline pooled | 639 /605 | 91.22% /86.37% |
| Isolated-context augmented raw | 582 /522 | 83.08% /74.52% |
| Isolated-context augmented pooled | 610 /548 | 87.08% /78.23% |

All conditions use707 detections/694 reference events/672 matches,22 misses and35
extras. Unchanged original-baseline counts and labels were asserted exactly.

Pooled confusion, truth rows/prediction columns closed/open/kick/snare:

```text
121 58   2   1
  4 90   0   9
  8  2 223   1
 16 23   0 114
```

The regression concentrates in Personal articulation, precisely where improvement
was needed. Fixed core labels remain338/341 and four-class324→319. Personal core
falls301→272/331 and four-class281→229. Personal snare correct falls66→43; snare→hat
errors rise15→38. Overall snare correct falls136→114.

Largest per-record core regressions: P16Personal−11, P19Personal−9, P17Personal−5,
P15Personal−2 and P20Personal−2. P16Fixed improves by1 while P15Fixed loses1;
the remaining recordings have no net core change. Extra isolated repetitions do
not solve unseen articulation, even when inserted into a matching real groove
normalization context.

## Integrity and reproduction

The fixed plan is `docs/research/browser-isolated-context-plan.md`. Root's browser
extraction supplied108 isolated recordings/2943 examples, with `errors:[]` and
`originalParity:true`. Labels are729closed/734open/743kick/737snare. Training combines
those with1161 original examples, unweighted StandardScaler, SVCweights1/.5,
effective SVCweight2632.5, fixedC10core/C1four and eight-group full-margin pooling.
Original groove file hashes are checked before and after fitting.

The first scoring attempt stopped on a missing manifest `mode` field after models
were saved but before any validation score. The metadata lookup was corrected to
the existing record, and scoring resumed with the same checksum-verified models;
no retraining or model choice occurred.

```sh
OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 /tmp/beatbox-ml/bin/python ml/browser_isolated_context_train.py
```

To score already frozen models without fitting:

```sh
OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 /tmp/beatbox-ml/bin/python ml/browser_isolated_context_train.py --score-only
```

Outputs under `artifacts/browser-isolated-context/`: separate classifier pickles,
`frozen-training.json` with original/model hashes and training provenance, and
`report.json` with all predictions, confusions and Fixed/Personal comparisons.
This is previously exposed development validation of the pure acoustic combiner,
not the guarded TypeSafe hybrid. No production assets, app changes or deployment.
