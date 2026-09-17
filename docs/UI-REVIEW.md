# Flow review

The existing brand source is `src/style.css`, including Inter, ink `#242b26`, sage `#b6c4a0`, cream `#f5f5ef`, and the existing instrument pads and Lucide icons. No new font, palette, identity, dependency, or component system was introduced.

The recording controls now show status and errors directly below them. Classification appears beside the hit list, before export, with direct instructions to compare and correct sounds. Export keeps the same BPM guidance. Optional groove controls use a native details disclosure with an explicit on/off state. The existing playful headline and pads remain. Help no longer implies users need to train or record isolated sounds before using the converter.

The review preserves audio, model, timing, MIDI, and worker logic. It does not establish recognition accuracy. Classification responses in this UI test are mocked and labeled as such in the test.

## Validation

`npm run build` and all 28 tests on main passed. `scripts/ui-review-check.mjs` exercises demo loading, original and drum playback, mocked classification, correcting a sound, groove disclosure and beat origin, MIDI file header, invalid upload recovery, fake microphone capture, help Escape and focus restoration, and widths 390, 768, 1440, 1920. No page errors or horizontal overflow occurred. The separate rhythm browser check verifies hints toggle reversibly, confirmed edits survive, times stay unchanged, and MIDI downloads.

Additional browser checks covered the empty page, unavailable classification, simulated microphone failure, and a reduced 720 pixel desktop viewport. This is not a VoiceOver audit or an actual OS browser zoom check. Audio output was exercised programmatically, not scored by ear.

Screenshots are ignored local artifacts under `artifacts/ui-review/`, including loaded states at all four widths, empty and microphone error at 390, and recorded capture. Mobile and desktop screenshots were visually reviewed. Model integration still needs a final run against the integrated build, as the parent task is training separately.

## Integrated detector review

The built Vite output was served on port 5184 and tested with real public AVP Personal improvisations P15 and P16. The browser fetched the ONNX model, bundled MJS runtime, and WASM successfully. It found 27 and 75 events respectively with no basic fallback. These counts establish functioning inference, not correct note classification.

The test proxied requests to the actual production TypeSafe endpoint with the production Origin. All four classification batches returned HTTP 200. Original playback, drum preview, sound editing, slice playback, and MIDI file download completed. Screenshots at 390, 768, 1440, and 1920 showed no horizontal overflow, and no JavaScript page errors occurred. Dense timeline syllable labels are hidden except for the selected hit so longer recordings remain readable.

A blocked model request produced the explicit basic detection notice and left export usable. A separate development run aborted an in progress worker and received AbortError. The development worktree's shared node_modules symlink required a temporary Vite filesystem allowance; production build assets did not require it. This temporary config is not committed.

`npm test` now passes 38 tests, including exact onset retention, discarded neural instrument labels, explicit model failure fallback, propagated cancellation, and separate spoken syllable mode. `npm run build` passes. `scripts/integration-ui-check.mjs` records the real API and runtime checks. It requires the downloaded public AVP corpus; it does not use private voice recordings. Results and screenshots are in `artifacts/integration-ui/`. These tests do not assert 95 percent classification accuracy, validate all seven sound classes, or replace listening and labeled model evaluation.
