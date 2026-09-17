# Frozen same-event association: previously inspected test cohort

Evaluate all14 available AVP21–28 improvisation recordings, explicitly previously
inspected and not an independent fresh test. Frozen candidate ONNX and production
browser C10core/C1hat models unchanged. Native candidate extraction via research
request interception only. The association rule is copied exactly from
`ml/onset_association.py`: nearest distance-sorted one-to-one pairing within
four model frames (inclusive), inherit old labels for paired detections, use
candidate-crop labels for unpaired events, retain candidate timestamps unchanged.
No annotation-dependent association, parameter selection, retuning or app edits.

Baseline assertion:1179detections/1163references/1141matches/962core/839four.
Compare baseline, candidate-crops alone, and fixed association on identical
native source audio. No private or reserved corpus reads or selective clips.

## Frozen result

All14 clips were processed without selection, with14 successful research ONNX
requests and no browser errors. Baseline counts and labels matched the asserted
1179/1163/1141/962/839 exactly.

| Metric | Old pipeline | Candidate crops alone | Fixed association |
| --- | ---: | ---: | ---: |
| Detections | 1179 | 1190 | 1190 |
| Reference events | 1163 | 1163 | 1163 |
| Matched | 1141 | 1147 | 1147 |
| Missed | 22 | 16 | 16 |
| Extras | 38 | 43 | 43 |
| OnsetF1 | 97.438% | 97.493% | 97.493% |
| Correct core | 962 | 967 | 967 |
| Correct four-class | 839 | 818 | 844 |
| Joint coreF1 | 82.152% | 82.193% | 82.193% |
| Joint fourF1 | 71.648% | 69.528% | 71.738% |

Association inherits1170 old labels and uses candidate-crop labels for20 unpaired
candidate detections. Nine old detections have no paired candidate. All candidate
times are unchanged. Compared with the old pipeline, six more references match
but five more unmatched detections appear. The gain in full labeled-event scores
is small, not evidence that the95% transcription objective is reached.

Association four-class confusion, rows truth/columns predicted,
closed/open/kick/snare:

```text
166 42  13   1
 81 140  2  10
 14  3 393   4
 67 53  13 145
```

The rule recovers26 four-class labels compared with candidate-crop classification
alone. This uses two detector/classifier passes and has not been evaluated here
with the TypeSafe retention policy, diversity gate or production browser UI.
These previously inspected recordings are not independent evidence. No decisions
or model parameters changed after these results.

Reproduce with Vite5178, original native test fixtures and frozen candidate ONNX:

```sh
node scripts/onset-association-test-extract.mjs
OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 /tmp/beatbox-ml/bin/python ml/onset_association_test.py
```

Artifacts under `artifacts/onset-association-test/`: exact native onset manifest,
features, `score.log`, and `report.json` containing all per-record predictions,
class confusions, Fixed/Personal breakdowns, model checksums and event mappings.
No production assets were modified.
