# Public boots-and-cats functional check after guarded release

The live deployed app was exercised on the existing CC0 Freesound740030 development clip ("G Beat Box boots n cats"). This clip has no independently verified instrument/onset annotations, so this is explicitly a functional check, not a recognition-accuracy benchmark.

Both modes completed with real API responses and downloaded MIDI. Beatbox-hit mode produced34 events (20kick,12closedhat,2openhat); spoken-syllable mode produced26 (18kick,7closedhat,1snare). All four API batches returned200. These counts do not establish that any particular label is correct. Spoken boots-and-cats accuracy remains unproven.

The script `scripts/boots-live-check.mjs` now uses the current UI labels. Outputs are retained separately under ignored `artifacts/boots-research/guarded-live/`, preserving earlier results.
