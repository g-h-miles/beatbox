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

## Guarded hybrid classifier review

The production build of the guarded hybrid classifier was tested locally with actual public P15/P16 audio and requests proxied to the real production TypeSafe endpoint. The ONNX detector, WASM runtime, and relative classifier binary all loaded successfully. The UI uses “Classify sounds” and shows “Suggested” for the local model instead of reusing an unrelated confidence percentage.

The browser test changed an existing hit's time, added another hit at the cursor, changed its velocity, and classified again. Both manually edited rows stayed unchanged. Every displayed hit timestamp stayed unchanged through classification. Original playback, drum preview, slice playback, sound editing, and MIDI download passed. Four responsive screenshots were captured and the mobile and desktop layouts were visually inspected. No JavaScript page errors or horizontal overflow occurred.

Blocking the relative model binary produced an explicit TypeSafe fallback notice and kept MIDI export usable. A simulated API failure left the full hit list unchanged. These deliberate failure cases are labeled in `scripts/hybrid-ui-check.mjs`; successful classification calls used the real API.

A separate native browser gate check in `scripts/hybrid-gate-browser-check.mjs` used fresh pages at 44,100 and 48,000 Hz. P15 Fixed improvisation loaded the model and produced 59 Suggested labels among 61 detected hits at both rates. P15 isolated Fixed kick skipped the model entirely and retained the TypeSafe path at both rates. This verifies those gate paths on real browser features; it does not establish general gate accuracy on all sounds.

All 49 unit tests passed. Artifacts are in `artifacts/hybrid-ui/`, including `gate-report.json`, `report.json`, MIDI, and screenshots. Recognition accuracy and the 95 percent target remain separate from this UI review. No deployment was performed by the UI reviewer.

## Deployed hybrid smoke check

The final live check ran on 2026-09-17 against `https://beatbox.grahammiles.me/`, after main commit `fa95741` and Cloudflare deployment `4dc2a29d-8727-4acb-84b2-9bf562fda95e`. The success path used no request interception, mocks, or proxy.

Public AVP P15 Personal improvisation produced 27 events. The detector ONNX, MJS runtime, WASM runtime, relative classifier binary, status endpoint, and both actual classification requests returned HTTP 200. The local model produced Suggested labels. A manual change to the first hit, snare with velocity 101, survived classification. Every displayed hit timestamp stayed unchanged. Original and drum preview controls worked, and the final desktop screenshot was visually reviewed with no horizontal overflow or JavaScript page errors.

The downloaded MIDI was parsed independently. It contained 27 notes on channel 10 at 9,600 PPQ, including the edited snare note 38 with velocity 101. Its largest difference from the UI's rounded millisecond timestamps was 0.5104 ms. This checks export consistency with detected times, not timing against audio annotations or recognition accuracy.

Local evidence is `artifacts/hybrid-live/report.json`, `artifacts/hybrid-live/live.png`, and `artifacts/hybrid-live/reviewed.mid`. The reproducible check is `scripts/hybrid-live-smoke.mjs`. No additional code changes or deployment were required by this check.

## Acoustic grouping worker review

The next built release groups similar hits before assigning core sounds. The browser loaded the new worker bundle `worker-DX8b03_K.js`, existing model binary and detector runtime, and completed eight real TypeSafe API batches. Manual timing edits and added-hit velocity edits survived; every displayed timestamp remained unchanged. Original/drum playback, slice playback, label edits, model-failure fallback and unchanged-list behavior on API failure passed. Four responsive sizes passed with no page errors or horizontal overflow.

An independently parsed MIDI contained76 notes on channel10 at9600PPQ, preserving edited onsets at0 and0.070 seconds and the added note's velocity115. These checks verify behavior, not recognition accuracy. All51 release unit tests passed. Separate results are retained in ignored `artifacts/consistency-ui/`; the test supports `SMOKE_OUTPUT` to avoid overwriting earlier evidence.
