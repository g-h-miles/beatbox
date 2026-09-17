# Eight-bar TypeSafe composer revision

The first generator confused note resolution with step count, and its "nonempty pattern" check missed serious musical failures. The original rock output missed both backbeats; the original four-bar reggae output never played a snare. This revision treats those as failures rather than evidence of successful composition.

## Timing and interface

Length and note division are independent. The default is eight bars in 4/4 at 1/16 resolution. 1/8, 1/16, 1/32 and 1/64 give 64, 128, 256 and 512 positions across eight bars. At 90 BPM, every version lasts 21⅓ seconds. MIDI unit tests check exact note ticks, final notes, and end-of-track duration at all four resolutions. Generated MIDI uses its encoded integer-microsecond tempo to retain exact bar ticks even at tempos such as 237 BPM; original audio transcription continues to preserve seconds. The UI displays one bar at a time with navigation; playback and export retain the full phrase.

## Model workflow

TypeSafe first selects a musical direction: foundation, timekeeping, voice, variation, and syncopation. These options describe musical vocabulary, not stored MIDI patterns. The onset prompts distinguish a new strike from a sound already ringing, and receive explicit overlapping boundary facts: a quarter-note boundary is also an eighth-note boundary. Each subsequent request supplies that decision, the original prompt, exact metrical coordinates, every previous note decision as a separate line, and the factual note at the same position in the preceding bar. TypeSafe selects kick/snare activity, cymbal activity and voice, crash/aux activity, and conditional intensities. Code validates and schedules the selected notes; it does not fill gaps or force genre-specific placements.

Splitting play/rest from competing intensity or voice choices prevents one silence option from winning against several divided playing options. Role-specific instructions distinguish the foundational rhythm from timekeeping and syncopation. Explicit user placements take priority over the model's musical direction.

The client paces requests and retries temporary upstream failures with cancellable backoff. Cancel and resume preserve completed notes and musical direction. Reported tokens and completed model calls remain visible; failed or canceled calls may not return billable usage, so this is not an account billing total.

## Musical review

A real "Syncopated reggae" run at eight bars and 1/8 resolution produced:

- Kick and snare together on beat 3 throughout.
- All 32 eighth-note offbeat hats, plus beat 4 connectors and small beat 3 variations in bars 4 and 8.
- Hat velocity 80, below the kick/snare velocity 104.
- Two distinct bar patterns, 58 total hits.

This is a coherent basic one-drop groove with instrumental balance and modest phrase variation. It is not proof of broad genre mastery: dynamics remain constant within each instrument, variation is restrained, and the sequencer stays on its chosen grid.

The run used 65 successful model calls and 273,994 reported input tokens in 38.6 seconds. At the published $0.042/million input-token rate, its inference cost is approximately $0.0115 ([TypeSafe models](https://docs.typesafe.ai/models)). This is one eight-bar 1/8 example, not a cost estimate for every resolution. A preliminary explicit rock test at eight bars and 1/8 matched all 96 requested notes with no extra notes; final fine-resolution verification is recorded below.

## Reproduction

- `npm test`: Worker validation, cancellation/error boundaries, musical intent persistence, and MIDI timing.
- `node scripts/generator-ui-check.mjs <URL>`: mocked sequential history, retries, cancel/resume, bars/resolution, intent, playback, export, and mobile layout.
- `UI_URL=https://beatbox.grahammiles.me BEATBOX_BARS=8 BEATBOX_RESOLUTION=64 node scripts/generator-live-ui.mjs`: real model calls through the public app; incurs API usage. The canonical instruction requests kick on 1/3, snare on 2/4, and eighth-note hats with no fills. Saved notation is scored against those explicitly requested placements.
- `node scripts/generator-analyze.mjs <pattern.json>` prints a bar-by-bar score. `node scripts/generator-score.mjs <pattern.json> rock` measures instruction compliance. Neither statistic is a subjective music score.


## Final fine-grid result

The complete real eight-bar 1/64 browser test passed all 512 sequential positions. It generated exactly the 96 requested rock notes, with **zero missing notes and zero extra notes**, retaining the same eighth-note hat density on the finer grid. The browser then passed loop playback, MIDI download, mobile overflow, and navigation checks with no page errors. All 100 unit tests and the production build passed.

That test used 513 model calls and 6,180,419 reported input tokens, approximately $0.260 at the test-date rate. Keeping every previous decision makes the finest, longest setting considerably more expensive than the eight-bar 1/8 example. This result establishes compliance with this explicit instruction, not universal genre quality.

The raw chosen note positions and velocities are preserved in [the rock example](examples/typesafe-rock-64ths.json) and [the balanced reggae example](examples/typesafe-reggae.json). Positions are zero-based; divide by the resolution to locate their bar. The reggae example predates the final onset-boundary wording; final public checks are recorded below.


## Public deployment verification

Source commit `6b7c213` was deployed to Cloudflare version `e000c234-ae1a-49bf-9bc4-c3283d324b0a` at https://beatbox.grahammiles.me/make. A real public browser test generated all 12 requested notes at 1/8 resolution, played and exported the pattern, and passed mobile layout and recorder navigation with no page errors.

The default public configuration was then tested with the unexpanded prompt "Syncopated reggae": eight bars, 1/16 notes, 90 BPM. It completed all 128 positions in 77.5 seconds using 129 model calls and 719,125 reported input tokens, approximately $0.0302. Kick and snare land together on beat 3 in every bar at velocity 104; hats play at velocity 56. The model added quarter-note hats as well as offbeats, so its selected offbeat timekeeping intent is interpreted loosely. This remains a basic generated groove, not a guarantee that freeform descriptions translate exactly. [The actual public output](examples/typesafe-reggae-default.json) preserves every chosen note.
