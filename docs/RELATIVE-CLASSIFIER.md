# Guarded core classifier

The frozen public-data relative SVM is substantially better than the existing TypeSafe feature descriptions on the full AVP validation cohort, but cannot be used on every recording. The browser implementation is in `src/research-relative`; audio stays on the device.

The current worker additionally pools decisions among acoustically similar hits. See [the consistency evaluation](research/relative-consistency.md) for the newer comparison; tables below document the original unpooled baseline.

## Frozen comparison

Same predicted boundaries, same crops, no user calibration, AVP performers15–20 excluded from model fitting:

| Pipeline | Correct core / matched | Core labeled-event F1 | Correct four-class / matched |
| --- | ---: | ---: | ---: |
| TypeSafe |453/672=67.41%|64.71%|415/672=61.76%|
| Relative SVM |592/672=88.10%|84.57%|Not applicable|
| Predeclared hybrid |582/672=86.61%|83.14%|538/672=80.06%|

The hybrid retains TypeSafe ride/crash/aux outputs. For other events the SVM selects kick/snare/hat; a hat uses the larger TypeSafe open/closed posterior. No thresholds were selected from this comparison. Noncore retention costs10 correct core labels here, but a three-class model cannot establish that an unfamiliar cymbal or breath is a core drum. These experiments do not validate those additional classes.

The fully native browser SVM alone achieves590/672 correct core labels (87.80%),84.23% labeled-event F1, with707 detected events against694 references. Browser resampling differs from Python; numerical model parity and native performance are documented separately in the model README. None of these results achieves the requested95% complete-transcription goal.

## Frozen existing-test comparison

The same frozen models, gate and combination rule were then evaluated on the previously inspected AVP performers 21–28: 14 retained grooves, 1,163 reference events, 1,175 neural detections and 1,139 matched events. These performers were excluded from acoustic-model training. This is not a fresh unseen corpus; no parameters were tuned on these results and no reserved MDV/VIS voices were evaluated.

| Pipeline | Correct core / matched | Core labeled-event F1 | Correct four-class / matched | Four-class labeled-event F1 |
| --- | ---: | ---: | ---: | ---: |
| TypeSafe |739/1,139 = 64.88%|63.22%|605/1,139 = 53.12%|51.75%|
| Relative SVM |898/1,139 = 78.84%|76.82%|Not applicable|Not applicable|
| Guarded hybrid |848/1,139 = 74.45%|72.54%|686/1,139 = 60.23%|58.68%|

The guarded hybrid improved aggregate results but introduced material class regressions. Against TypeSafe, kick recall improved from 280 to 357 of 409 matched kicks and merged-hat recall from 333 to 382 of 452 hats. **Snare recall declined from 126 to 109 of 278 snares.** Only 55 of 231 open hats received the correct open-hat label. The shared onset F1 of 97.43% does not measure correctly labeled MIDI notes.

The gate enabled 13 of 14 recordings. P24 Personal received no relative labels; retaining TypeSafe there avoided 10 errors. Overall, the guarded hybrid corrected 181 core labels that TypeSafe missed but spoiled 72 TypeSafe-correct labels. Retaining TypeSafe ride/crash/aux predictions does not validate those classes: this cohort contains the four core drum labels. Spoken “boots and cats” was not evaluated in this comparison. These results remain well below the requested 95% complete-transcription goal.

A follow-up rule preserving every TypeSafe snare prediction was examined only on existing validation performers 15–20. It corrected 15 snares but spoiled 73 core labels, reducing core labeled-event F1 from 83.14% to 74.86%. The rule was rejected and the original guarded combination was retained. It was not tuned or evaluated again on performers 21–28. Detailed methodology and class counts are in [the experiment report](research/typesafe-hybrid-existing-test.md).

## Why a recording-level check is required

The relative model subtracts each recording's median feature values. Repeating one identical sound makes every normalized feature zero, regardless of that sound's instrument. A six-file isolated-sound diagnosis confirmed the failure:84/200 correct, despite reference boundaries. This model must therefore never become the unconditional default.

A separate recording-variety check uses the75th percentile of pairwise RMS distances between20-band normalized log spectra. It uses at least6 hits and at most96 uniformly sampled hits. It does not require or infer that all three instruments are present, and receives no instrument labels at runtime.

The threshold1.2873168143334053 was fitted exclusively on135 public training recordings from performers1–14, maximizing balanced single/varied recording accuracy, with higher thresholds breaking ties. It selected26/27 varied recordings and rejected103/108 single-sound recordings. Leave-one-training-speaker-out fitting selected25/27 varied and rejected100/108 single recordings (92.59% balanced accuracy).

After freezing that threshold, validation performers15–20 selected all12 varied recordings and rejected all48 single-sound recordings. Their predicted boundaries were independently regenerated and asserted identical to the cached groove comparison. Thus the gate keeps the measured hybrid groove result and preserves the existing classifier for all48 checked homogeneous recordings. This is a recording-selection result, not95% instrument recognition or proof for every future voice. No reserved MDV/VIS test recordings were read.

## Product invariants

- Classification does not alter event times, durations or velocities.
- Manual edits remain owned by the user.
- Core-model labels carry no invented confidence percentage; SVM scores are not calibrated probabilities.
- Spoken-syllable mode retains the existing path pending its own validation.
- Model failure leaves TypeSafe available; API failure preserves the hit list.
- No personal voice audio or private checkpoint is included in the model.

Training and research scripts are maintained on the [research/audio-classification branch](https://github.com/g-h-miles/beatbox/tree/research/audio-classification).

## Reproduction

```sh
python ml/diversity_prepare.py
npx tsx scripts/diversity-training.ts
python ml/diversity_prepare.py --validation
npx tsx scripts/diversity-validation.ts
npx tsx scripts/typesafe-validation-cohort.ts
npx tsx scripts/typesafe-existing-test.ts
npx tsx scripts/typesafe-validation-snare.ts
```

Raw audio, intermediate records and detailed reports remain in ignored `artifacts/`. Public AVP model attribution is retained with the binary. The feature gate is trained once during development; app users do not need to train it.
