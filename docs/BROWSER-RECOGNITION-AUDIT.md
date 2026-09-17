# Live browser recognition audit

September17,2026. Production release6467bf7, actual public endpoint and browser inference; no API mocks. This audit checks execution fidelity and device sample-rate sensitivity. It does not establish95% labeled transcription.

The current host's default AudioContext rate is44,100Hz. The second condition overrides that constructor to48,000Hz before page load. Same four already-used AVP validation recordings: P15/P16 Fixed and Personal. Exact classifier request features, responses, worker times and reference matching are stored in ignored `artifacts/browser-recognition*`.

| Condition | Detected / references / matched | Onset F1 | Correct four / matched | Correct core / matched | Joint four F1 | Joint core F1 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Native44.1kHz |215/210/200|94.12%|160/200=80.00%|169/200=84.50%|75.29%|79.53%|
| Forced48kHz |215/210/200|94.12%|164/200=82.00%|173/200=86.50%|77.18%|81.41%|

Default groove hints changed zero labels relative to raw classifications in either condition. Nine labels changed between rates. The four extra correct labels at48kHz all occurred in P16 Personal. The calls were separate; upstream model variability is not isolated, so label changes cannot all be attributed causally to sample rate. Acoustic descriptor differences themselves are measured directly. A proposed44.1kHz pin was reverted, not deployed: this experiment does not support an accuracy improvement from that change. Selecting48kHz solely for these results would also require new independent validation.

The offline feature-only audit fixes all neural boundaries and computes identical sound windows after ffmpeg decoding at different rates. Of215 windows,93 cross the existing tonal/mixed/noise description thresholds at48kHz versus44.1kHz. This isolates a descriptor dependency on sample rate, but supplies no instrument correctness labels. The live browser pipeline also resamples for onset inference; its boundaries can differ by one approximately4.989ms model hop across rates.

## Actual browser onset benchmark

A separate onset-only live run covered14 available, previously inspected P21–28 Fixed/Personal recordings from the existing manifest. It made no classifier calls and did not consume the reserved MDV or VIS sets.

-1,179 detections against1,163 annotated events.
-1,141 one-to-one matches within50ms.
-**97.4381% onset F1**, mean matched timing error**2.6907ms**.
-No browser page errors.

This verifies the deployed browser's timing behavior on that cohort. It is not a new blind test, a seven-class result, a label score, or a real spoken boots-and-cats evaluation. The full95% labeled-transcription goal remains unmet.

## Reproduce

```sh
node scripts/browser-recognition-audit.mjs
AUDIO_RATE=48000 node scripts/browser-recognition-audit.mjs
node scripts/browser-recognition-audit.mjs --onsets-only
npx tsx scripts/sample-rate-audit.ts
```

Requires the locally downloaded public AVP corpus and existing ignored reference manifests. Classification runs use the production API and respect its rate limiter. No private voice recordings or API keys are embedded in the scripts.
