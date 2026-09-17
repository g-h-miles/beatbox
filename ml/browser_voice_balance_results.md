# Performer-balanced SVM: rejected

Equal participant×class weighting does not improve the frozen browser-feature
pipeline. The original baseline assertions passed on both cohorts. Both weighted
models were frozen before either cohort was scored, with no subsequent tuning.

| Cohort | Original core /four correct | Weighted core /four correct | Original joint core /four F1 | Weighted joint core /four F1 |
| --- | ---: | ---: | ---: | ---: |
| AVP15–20 validation | 639 /605 | 639 /599 | 91.22% /86.37% | 91.22% /85.51% |
| Previously inspected AVP21–28 | 962 /839 | 958 /823 | 82.15% /71.65% | 81.81% /70.28% |

Validation has707detections/694references/672matches,22misses/35extras. The existing
test cohort has1179detections/1163references/1141matches,22misses/38extras. Counts
are unchanged because only classifier weighting differs.

Weighted confusion matrices, reference rows/predicted columns,
closed/open/kick/snare:

```text
Validation               Previously inspected test
168 11   2   1           191  28   1   1
 29 72   0   2           107 119   2   4
  9  0 222   3            17   1 390   2
 10  6   0 137           119  23  13 123
```

Test snare correct declines145→123 while core hat correct improves427→445. The
subtype tradeoff also worsens total four-class labels: closed correct165→191 but
open correct139→119. Equal performer contribution is therefore insufficient to
solve the weak unfamiliar-snare behavior and does not justify production changes.

This is previously exposed development evidence and an explicitly previously
inspected test cohort, not fresh independent validation. Scores cover the pure
acoustic combiner, not the TypeSafe/noncore guarded hybrid. No private or reserved
examples, production assets, app edits, port or deployment were involved.

## Reproduction

The prior-art check, exact weighting and frozen settings are in
`ml/browser_voice_balance_protocol.md`. Training uses the same1161 annotated browser
features. Every present participant×targetclass cell receives equal total weight,
normalized to overall mean1, in both StandardScaler and SVC.

```sh
OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 /tmp/beatbox-ml/bin/python ml/browser_voice_balance.py
```

Outputs under `artifacts/browser-voice-balance/`: separate `classifier-3.pkl` and
`classifier-4.pkl`, `frozen-training.json` with per-cell counts and hashes, and
`report.json` with complete baseline/candidate predictions and mode breakdowns.
Original production models remain unchanged.
