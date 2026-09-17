# Core versus other sound gate: rejected

A fixed binary RBF SVM did not provide a useful safe way to replace TypeSafe's
noncore choices. This is a crop-classification experiment, not transcription
accuracy, and no application behavior changed.

Training used existing public training splits from AVP, Beatboxset, and MDV.
The model used StandardScaler, C=3, gamma=scale, and weights equalizing each
domain/class combination. Four voice-grouped training folds selected a margin
threshold of 1.814882 to keep false core predictions below 5% in each training
domain with noncore examples. Validation did not select that threshold.

| Validation domain | Core recall, default | Other recall, default | Core recall, conservative | Other recall, conservative |
| --- | ---: | ---: | ---: | ---: |
| AVP | 676/681 | — | 251/681 | — |
| Beatboxset | 624/659 | 24/113 | 81/659 | 113/113 |
| MDV | 38/54 | 21/36 | 4/54 | 36/36 |

The default decision loses most Beatboxset noncore sounds. The conservative
threshold preserves validation noncore sounds but recognizes too few core
sounds to justify integration. Neither result validates the separate TypeSafe
group-pooling proposal.

“Other” covers MDV cymbal/tom and Beatboxset breath/miscellaneous/vocal labels;
it is not a complete seven-class taxonomy. The offline descriptors have no
browser parity check. Reserved MDV 11–13, VIS, AVP 21–28, and private recordings
were not evaluated.

Reproduce with `ml/core_other_gate.py` using the existing public cache under
`artifacts/core-model/mdv/`. The ignored report and rejected checkpoint are
under `artifacts/core-other-gate/`.
