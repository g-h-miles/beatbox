# TypeSafe beat generator — initial version, September 17, 2026

**Historical report:** this version confused step count with note resolution, and its nonempty-output checks did not establish musical quality. It is superseded by the eight-bar revision.

The `/make` page composes a drum pattern with one sequential TypeSafe request per sixteenth note. Each request contains the user's description, tempo, position, and every prior step on its own line. Seven binary Choice questions decide play/rest; seven conditional Choice questions select intensity. No genre templates, fallback notes, confidence-based substitutions, or musical correction rules are applied.

## Real API checks

These were real requests through a remote Cloudflare development Worker using the existing server-side secret. Secrets were not copied into the browser or test files.

| Prompt | Steps | Input tokens | Wall time | Approximate inference cost |
|---|---:|---:|---:|---:|
| Syncopated reggae | 16 | 44,323 | 5.66s | $0.00186 |
| Driving rock beat | 16 | 44,809 | 5.65s | $0.00188 |
| Syncopated reggae | 64 | 219,239 | 18.43s | $0.00921 |

Costs use the published $0.042/million input-token rate on the test date; output tokens are free ([TypeSafe models](https://docs.typesafe.ai/models)). These are measured examples, not fixed prices or latency guarantees. Longer history increases later requests' token counts.

A separate real browser run completed 16 requests, displayed seven active cells, reported 44,282 input tokens, played the loop, downloaded a valid MIDI file, and navigated back to the recorder without a browser error. Its requests were checked to contain exactly all preceding returned decisions.

## Verification

- 75 unit tests pass, including existing recorder/model behavior, generator boundary checks, and MIDI event timing.
- Production TypeScript/Vite build passes.
- Browser checks cover sequential history, edit, playback across a loop boundary, MIDI download, cancel/resume, settings changes, and mobile overflow.
- Desktop and phone screenshots were inspected; the grid scrolls within the page and keeps sound labels visible.
- MIDI preserves leading/trailing rests, simultaneous notes, chosen velocities, and full pattern length.

Reproduce browser checks with `node scripts/generator-ui-check.mjs [baseURL]`. Run real generation with `BEATBOX_URL=<baseURL> node scripts/generator-smoke.mjs`; this incurs API usage. `UI_URL=<baseURL> node scripts/generator-live-ui.mjs` exercises the real deployed browser path. Raw development outputs and screenshots remain in ignored `artifacts/generator/` and `artifacts/generator-ui/`.

## Musical limits

This is a composition experiment, not a claim of genre mastery. Reggae and rock produced distinct rhythms and densities, but some requested styles yielded sparse patterns. A sparse ambient eight-step test selected silence throughout. The UI reports an all-rest result explicitly and allows editing or another prompt. The model's within-step questions share history but cannot see one another's current answers. Simultaneous incompatible cymbal choices are possible; no hidden musical rule changes them.

An initial combined rest/intensity Choice formulation collapsed to silence. Separating play/rest from conditional intensity improved the real results. A full-subset alternative was tested and rejected. All reported working examples use the shipped fourteen-question formulation.

## Production verification

Deployed source commit `4ed4b90` to Cloudflare version `be442dcb-ff52-48c5-9903-6f53d367d045` at https://beatbox.grahammiles.me/make. The public page completed a real sixteen-step generation with 44,306 input tokens and seven active cells, then passed loop playback, MIDI download, phone overflow, and recorder navigation checks with no browser errors. `/api/status` confirmed the server-side key was configured. An immediate post-deploy browser attempt timed out before finding the new form; after the new assets were visible, the full public smoke test passed.
