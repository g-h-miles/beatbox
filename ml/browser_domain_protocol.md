# Frozen browser-feature domain broadening

Train one StandardScaler + RBF SVC, C10, gamma=scale, four targets hat/kick/snare/
other. No hyperparameter search. AVP1–14 browser-native annotated groove features
are reused. Add alphabetically first8 existing Beatboxset1 training recordings,
each capped to first90seconds. Extract their actual frozen browser neural onsets
(threshold.4), browser16k resampling and1104 recording-relative features; every
detected event stays in normalization/grouping context. Only detected hits that
match annotator consensus within50ms carry training labels. No annotation crops
are used for Beatboxset1.

Map hc/ho→hat,k→kick,s/sb/sk→snare,br/m/v/x→other. Exclude unmapped labels explicitly.
Consensus: first map recognized DR/HT labels, pair within50ms by increasing time
error one-to-one, then keep pairs agreeing on mapped category. Use DR timestamp.
Match detections to consensus with the same distance-sorted one-to-one rule.

Weight training examples so each domain×presentclass group has equal total weight,
then normalize weights to mean1. Fit scaler with those weights as well as SVC.
This prespecifies that the extra domain cannot dominate via its event count.
At inference use raw SVC and exactly8Ward groups on scaled features with full
within-group mean OVO margins; all events participate and no class presence assumed.

Evaluate frozen candidate and frozen AVP browser-C10 core model on native AVP15–20
and the three existing90second Beatboxset validation clips in typesafe-noncore.
Report datasets separately, DR/HT/consensus separately, with mapped core correct,
other retained, missing/extras and confusion. Consensus is a partial subset so
unmatched detections are not established false positives. Do not use test/private/
reserved data, change model after validation, port, or deploy.

## Results: not suitable for deployment

Training had1161 AVP events (419hat,436kick,306snare) and1159 matched Beatboxset
consensus events (407hat,308kick,331snare,113other). Beatbox training contained1674
actual detections; unlabeled detections remained in recording normalization.
Model weights were frozen before any validation scoring, with no parameter changes.

| Validation | Prediction | Baseline core | Candidate core | Candidate other retained |
| --- | --- | ---: | ---: | ---: |
| AVP | raw | 595/672 | 611/672 | no other references |
| AVP | pooled | 639/672 | 636/672 | no other references |
| Beatbox DR | raw | 523/736 | 607/736 | 24/486 |
| Beatbox DR | pooled | 465/736 | 490/736 | 0/486 |
| Beatbox HT | raw | 675/1100 | 800/1100 | 13/145 |
| Beatbox HT | pooled | 632/1100 | 654/1100 | 0/145 |
| Beatbox consensus | raw | 489/674 | 579/674 | 12/103 |
| Beatbox consensus | pooled | 442/674 | 475/674 | 0/103 |

The baseline has no other output class and retains0 other events in every row.
Raw candidate consensus core accuracy is85.91% versus72.55% baseline, but other
recall is only11.65%. Fixed grouping reduces the candidate to70.47% core and0%
other recall. AVP pooled joint labeled-event F1 declines91.22%→90.79%. Thus the
fixed candidate does not meet the release goal despite better independent labels.
No alternative group count, pooling blend, weighting or threshold was tried.

Onset counts are unchanged between every model because they use identical cached
native detections:

| Reference set | Detected | Reference | Matched | Missing | Unmatched detections |
| --- | ---: | ---: | ---: | ---: | ---: |
| AVP | 707 | 694 | 672 | 22 | 35 |
| Beatbox DR | 1287 | 1343 | 1222 | 121 | 65 |
| Beatbox HT | 1287 | 1501 | 1245 | 256 | 42 |
| Beatbox consensus | 1287 | 838 | 777 | 61 | 510 |

Consensus excludes disagreements, so its510 unmatched detections must not be
called510 known false positives. All metrics compare the same reference policy
within a row, not across annotators.

Candidate consensus confusion, rows reference and columns predicted,
`hat,kick,snare,other`:

```text
Raw                    Eight-group pooled
240   4   4   9        210  34  13  0
  3 173   0   1         39 127  11  0
 40  24 166  10         65  37 138  0
 40  26  25  12         60  28  15  0
```

Additional limitations from the source audit: `t` denotes tom but is excluded
because this experiment's mapping was fixed beforehand. The existing split uses
seven callout recordings plus one other-source recording in training, versus
three other-source recordings in validation, so acquisition/style differences
are confounded with the split. An authoritative monophony guarantee was not found.
This experiment makes no claim of explicit ride/crash recognition or unrestricted
polyphonic transcription. These are repeatedly used development recordings.

## Reproduction

Requires existing browser-relative training features, four-relative native AVP
validation caches, typesafe-noncore native Beatbox validation caches, public audio,
ML environment and Vite at127.0.0.1:5178. No new dependencies are installed.

```sh
OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 /tmp/beatbox-ml/bin/python ml/browser_domain_prepare.py
node scripts/browser-domain-extract.mjs
OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 /tmp/beatbox-ml/bin/python ml/browser_domain_train.py
```

Outputs under `artifacts/browser-domain/`: allowlisted training manifests/native
samples/features, separate `browser-domain.pkl`, `frozen-training.json` with
training counts and model checksum, and `report.json` with all predictions and
confusions. No production models, private/reserved/test data or app code changed.
