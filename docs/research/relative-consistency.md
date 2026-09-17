# Acoustic consistency within a recording

Repeated articulations should usually receive the same sound label. This experiment groups all detected hits using their acoustic features, then averages the frozen SVM's pairwise decision margins inside each group. It does not use a beat grid, infer missing hits, require any class to be present, or move MIDI notes.

Eight candidates were specified before scoring: Ward clustering with3,4,6,8 groups and margin-pooling weights0.5 or1. Training-scaled relative features determine groups, including every unmatched detection. The selected development candidate is8 groups with full pooling. Recordings with fewer than8 hits remain unpooled. The existing training-only diversity gate still determines whether the app uses the relative classifier at all. TypeSafe ride/crash/aux retention and hat-subtype selection are unchanged.

## Frozen results

P15–20 is a development cohort repeatedly inspected during this project. After selecting the rule, it was frozen and evaluated once on the previously inspected P21–28 cohort. Those performers were excluded from fitting, but this is not a new independent corpus. No reserved MDV/VIS or private audio was accessed.

| Cohort / pipeline | Before correct core | After correct core | Before core labeled-event F1 | After core labeled-event F1 |
|---|---:|---:|---:|---:|
| P15–20 raw acoustic |592/672|635/672|84.57%|90.71%|
| P15–20 guarded combination |582/672|625/672|83.14%|89.29%|
| P21–28 raw acoustic |898/1139|947/1139|76.82%|81.01%|
| P21–28 guarded combination |848/1139|894/1139|72.54%|76.48%|

Both Fixed and Personal styles improved on both cohorts. On the broader cohort, guarded-combination snare recognition improves109→117/278, still below TypeSafe alone126/278. Four-label F1 rises58.68%→61.76%, which remains weak. No seven-class or spoken boots-and-cats accuracy is established. **This does not meet the95% full-transcription target.**

## Browser implementation

The Ward implementation uses squared Euclidean distances and the standard Lance–Williams Ward update, with Float64 distance storage. Its input matches the existing Float32 sklearn scaler transform. Group means are computed from uncalibrated LIBSVM pairwise margins; the existing vote/tie rule selects the core class. No confidence percentage is invented.

On cached features from26 recordings, the TypeScript implementation reproduces every Python partition and all1,881 pooled labels exactly. This is numerical parity, not a separate recognition evaluation. The largest fixture is168 hits; that run took roughly18ms in Node on this Mac, excluding feature extraction and model inference. The worker retains cancellation and the app's fallback behavior.

## Native browser audio check

Using actual browser resampling, neural onset timestamps and JavaScript acoustic features from all12 validation recordings, the frozen grouping rule improves590→628/672 correct core labels. Core labeled-event F1 improves84.23%→89.65%, with707 detections and694 references. Grouped matched-class recall is280/285 hats,224/234 kicks and124/153 snares. The classifier/grouping comparison is performed against the frozen numerical model on those browser-extracted features. The browser UI separately exercises the bundled worker and MIDI export.

The native result is lower than the Python-only comparison, so they are reported separately. It still does not reach95% complete transcription. No native test labels were used to change the rule.

## Reproduction

Research scripts are on the [research/audio-classification branch](https://github.com/g-h-miles/beatbox/tree/research/audio-classification):

```sh
python ml/relative_consistency_validation.py
python ml/relative_consistency_frozen.py
npx tsx scripts/relative-consistency-parity.ts
```

The first script compares the fixed validation candidates. The second evaluates only the frozen choice with cached TypeSafe answers and saves exact parity fixtures. It makes no API requests. Reports/fixtures stay in ignored `artifacts/relative-consistency/`. Source audio remains subject to the existing AVP attribution.
