# Flow review

The existing brand source is `src/style.css`, including Inter, ink `#242b26`, sage `#b6c4a0`, cream `#f5f5ef`, and the existing instrument pads and Lucide icons. No new font, palette, identity, dependency, or component system was introduced.

The recording controls now show status and errors directly below them. Classification appears beside the hit list, before export, with direct instructions to compare and correct sounds. Export keeps the same BPM guidance. Optional groove controls use a native details disclosure with an explicit on/off state. The existing playful headline and pads remain. Help no longer implies users need to train or record isolated sounds before using the converter.

The review preserves audio, model, timing, MIDI, and worker logic. It does not establish recognition accuracy. Classification responses in this UI test are mocked and labeled as such in the test.

## Validation

`npm run build` and all 28 tests on main passed. `scripts/ui-review-check.mjs` exercises demo loading, original and drum playback, mocked classification, correcting a sound, groove disclosure and beat origin, MIDI file header, invalid upload recovery, fake microphone capture, help Escape and focus restoration, and widths 390, 768, 1440, 1920. No page errors or horizontal overflow occurred. The separate rhythm browser check verifies hints toggle reversibly, confirmed edits survive, times stay unchanged, and MIDI downloads.

Additional browser checks covered the empty page, unavailable classification, simulated microphone failure, and a reduced 720 pixel desktop viewport. This is not a VoiceOver audit or an actual OS browser zoom check. Audio output was exercised programmatically, not scored by ear.

Screenshots are ignored local artifacts under `artifacts/ui-review/`, including loaded states at all four widths, empty and microphone error at 390, and recorded capture. Mobile and desktop screenshots were visually reviewed. Model integration still needs a final run against the integrated build, as the parent task is training separately.
