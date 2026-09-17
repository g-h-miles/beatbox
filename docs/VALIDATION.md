# BEATBOX validation — 2026-09-16

This is an experimental, editable transcription tool. Timing preservation in MIDI is reliable; automatic sound labels are not universally reliable. Three explicitly labeled examples from a take can improve classification substantially. Do not interpret model confidence as measured accuracy.

## Real human recordings

Source: Alejandro Delgado, **Amateur Vocal Percussion Dataset**, version 3, [Zenodo record 3250230](https://zenodo.org/records/3250230), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Tested `Personal/Participant_8/P8_Improvisation_Personal.wav` and `Personal/Participant_9/P9_Improvisation_Personal.wav`, with their CSV onset/class annotations. The dataset contains novice human vocal imitations, not synthesized drum audio.

No dataset audio is shipped or committed. Download the archive from the record and extract under `artifacts/avp-full/` to reproduce. The test files and raw responses used during development remain in the local ignored `artifacts/` directory.

Default hit detection, sensitivity 50. Greedy one-to-one matching within ±50 ms:

| Recording | Annotated hits | Detected hits | Matched | Unmatched detections | Mean absolute onset error |
|---|---:|---:|---:|---:|---:|
| Participant 8 personal improvisation | 47 | 49 | 47 | 2 | 4.38 ms |
| Participant 9 personal improvisation | 49 | 58 | 49 | 9 | 2.46 ms |

These clips have 100% onset recall under that tolerance; unmatched detections need review. An unmatched detection may be a tail, noise or a breath that the four-class annotations do not label. Timing errors are measured against the dataset annotator, not asserted perceptual ground truth. This is a two-recording spot check, not a general benchmark.

Live `jev-latest` classification, no personal examples, using the final plain-language acoustic descriptions:

| Recording | Correct labels among matched hits | Accuracy |
|---|---:|---:|
| Participant 8 | 29 / 47 | 61.7% |
| Participant 9 | 29 / 49 | 59.2% |

The earlier raw numeric batch formulation scored only 13/47 on Participant 8. Describing each sound directly in its own question fixed cross-item ambiguity but did not resolve differences between human performers. Some confidently wrong predictions remained.

### Personal examples, tested through the deployed app

On Participant 8, the actual deployed browser workflow was exercised: upload WAV → explicitly label three examples → Classify with TypeSafe → Download MIDI. The examples were detected hit indices 0 (closed hat), 5 (kick), and 39 (open hat), corresponding to approximately 0.196, 2.080, and 15.489 seconds. Labels came from the dataset annotations; no labels for remaining hits were supplied to the API.

All **47 matched hits** were correct after this pass, including the three provided examples: **44/44 remaining matched hits** were classified correctly. The two unmatched detections remained, so the downloaded raw MIDI contained 49 notes. This is a calibrated result on one take, not evidence of 100% accuracy on unseen voices. Calibration was added in response to this recording's failures, so the recording is development data, not an untouched test set.

The app preserves explicitly corrected labels during subsequent AI passes. Changing a timestamp or velocity alone does not silently promote its suggested drum label into a personal training example. “Apply this label to similar hits” is a separate explicit bulk action using normalized 20-band spectral distance; users should review those updates.

## Spoken “boots and cats”

A separate **synthetic speech** fixture was generated using macOS Samantha, with four spoken “boots” and four spoken “cats” placed at irregular known starts: 0.20, 0.91, 1.57, 2.34, 3.10, 3.89, 4.58, 5.39 seconds. It is not a human beatbox recording.

- Hit mode split this into 20 attacks.
- Syllable mode detected the intended 8 starts, preserving their times.
- Both local suggestions and live Jev classified the 8 words correctly as alternating kick/snare.
- The actual app exported `boots-and-cats.mid` with those 8 notes.

Syllable mode re-arms after 90 ms of quiet, or a new non-hiss attack at least 120 ms later, and analyzes the first 40 ms of each grouped syllable. It intentionally treats word tails as part of the word. A second, continuously spoken “boots and cats and boots and cats” fixture exposed over-merging. A spectral-tail fallback retained seven candidate starts for its seven words instead of merging the entire phrase into one event. This is a structural check, not a verified word-alignment result. Labels on continuous speech remain unreliable; use hit mode or edit/group hits as needed. This is not general speech recognition: “and” or arbitrary words are not semantically transcribed, and may become aux or another hit. If you literally say “boots and cats,” review the “and” syllable as aux or remove it. No guarantee is made for arbitrary speech or unseen voices.

## Logic Pro validation

A separate project was created and saved at `artifacts/BEATBOX Validation.logicx` without replacing the user's existing session.

1. Loaded the SoCal Drum Kit instrument.
2. Imported the **live-browser-downloaded** `real-beatbox.mid` and chose **Import Tempo** (120 BPM).
3. Event List showed **49 events**, channel **10**, off-grid positions, and expected note numbers including **36** (kick), **42** (closed hat), **46** (open hat).
4. Quantization was **Off**. Playback ran with active track and stereo output meters.
5. Imported the original human WAV onto a separate audio track at bar 1, aligned with the MIDI region. Audio Flex was off. Saved the comparison project.

The Logic MIDI region rounds its visual end to a bar; this does not move its notes. Logic displays events at its own tick resolution, so DAW import can introduce sub-millisecond tick rounding beyond the exporter. No audio-loopback or perceptual listening claim is made; playback was verified through instrument assignment, transport and output meters. Re-export was unavailable in the observed File menu, so a full Logic binary round-trip comparison was not performed.

## Automated checks

- 20 unit tests: MIDI decoding at 30, 93, 120, 173 and 300 BPM; leading silence; irregular timing; all seven GM mappings; event ordering; onsets at 22.05/44.1/48 kHz; sample-zero onset; silence; syllable grouping; Worker contract, validation, key isolation, personal evidence, and rate limiting.
- MIDI encoding error under 0.11 ms over the supported tempo range. This bound covers encoding, not onset detection or DAW playback latency.
- TypeScript production build and Wrangler deployment validation.
- Browser tests: synthetic demo, real WAV upload, invalid-file recovery, recording with a simulated microphone, original/drum playback, label/time/velocity edits, MIDI downloads, keyboard pads, and TypeSafe success/failure recovery.
- Responsive screenshots at 390, 768, 1440 and 1920 px, with no horizontal overflow. Native app recording permissions still depend on each user's browser.

Ride, crash and aux have MIDI mappings and synthesis previews but **have not been validated on labeled human examples**. The AVP dataset used here does not provide those labels. The implementation is useful as an assisted transcription instrument; it is not yet an accurate universal seven-class beatbox recognizer.
