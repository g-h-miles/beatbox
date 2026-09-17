# One-bar arrangement — September 17, 2026

The previous attempt optimized independently selected hits. That established timing and typed-interface correctness without establishing musical quality. This revision deliberately narrows the product to a one-bar arranger over authored rhythmic phrases. It does not demonstrate unrestricted drum composition by Jev.

## Musical decisions

A first Choice selects a complete kick/snare relationship. A second call sees that actual phrase and selects the entire cymbal phrase plus performance feel. The resulting bar repeats without new decisions. There are 12 foundations, 9 cymbal phrases and 3 timing feels. Explicit unavailable requests return an unsupported result; no preset is inserted as a hidden fallback. The UI describes the small groove library.

Accent and ghost-note levels are part of each written phrase. Eighth-note hats maintain a complete pulse and alternate supporting/accented notes; reggae can use stronger offbeats without deleting numbered-beat hats. Laid-back snares are delayed 9 ms. Sixteenth swing is 50%, 56% or 62%. Web Audio and MIDI share `barNotes`, and note-off events are constrained to the one-bar export boundary.

The transport schedules a whole bar with Web Audio and only accepts a pending replacement at a bar boundary. It performs no requests during repetition, skips expired notes after suspension, and Stop clears scheduled audio. Unsupported requests leave the current bar playing and keep their explanation visible.

## Real evidence

- Initial real API pocket: 1.367 seconds, 2 calls, 1,959 reported input tokens. Selected pocket + offbeat accents + laid-back feel.
- Reggae: 0.373 seconds, 2 calls, 1,958 tokens. Selected one-drop + offbeat accents + straight feel.
- Explicit 7/8/multi-bar request: unsupported in 0.199 seconds, one call.
- Computer-use pocket generation: 0.96 seconds displayed in the UI. Downloaded `beatbox-90bpm-one-bar.mid`: one bar, 13 notes (3 kicks, 2 snares, 8 hats), hat velocities 56/80, foundation 104. Snare onsets retain the approximately 9 ms delay after beats 2 and 4. No extra drums.
- Logic Pro: imported that exact downloaded MIDI with its 90 BPM tempo, repeated the region four times on SoCal, soloed its track (the previous comparison track remains muted), and bounced bars 1–5. WAV is stereo 24-bit, 44.1 kHz, 10.6667 seconds, peak −0.1005 dBFS after Logic normalization, RMS −19.01 dBFS. Project, MIDI and WAV are preserved in the main workspace `artifacts/one-bar-review/`.
- Browser electronic kit: offline-rendered the model-selected pocket four times. Peak 0.8591, RMS 0.07384, no clipping. The separate preview kit adds a snare body and wire transient, a faster kick pitch envelope, short hat envelopes and open-hat choking. It does not distribute Logic samples.

These renders establish actual audio outputs, not a subjective listening sign-off. The available tools do not deliver listening input to the agent. Musical quality remains a listener judgment; passing tests and matching note counts alone are not sufficient.

## Checks

130 tests pass, including dependency context, unsupported/malformed model answers, endpoint bounds, one-bar note-off limits, exact repeat timing, bar-boundary replacement, stopping and suspended-tab behavior. Production TypeScript/Vite build passes. Historical tests still cover the previous compatible API; the current UI uses only `oneBar: true`.

Computer-use follow-up: generated the pocket in 0.98 seconds, requested reggae during playback (0.68 seconds), and observed the complete one-drop arrangement after the boundary. A 7/8 request returned unsupported in 0.33 seconds while the same reggae bar continued; its explanation remained visible across repeated bars. Stop stayed stopped. At an actual 390 px viewport, the page had no horizontal overflow and Beat 3 navigation exposed the correct kick/snare cells. Browser error log was empty.

## Publication

Deployed source commit `c09a305` to `https://beatbox.grahammiles.me/make`, Worker version `50bf39cf-5493-4bbb-9474-7e844c187830`. The public UI arranged the default pocket in 0.71 seconds with two model calls, started looping, and stayed stopped after Stop. Source tests, build and deployment dry-run passed before publication.
