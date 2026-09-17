# Native onset timing audit

The frozen browser detector finds 707 events against 694 references in the
existing AVP 15–20 validation grooves. At the existing 50 ms matching tolerance,
672 match: 22 misses and 35 extra detections. This is reused validation, not a
new independent benchmark.

| Matching tolerance | Matched | Onset F1 |
| --- | ---: | ---: |
| 5 ms | 601 | 85.80% |
| 10 ms | 656 | 93.65% |
| 20 ms | 670 | 95.65% |
| 50 ms | 672 | 95.93% |

Among the 672 matched events, median signed error is +0.27 ms, median absolute
error is 1.90 ms, and the 95th percentile absolute error is 7.40 ms. These
numbers do not support applying a global timing offset. They do not measure
annotation uncertainty, which has not been independently audited.

Misses comprise six closed hats, one open hat, thirteen kicks, and two snares.
Eighteen extra detections are within 100 ms of another detection. This motivates
a separate training-only peak-distance experiment; proximity alone does not
prove a duplicate, since fast legitimate hits also occur.

Even perfect labels on these frozen detections would yield only 95.93% joint F1
at 50 ms. The current raw acoustic core classifier's 639 correctly labeled
matches yield 91.22%. Thus improving classifier accuracy alone leaves little
room to meet the full transcription target. Neither score includes spoken
boots-and-cats or establishes generalization to new speakers.

Run `ml/native_timing_audit.py` against the existing frozen native manifest.
Ignored `artifacts/native-timing-audit/report.json` includes every unmatched
event and missed reference. The script uses the same greedy one-to-one matching
as previous reports. It does not change audio, predictions, or MIDI timestamps.
An independent maximum-cardinality ordered matching check returns the same
match counts at all four tolerances for these core reference events.
