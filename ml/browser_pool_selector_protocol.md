# Train-only pooling selector

Use existing native browser features and the same four target mapping as the
browser-domain experiment. Training sources: AVP1–14 annotated grooves and first8
Beatboxset training recordings, native predicted boundaries and mapped DR/HT
consensus labels. All unlabeled events remain in record normalization/grouping.

Generate OOF predictions using4 StratifiedGroupKFold folds, shuffle=True,
random_state1709. Group AVP records by participant; Beatboxset by recording.
Each fold's weighted StandardScaler and C10 RBF SVC(gamma=scale) use only labeled
fold-training events, equal total weight per domain×presentclass normalizedmean1.
Held-out recording features were independently normalized using all its events.
Cluster all held-out events with fixed8 Ward groups; average six OVO margins.

Selector features fixed before validation:6 raw OVO margins,6 pooled margins,
4 raw votes,4 pooled votes, cluster-size/event-count, mean Euclidean distance of
cluster members to its centroid divided bysqrt1104, and fraction of cluster raw
labels agreeing with this event's raw label (23features total). Train a separate
StandardScaler + LogisticRegression(C1,class_weight=balanced) using only labeled
OOF disagreements where exactly one option is correct. Target1 means pool.
At inference, use the selector when raw and pooled disagree; probability>=0.5
means pooled. Agreements remain unchanged. No hyperparameter/threshold selection.

Save selector before validation. Final inference reuses unchanged full trained
browser-domain.pkl, never refitted. Compare same native AVP15–20 and existing
Beatboxset validation DR/HT/consensus, separately, with raw/fixed8 and frozen
AVP-only core baseline. No test/private/reserved access or app/port/deploy changes.
All validation is previously exposed development evidence.

## Outcome: reject

The frozen selector was fit to300 OOF disagreements with exactly one correct
option (166 favored raw,134 favored pooling). Across validation there were470
raw/pooled disagreements; the selector chose pooling for132. All fold models used held-out performer/recording groups and all context
events for their Ward clustering. Selector weights and model checksums were saved
before validation feature loading. No selection or threshold adjustments followed.

| Validation | Candidate raw core | Candidate fixed8 core | Selector core | Old AVP-only pooled core |
| --- | ---: | ---: | ---: | ---: |
| AVP | 611/672 | 636/672 | 629/672 | 639/672 |
| Beatbox DR | 607/736 | 490/736 | 589/736 | 465/736 |
| Beatbox HT | 800/1100 | 654/1100 | 778/1100 | 632/1100 |
| Beatbox consensus | 579/674 | 475/674 | 564/674 | 442/674 |

| Noncore reference | Raw other retained | Fixed8 other retained | Selector other retained |
| --- | ---: | ---: | ---: |
| DR | 24/486 | 0/486 | 15/486 |
| HT | 13/145 | 0/145 | 6/145 |
| Consensus | 12/103 | 0/103 | 5/103 |

The selector partly recovers the long-clip grouping loss but remains weaker than
raw predictions on Beatboxset and weaker than fixed8 on AVP. It does not justify
a port or production comparison. This outcome is reported without tuning it away.

Selector confusions, reference rows/predicted columns `hat,kick,snare,other`:

```text
AVP                      Beatbox DR
259   8  18 0            244  29  20  7
  6 227   1 0              6 177   6  0
  8   1 143 1             39  38 168  2
  0   0   0 0            195 174 102 15

Beatbox HT               Beatbox consensus
322  26  47 9            229   8  14 6
 28 246   7 8              4 168   5 0
 87 107 210 3             39  32 167 2
 57  44  38 6             43  28  27 5
```

Joint mappedF1 is89.79% AVP,45.93% DR,56.24% HT,53.55% consensus. Onset counts are
unchanged: AVP707detections/694references/672matches; Beatbox1287detections with
DR1343references/1222matches, HT1501/1245, consensus838/777. Consensus omissions
mean unmatched detections are not known false positives. This is pure acoustic
inference, not the production guarded TypeSafe hybrid.

Reproduction uses existing native-feature caches only:

```sh
OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 /tmp/beatbox-ml/bin/python ml/browser_pool_selector.py
```

`artifacts/browser-pool-selector/` contains separate fold models, `selector.pkl`,
`frozen-selection.json` with fold assignments, eligible training counts and model
checksums, and `report.json` with full predictions, selector probabilities and
comparisons. The full browser-domain classifier was reused without refitting.
No test/private/reserved audio, production model changes, app edits or deployment.
