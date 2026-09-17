# Frozen classifier check for the onset-only candidate

The candidate improves onset recall but regresses complete labeled-event scores. Keep the existing onset model pending a separately validated fix. No classifier was refit or production file changed.

## Exact native comparison

Both conditions use the frozen browser-trained C10 core model and C1 four-class hat-subtype margin, each with fixed eight-group pooling. Checksums match the saved combiner. Baseline707 detections/694 references/672 matches/639 correct core/605 correct four-class is asserted before candidate scoring.

| Metric | Existing onset model | Candidate onset model |
| --- | ---: | ---: |
| Detections | 707 | 720 |
| Reference events | 694 | 694 |
| Matched within50ms | 672 | 683 |
| Misses | 22 | 11 |
| Extras | 35 | 37 |
| OnsetF1 | 95.93% | 96.61% |
| Correct core labels | 639 | 629 |
| Correct four-class labels | 605 | 587 |
| Joint core F1 | 91.22% | 88.97% |
| Joint four-class F1 | 86.37% | 83.03% |

Candidate four-class confusion, reference rows/prediction columns closed/open/kick/snare:

```text
159 24   2   0
 18 73   0  11
  9  0 231   2
 24  6   0 124
```

Correct kicks increase222→231, but open hats decline92→73 and snares136→124. Different crops and recording-relative grouping affect existing hits as well as newly found hits; onset improvement alone cannot establish transcription improvement.

## Per-record results

| Recording | Matches old/new | Extras old/new | Misses old/new | Core correct old/new | Four-class correct old/new |
| --- | ---: | ---: | ---: | ---: | ---: |
| P15_Improvisation_Fixed.wav | 59 /62 | 2 /5 | 3 /0 | 57 /60 | 57 /60 |
| P16_Improvisation_Fixed.wav | 44 /44 | 8 /8 | 1 /1 | 43 /43 | 36 /35 |
| P17_Improvisation_Fixed.wav | 28 /29 | 1 /1 | 3 /2 | 28 /29 | 23 /24 |
| P18_Improvisation_Fixed.wav | 125 /125 | 11 /7 | 0 /0 | 125 /125 | 125 /118 |
| P19_Improvisation_Fixed.wav | 47 /46 | 0 /1 | 1 /2 | 47 /46 | 47 /46 |
| P20_Improvisation_Fixed.wav | 38 /38 | 1 /0 | 0 /0 | 38 /38 | 36 /36 |
| P15_Improvisation_Personal.wav | 24 /25 | 3 /3 | 2 /1 | 17 /18 | 17 /18 |
| P16_Improvisation_Personal.wav | 73 /74 | 2 /2 | 4 /3 | 70 /71 | 68 /69 |
| P17_Improvisation_Personal.wav | 30 /30 | 0 /0 | 0 /0 | 21 /16 | 20 /16 |
| P18_Improvisation_Personal.wav | 128 /128 | 7 /8 | 0 /0 | 127 /123 | 127 /123 |
| P19_Improvisation_Personal.wav | 45 /47 | 0 /0 | 3 /1 | 38 /30 | 24 /23 |
| P20_Improvisation_Personal.wav | 31 /35 | 0 /2 | 5 /1 | 28 /30 | 25 /19 |

## Limits and reproduction

This is previously exposed AVP15–20 development validation with actual native browser audio resampling, detector timestamps and classifier feature extraction. It is the pure acoustic combiner, not the guarded TypeSafe/noncore production hybrid. No test, private or reserved recordings were read. This script does not modify the independent onset training protocol.

```sh
OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 /tmp/beatbox-ml/bin/python ml/onset_only_classify.py
```

Input: root-generated `artifacts/onset-only/native-manifest.json` and per-record `*-features.f32`. Output: `classification-report.json`, with both confusions, all per-record predictions and Fixed/Personal breakdowns. Candidate ONNX hash supplied by extraction owner: `2a9d291926c0e375d6ce4b6d1a6cff23311e63ce33f2b812fa2737c78ec9e1d5`.
