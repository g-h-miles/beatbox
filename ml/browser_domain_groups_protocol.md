# Single frozen size-scaled grouping diagnostic

Use the saved browser-domain C10 model unchanged; no retraining or candidate grid.
One rule: Ward cluster count=min(eventCount,max(8,ceil(eventCount/8))). Keep same
standardized1104features, all-hit context, full mean OVO margins and LIBSVM votes.
This bounds average group size, not every group's maximum size. No claim of a
strict per-group cap is made.

Evaluate only the same previously exposed native AVP15–20 and three Beatboxset
validation clips, separately DR/HT/consensus, and compare saved raw/fixed8 results.
No new validation selection, test/private/reserved reads, deployment or port.
Report each class and other retention. This is post-development diagnostic evidence,
not independent validation or an exact production hybrid comparison.

## Result

The one declared rule restores much of the long-clip performance lost by fixed8
pooling, but does not beat independent predictions on consensus and harms AVP.
It is not a release candidate; no additional group counts or blend were tried.

| Reference | Raw core | Fixed8 core | Scaled groups core | Raw /fixed8 /scaled other |
| --- | ---: | ---: | ---: | ---: |
| AVP | 611/672 | 636/672 | 628/672 | no references |
| Beatbox DR | 607/736 | 490/736 | 610/736 | 24 /0 /23 of486 |
| Beatbox HT | 800/1100 | 654/1100 | 802/1100 | 13 /0 /10 of145 |
| Beatbox consensus | 579/674 | 475/674 | 573/674 | 12 /0 /11 of103 |

All rows use the same candidate model and exact onset/feature caches. The AVP-only
frozen core baseline remains639/672, stronger than any grouped domain candidate.
Scaled-group joint mappedF1 is89.65% AVP,48.14% DR,58.25% HT and54.96% consensus.
Onset matches/misses/extras are unchanged because this is label-only processing.
Consensus unmatched events remain unverified extras, since its references omit
annotator disagreements.

Scaled-group confusions, rows reference and columns prediction,
`hat,kick,snare,other`:

```text
AVP                    Beatbox DR
265   2  18 0          265   7   9 19
  7 225   2 0           11 177   1  0
 15   0 138 0           44  31 168  4
  0   0   0 0          206 144 113 23

Beatbox HT             Beatbox consensus
336  13  37 18         239   1   2 15
 34 244   0 11           9 168   0  0
109  68 222  8          44  26 166  4
 52  45  38 10          40  26  26 11
```

Reproduce without loading training audio or fitting anything:

```sh
OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 /tmp/beatbox-ml/bin/python ml/browser_domain_groups.py
```

Output: `artifacts/browser-domain/groups-report.json`, including original/raw
comparison scores, group counts and observed largest group sizes, full class
confusions and per-record predictions. Model checksum is verified before scoring.
Original experiment files, model weights and production code remain unchanged.
