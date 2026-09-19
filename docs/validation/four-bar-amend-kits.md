# Contextual bars, kits, and amendments

The four-bar arranger no longer copies one generated bar four times. It makes two dependent TypeSafe calls per bar: foundation, then cymbal phrase/feel/fill. Each bar receives previous decisions and notes. The first bar also selects one of five synthesized preview kits: electronic, acoustic-inspired, dusty hip-hop, tight funk, warm reggae. Manual kit overrides preserve notes. MIDI contains standard drum notes and velocities; the preview kit is not embedded.

This remains an arrangement system over authored rhythmic vocabulary, not unrestricted note composition. Available fills include snare pickups, one-/two-beat sixteenth rolls, and a thirty-second roll at 1/32. TypeSafe determines which bars receive them. Unsupported requests leave the existing groove intact.

Amendments operate on the current grid, including manual edits. TypeSafe selects target instruments, then makes typed keep/remove/velocity/dynamic decisions for their cells. Code copies original notes and applies only selected changes; it never regenerates the phrase. Undo restores the pre-amendment snapshot. Manual cell edits clear the undo snapshot to avoid discarding subsequent work. Off-grid timing, tempo, kit and unavailable instrument edits are outside the amendment flow.

Real provider validation (2026-09-18):
- Four-on-the-floor with fill on bar 3: only bar 3 received a snare roll.
- Same request with fill on bar 2 at 1/32: only bar 2 received the fill.
- Dusty boom bap with fill on bar 4: only bar 4 received the fill.
- Reggae/acoustic requests without fills: no fills.
- Electronic, acoustic, dusty, funk and reggae prompts selected the corresponding kits.
- Add closed hat on bar 3 beat 2e: exactly zero-based step 37 changed from 0 to 56.
- Remove snare on bar 1 beat 2: exactly step 4 snare changed from 104 to 0.
- Make closed hats in bar 4 quieter: only steps 48, 52, 56 and 60 changed from 56 to 32.

Browser check `node scripts/four-bar-ui-check.mjs` exercises per-bar labels, kit overrides, playback, amendment and undo, MIDI download and mobile overflow. Offline audio rendering verifies each kit produces distinct non-silent audio without clipping in the test phrase. These checks establish behavior, not acoustic realism or general musical quality. Live browser check: `LIVE=1 UI_URL=https://beatbox.grahammiles.me node scripts/four-bar-ui-check.mjs`.

## Model-decided fill amendments (September 19)

The short-lived `applyFill` amendment route was removed at the user's request. For a fill amendment, Jev now selects its scope and musical direction, then decides each position sequentially with previous decisions in context. A binary strike/rest judgment is separate from drum and velocity selection. Code applies those returned choices and limits changes to the model-selected bars; it does not substitute an authored fill pattern.

Real requests: “add tom fills on bar 2” produced three high/mid/low hits; “ascending tom fill” reversed the pitch order; “sparse tom fill” selected one hit. Exact individual-note edits remained exact. Other bars were compared against the original and remained unchanged. A regression test makes Jev return an arbitrary single fill hit and verifies no template adds any other notes. This change concerns the amendment path; the initial groove arranger still uses its documented phrase vocabulary.
