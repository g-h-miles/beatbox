# Frozen browser trained SVM candidates

This module supplies two frozen acoustic models for the public app. It exports models trained on public AVP performers 1 through 14 using the existing native browser feature extraction. No private recordings are present. AVP attribution is retained in each metadata file.

`model3.bin` uses class indices hat, kick, snare. `model4.bin` uses closed hat, open hat, kick, snare. Metadata records source pickle and binary SHA256 hashes, support counts, scaler, gamma, and byte sections. Support vectors are exactly representable as float32 and exported losslessly; scaler parameters, dual coefficients, and intercepts remain float64.

APIs are `readBrowserModel(buffer, 3 | 4)`, `standardizeBrowserFeatures(features, model)`, and `predictBrowserModel(features, model)`. Prediction returns numerical `classIndex`, OVO `pairScores`, and `votes`. Asynchronous `loadBrowserModel(3 | 4, signal)` fetches the bundled binary. A generic `loadModel(buffer, metadata)` is also available. Pair ordering is `(0,1), (0,2), ...`, with positive margins voting for the first class. Vote ties retain the earliest class, matching LIBSVM.

`recordingFeatures` and `normalizeRecording` reexport the existing implementation without changes. Standardization performs the same two float32 rounding steps as sklearn's scaler. Each model retains its own scaler; callers must not assume the two are interchangeable.

Run `python ml/export_browser_models.py` to regenerate binaries and independent Python references from the frozen pickle files. Run `npx tsx scripts/browser-model-parity.ts` for the full cached numerical check and `npx vitest run tests/browser-model.test.ts` for compact fixtures and invalid input handling.

On all 707 cached native validation events across 12 recordings, both models matched Python labels exactly. Maximum absolute OVO margin differences were 3.38e-8 for three classes and 2.90e-8 for four classes, below the stated 1e-6 comparison tolerance. These are numerical equivalence checks, not accuracy estimates. They include all events, not only the 672 annotation matches used in separate recognition scoring.

## Recording classifier

`predictBrowserSounds(samples, sampleRate, times, signal?)` resamples and runs the models in a cancellable worker. Pass every detected event, including unmatched events, in increasing time order. The frozen three-class model determines kick/snare/hat after eight-group Ward margin pooling. For a hat, the sign of the four-class model's first pairwise margin, averaged within its own eight groups, determines closed/open. No scores are presented as calibrated confidence.

The app retains its training-only recording-diversity gate, TypeSafe ride/crash/aux decisions, manual edits, and exact event times. Spoken-syllable mode keeps its prior path. If either binary fails to load, the app explicitly falls back to TypeSafe. An API failure preserves the hit list.

The full TypeScript combiner matches all1,886 native cached event labels across26 recordings exactly. A complete browser run reproduces639 correct core labels among672 matched validation hits:91.22% labeled-event F1 including707 detections and694 references. A separate browser-resampled48kHz check gets638/672 and91.14% F1. The100-hit worker probe took roughly303ms on this Mac; no mobile-speed promise is implied. Inputs, cancellation and malformed-time handling were verified.

These are development/equivalence checks, not proof of95% independent transcription. See [the exact app comparison](../../docs/research/native-hybrid-comparison.md) for broader results and regressions. Training and numerical reproduction scripts are maintained on the [research branch](https://github.com/g-h-miles/beatbox/tree/research/audio-classification).
