# Preregistered hat duration/decay experiment

Features are frozen before validation scoring: 42 real-valued descriptors from
original native-rate mono samples, cropped at onset to min(next onset, onset+.5s,
recording end), with no annotation-derived endpoints during inference.

10 basic descriptors: activeDuration, capped crop duration, attack time,
log10(RMS+1e-8), centroid/16000, low/mid/high power fractions, flatness and ZCR.
20 descriptors: the existing audio.ts normalized log-power spectrum bands.
5 descriptors: seconds to cumulative energy10/25/50/75/90percent.
3 descriptors: fractions of total energy in0–50ms,50–150ms,150–500ms.
3 descriptors: last 5ms RMS-envelope frame above10/25/50percent of maximum,
expressed as seconds from onset.
1 descriptor: crest factor log10(peak/(RMS+1e-8)+1).

Training uses only annotated closed/open hat events from public AVP1–14 grooves: 419 events (219 closed, 200 open).
The original waveform fixtures contain all events to supply next-onset bounds.
Fit training-only StandardScaler plus binary RBF SVC C=.1,1,10 gamma=scale.
Binary sign positive=open. No probability calibration or class reweighting.
Average binary margins within the fixed frozen browser-C10 core model's eight
Ward groups, using all detected events in grouping/margin pooling. Only substitute
subtype where that frozen core model predicts hat. No truth-dependent inference.
Choose C by complete four-class jointF1 on the existing native15–20 validation
cohort. Smaller C wins ties. Baseline frozencombiner605four/639core of672.
No21–28, private, or reserved audio access. No app changes or deployment.

## Outcome: reject

The selected C1 shape model gets596/672 four-class labels correct (88.69%), with
85.08% joint labeled-event F1. The frozen acoustic combiner gets605/672 (90.03%)
and86.37% jointF1 on exactly the same events. C.1 gives580 correct and C10 gives582.
Core correct remains639 for every trial by construction and assertion.

The shape model improves open-hat recall to96/103 from92/103, but reduces closed-hat
recall to142/182 from155/182. That net loss of9 labels rejects this candidate.
The preregistered native48k follow-up was conditional on a gain, so it was not run.
No test/private/reserved audio was accessed and no model was ported or deployed.

Selected confusion, reference rows/prediction columns closed/open/kick/snare:

```text
142 38   2   0
  5 96   0   2
  9  0 222   3
  4 13   0 136
```

The implementation uses existing `src/audio.ts` and `src/audio-duration.ts` pure
JavaScript functions via tsx on the original native float samples. These paths
are identical to the browser functions and do not introduce Python resampling.
The frozen core groups use the already cached browser-resampled relativefeatures.
All707 validation events get descriptors/margins; only predicted hats have their
subtype changed. Ground truth is used solely for training hats and scoring.

Reproduce from existing browser-relative training and four-relative validation
caches, without loading any test directory:

```sh
npx tsx ml/hat_shape_extract.ts
OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 /tmp/beatbox-ml/bin/python ml/hat_shape_train.py
```

Outputs: `artifacts/hat-shape/manifest.json`, per-record shape features,
`report.json`, `train.log`, and separate rejected `hat-shape.pkl`. The original
production model and browser-relative candidate pickles are not modified.
