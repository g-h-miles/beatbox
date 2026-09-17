# Core acoustic errors concentrate in repeated timbres

The current production acoustic classifier repeatedly assigns the wrong class to entire sound groups from particular performers. The main existing-test failure is Personal-style snares becoming hats. It is not primarily a collection of uncertain isolated hits, and its pairwise margins are not reliable confidence probabilities.

This is a read-only audit of already generated native P15–20 validation and previously inspected P21–28 test predictions. No model fitting, new inference, reserved data access, or new API requests were performed. The existing-test observations are diagnostic only and must not become another parameter-selection set.

## Exact model and scope

`src/research-browser-model/combine.ts` forms eight Ward groups from standardized recording-relative features and averages the three-class model's pairwise margins within each group. `src/research-browser-model/index.ts` implements the RBF support-vector prediction and one-versus-one voting; `src/research-relative/consistency.ts` provides grouping and pooled voting. The core model is the browser-trained C=10 SVM with class order hat/kick/snare. Hat subtype uses a separate four-class C=1 model/grouping and is outside this core-only audit.

The audit reads the frozen `core` outputs in `artifacts/typesafe-group-validation/predictions.json` and `candidateCore` outputs in `artifacts/browser-relative/existing-test/predictions.json`. Reference matches are taken unchanged from the corresponding existing reports. Counts assert exactly 639/672 correct validation core labels and 962/1,141 existing-test core labels. These are acoustic outputs before the recording diversity gate and TypeSafe noncore retention; they are not full deployed hybrid scores.

## Concentration

| Measure | Validation P15–20 | Existing test P21–28 |
| --- | ---: | ---: |
| Matched events | 672 | 1,141 |
| Core errors | 33 | 179 |
| Groups with any matched reference | 87 | 102 |
| Groups containing errors | 16 | 29 |
| Entirely wrong matched groups | 10 | 9 |
| Errors in those entirely wrong groups | 24 (72.7%) | 86 (48.0%) |
| Errors in five largest error groups | 19 (57.6%) | 85 (47.5%) |
| Groups covering at least 80% of errors | 10 | 14 |

All detected events, including unmatched extras, participated in the original grouping. This table counts only groups with reference-matched members; group purity and correctness are post-hoc annotation descriptions, never inputs to inference. An entirely wrong group can contain more than one true class.

Validation's three largest error recordings are P17 Personal (9), P15 Personal (7), and P19 Personal (7): 23/33 errors. Repeated failures include all six snares in P19 Personal group 4 becoming hats, all five kicks in P17 Personal group 3 becoming hats, and all four snares in P15 Personal group 2 becoming hats.

On the existing test, **P25, P23, and P27 Personal account for 132/179 errors (73.7%)**. Every matched snare in those three recordings fails: 59/59, 35/35, and 23/23 respectively. Across the whole cohort, 120/179 errors are snare→hat and 13 are snare→kick.

| Existing-test group | Matched members | Errors | True class counts | Predicted class |
| --- | ---: | ---: | --- | --- |
| P25 Personal, group 0 | 32 | 25 | 7 hats, 3 kicks, 22 snares | Hat |
| P25 Personal, group 3 | 22 | 22 | 2 kicks, 20 snares | Hat |
| P23 Personal, group 6 | 16 | 16 | 16 snares | Hat |
| P26 Fixed, group 3 | 12 | 12 | 12 hats | Kick |
| P27 Personal, group 5 | 10 | 10 | 2 kicks, 8 snares | Hat |

The first row also demonstrates a limit of forcing one pooled label per group: a group can combine several intended instruments. Group agreement is evidence of acoustic similarity, not proof of a shared target label.

## Are the wrong decisions weak?

Every incorrect event wins both pairwise votes involving its chosen class: 33/33 validation errors and 179/179 existing-test errors. A two-vote win therefore cannot serve as a safety confidence flag. Correct events also usually win both votes (637/639 validation, 962/962 existing test).

For each chosen class, define the two signed margins against its rivals, positive when they favor that class. These are decision-function values, **not calibrated probabilities**. Because groups share pooled margins, the following medians are event-weighted, not independent samples.

| Median pooled margin statistic | Validation correct | Validation wrong | Existing test correct | Existing test wrong |
| --- | ---: | ---: | ---: | ---: |
| Weaker of the two winning margins | 0.890 | 0.391 | 0.717 | 0.599 |
| Mean of the two winning margins | 1.115 | 0.483 | 0.988 | 1.020 |

The existing-test wrong mean-margin median is slightly greater than the correct median. A concrete example is P23 Personal group 6: all 16 snares become hats with weaker margin 0.904 and mean margin 1.454. Other mistakes are borderline, such as P26 Fixed group 3 (12 hats→kick) with weaker margin 0.000713. The error population contains both weak and strongly separated decisions; simply overriding low margins would miss important failures. No threshold was selected from this audit.

## One bounded training-only remedy worth testing

Test a **cross-speaker linear metric on the existing frozen 1,104-dimensional features**, before the current RBF SVM and Ward grouping. The inspected research files contain a rejected deep supervised-contrastive CNN, but no completed cross-speaker linear large-margin metric experiment on these production features. This proposal changes the feature distance geometry rather than adding another group-score correction or confidence gate.

A concrete first condition: learn a fixed rank-32 linear transform from AVP1–14 only. Construct positive pairs with the same core class but different participants and negative pairs with different classes; emphasize the nearest competing class using training features alone. Give each participant/class equal total pair weight, use one fixed regularized triplet-margin objective, and retain the existing C=10 core SVM and eight-group pooling afterward. Freeze the transform and classifier before one P15–20 comparison. Do not select rank, margin, negatives, or weights from P21–28 errors. Preserve original timestamps, evaluate both raw and pooled labels, and reject unless validation improves without material class regressions.

The mechanism is plausible because Euclidean proximity currently groups some snares with hats, while entire unfamiliar snare timbres remain confidently on the wrong side of the classifier. It is not a predicted improvement: training may lack the relevant vocal technique altogether, linear features may be insufficient, and the prior contrastive CNN's failure argues for keeping this trial small. A learned transform can also harm mixed-class grouping. No such transform was fitted in this audit.

## Reproduction

`ml/core_error_concentration.py` reads only the existing cohort predictions/matches and writes `artifacts/core-error-concentration/report.json`. The ignored artifact includes every matched event, exact pooled margins/votes, group reference composition, ranked group/recording errors, and full margin quantiles. Confidence language should remain qualified: the audit shows wrong decisions with strong decision margins, not calibrated high probabilities.
