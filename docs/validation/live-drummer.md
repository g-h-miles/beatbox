# Live drummer — September 17, 2026

The `/make` screen now starts a continuous TypeSafe drummer with an independent click and Web Audio transport. It defaults to a four-bar rolling view; the browser controls and Worker reject lengths above four bars. Resolution remains independent of duration. The sequencer fits the viewport, with bar navigation and a beat view on phones.

## Architecture and prompt corrections

The previous client imposed 550 ms between every step and passed growing note history into the next decision. The replacement requests one musical direction, then parallel batches of up to eight positions. Live mode continually requests future batches instead of replaying a finished pattern. It uses a 1.8-second lookahead and a count-in of at least 1.5 seconds rounded to whole quarter-note beats. The click starts immediately. Responses are stored by absolute musical position and only scheduled by the audio clock. A late result is dropped rather than played immediately or in a subsequent loop. Stop aborts the requests and stops scheduled audio sources. Suspended tabs skip elapsed ticks instead of emitting a catch-up burst.

Each question includes its actual position because TypeSafe's question IDs are not supplied to the model. Questions distinguish a new strike from a ringing earlier sound, explicitly permit simultaneous cymbal/foundation strikes, and preserve the difference between eighths and offbeat eighths. Code calculates metrical facts and alignment with the model-selected timekeeping cadence; it does not insert notes or replace the model's choices. Auxiliary percussion now has a specific inclusion question rather than a generic invitation to add sound.

The initial large-batch experiment exceeded the upstream token budget and was rejected. Batches were reduced. A short cymbal prompt also failed to preserve simultaneous hat/backbeat strikes; the final prompt retains the explicit overlap explanation. This was a prompting/representation failure, not evidence that the model cannot handle drum timing.

## Real API evidence

- Explicit four-bar rock instruction at 1/16: 48 requested notes, 48 returned correctly, no extras. A development run completed in 1.28 seconds.
- Initial 1/64 revision: 46/48 requested notes, no extras, 1.32 seconds. The final cadence-plus-overlap formulation returned 48/48, no extras. That final development request took 4.50 seconds including a 3.18-second planning request during remote preview iteration, so sub-three-second completion is not guaranteed.
- Live 1/64 transport at 90 BPM: first click scheduled at 0.080 seconds, first sounding drum at 2.080 seconds. Across 11 seconds it issued 33 real requests, scheduled 218 positions and reported no late positions. These are measured audio-clock callback times, not a microphone measurement of speaker latency.
- Real browser session: 22 successful requests during continuous performance; responses ranged from 232–649 ms. Editing the prompt to kick-only sent a new plan and new ongoing requests without stopping the click. A subsequent computer-use check found that Stop could resubmit the form and restart playback; the final handler prevents the default action. The corrected UI stays stopped and permits MIDI export.
- A freeform “Syncopated reggae” check produced a recurring one-drop kick/snare and mostly offbeat hats: four kicks, four snares, seventeen hats across four bars. One additional hat remained on a numbered beat. This is better structural evidence than nonempty output, but it is not a claim of subjective musical quality or broad genre coverage.

## Verification and reproduction

`npm test`: 121 tests pass, including batch validation, four-bar boundary enforcement, cancellation, live prompt changes, exact scheduler timing and dropping stale responses. `npm run build` and `wrangler deploy --dry-run` pass.

The existing palette, fonts, controls and icons in `src/style.css` and `src/generator.css` were reused. Browser checks cover live input changes, Stop, response success and horizontal overflow at 390, 768, 1280 and 1440 pixels. Note appearance uses a short opacity/scale animation and respects reduced motion. Screenshots and raw model results are in ignored `artifacts/live-drummer/` and `artifacts/generator/`.

Run `node scripts/live-drummer-check.mjs` with `UI_URL` and `BEATBOX_URL` for a real browser check. `npx tsx scripts/live-drummer-timing.ts` measures live transport behavior; set `BEATBOX_RESOLUTION` for fine-grid tests. `node scripts/generator-parallel-smoke.mjs` checks the explicit rock fixture as a fixed pattern. These invoke the real paid model. Historical generator scripts/reports describe older sequential versions.

The live prompt controls upcoming decisions, not microphone listening. Already scheduled notes are preserved. A slow or unavailable model can leave gaps; the click remains accurate and the UI reports failures. The four-bar display is a rolling composition snapshot, not an unlimited recording of the performance.

## Computer-use and Logic review

A real browser download exposed a client regression: eight-position batches were still spaced sixteen positions apart. `pendingBatches` now supplies contiguous starts and has coverage tests for every supported resolution. The corrected reggae MIDI contains 25 notes (4 kicks, 4 snares, 17 hats), at 90 BPM for exactly four bars. A subsequent 1/64 browser download contains all 48 notes of the explicit rock fixture: 8 kicks, 8 snares, 32 hats, no other drums.

The corrected downloaded reggae MIDI was opened in Logic Pro on its SoCal kit, then bounced over bars 1–5 as stereo 24-bit, 44.1 kHz WAV. The bounce is 10.6667 seconds, peak −0.1005 dBFS, RMS −25.34 dBFS. Logic normalization was enabled. The saved Logic project, WAV and MIDI are preserved locally under `artifacts/live-drummer-review/` in the main workspace. A stalled import required restarting Logic after saving and backing up its projects; opening the MIDI from Finder recovered the workflow.

The audio file was checked for duration, signal and clipping. These tools do not provide listening input, so this is not a subjective listening sign-off. The browser synthesizer and Logic's SoCal kit are different sound sources.

The final computer-use Stop check held at 63 completed calls across subsequent observations. Its exported 1/64 live snapshot contained only kicks after the kick-only direction, with no other drums. This was a partial rolling snapshot after development hot reload, not a complete four-bar fixture.
