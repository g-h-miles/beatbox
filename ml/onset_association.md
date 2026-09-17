# Same-event label association: development diagnostic

The onset-only network improves detection but changes acoustic crop/group
statistics enough to harm labels. This diagnostic keeps its output times and
associates its events with the original detector's events before choosing labels.

One fixed rule: greedily pair detections by increasing absolute time difference,
one-to-one, within four frames (19.9546 ms, half the existing eight-frame peak
separation). Use the old frozen acoustic label for paired events and the new-crop
frozen acoustic label for unpaired candidate events. No reference annotation
enters association or label selection. No timestamp is moved or synthesized.

On the existing 12 AVP validation recordings, 695 candidate events inherit an old
label and 25 use the new-crop label. Results:

| Pipeline | Detections | Matched /694 | Correct core | Joint core F1 | Correct four | Joint four F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Original detector/combiner | 707 | 672 | 639 | 91.22% | 605 | 86.37% |
| New detector/combiner | 720 | 683 | 629 | 88.97% | 587 | 83.03% |
| New times, associated labels | 720 | 683 | 649 | 91.80% | 614 | 86.85% |

This small gain is development evidence only. It requires both detector and
classifier passes. The [previously inspected 21–28 cohort](onset_association_test.md)
only improves joint core F1 from 82.152% to 82.193%, with five more correct core
labels but also five more extra detections. The
[guarded TypeSafe feasibility check](../docs/research/onset-association-hybrid.md)
raises validation joint core F1 from 89.51% to 90.10%. These narrow gains do not
justify the additional pipeline complexity or establish independent performance.
It has not been integrated into the app or verified on literal spoken
boots-and-cats. It does not reach the requested target and is not deployed.

Run `ml/onset_association.py` after the exact native extraction and classifier
comparison. Full predicted-event associations and per-record scores are stored
in ignored `artifacts/onset-only/association-report.json`.
