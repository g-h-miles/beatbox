# Group-level rhythm correction: rejected validation experiment

This bounded experiment tested whether temporal information improves the frozen relative SVM plus eight Ward groups. It is separate from the earlier individual-event transformer experiments.

Training used 27 AVP improvisations from performers 1–14, with 1,143 matched neural detections. Validation used only performers 15–20: 672 matched events, 706 detections and 694 references. No performers 21–28, reserved corpora, or private recordings were read. No app changes were made.

Each recording's groups were inferred from all detected hits using the existing acoustic feature pipeline. Group targets retained mixed labels: each matched event contributed its actual class, with weights giving each group equal total weight. Neither class presence nor a one-to-one assignment of groups to drum classes was imposed.

The acoustic-only logistic head received mean, standard deviation, minimum and maximum of each group's three raw SVM pairwise margins. The rhythm head additionally received group frequency, preceding/following relative onset-interval quantiles, recurrence intervals, adjacent-hit recurrence, and phase moments at two, four and eight times the recording's observed median onset interval. The first onset was only a coordinate origin; there was no reference tempo or downbeat input.

Both heads used the predefined regularization grid C = 0.1, 1, 10. Each head was selected on validation only.

| Method | Selected C | Correct /672 | Core accuracy | Labeled-event F1 |
| --- | ---: | ---: | ---: | ---: |
| Existing frozen pooled SVM |—|635|94.49%|90.71%|
| Acoustic-only group head |1|631|93.90%|90.14%|
| Acoustic + rhythm group head |0.1|617|91.82%|88.14%|

At the best rhythm setting, kick recall improved from 226 to 234 of 235 and snare recall from 132 to 133 of 152, but hat recall fell from 277 to 250 of 285. Fixed-style correct labels fell 339→338, while Personal-style labels fell 296→279. The rhythm head lost 18 correct labels overall; it also performed worse than the acoustic-only fitted head.

**Reject both fitted heads and retain the existing pooled SVM.** These features did not add actionable aggregate evidence. This does not establish that all rhythmic modeling is ineffective; it rejects this specific small, predefined experiment. No test-cohort follow-up was run.

The neural and SVM models had already seen the training performers, so their training margins are not independent predictions. This limitation can make the small heads overconfident and restricts interpretation of the result.

Reproduction: `python ml/group_rhythm_validation.py`. Full trials and class/style counts are in ignored `artifacts/group-rhythm/report.json`; experimental fitted heads remain in the same ignored directory. The script asserts the unchanged 635/672 validation baseline before fitting the heads.
