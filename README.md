# BEATBOX

Your mouth. Your groove. A small browser instrument for turning **monophonic beatboxing into unquantized drum MIDI**.

Record a take or drop an audio file, inspect detected hits, audition the original or synthesized drums, correct labels and timestamps, and download a Standard MIDI File for Logic Pro. Seven keyboard-playable pads are included. No account or upload storage.

## Run it

Node 22+ and npm are required.

```sh
make install
make preview       # builds and serves the full app at http://localhost:8787
```

For frontend hot reload, run `make dev` in another terminal and open http://localhost:5173. Its API requests proxy to Wrangler on port 8787.

### Connect TypeSafe

Copy `.dev.vars.example` to `.dev.vars` and enter your key locally:

```text
TYPESAFE_API_KEY=your_key_here
```

`.dev.vars` is ignored by Git. Restart `make preview`. No secret is ever embedded in browser assets. For production, run `make secret` and paste the API key at Wrangler's prompt.

Press **Classify sounds** to combine a local acoustic model with TypeSafe. The browser model recognizes kick, snare and hats in varied recordings; a recording-level check retains the TypeSafe path for homogeneous sounds. TypeSafe receives acoustic measurements, not the audio, and handles ride/crash/aux suggestions and fallback classification. The Worker validates requests, bounds their size, restricts browser origins, rate-limits callers and applies upstream timeouts. No audio leaves the browser.

**Recognition is still experimental.** On an exact paired native-browser comparison of14 previously inspected AVP grooves from performers excluded from fitting, this update improves core labeled-event F1 from75.66% to76.69%, and four-class F1 from61.57% to66.87%. Open-hat recognition improves, while closed-hat and Personal-style four-class results regress. This does not meet95% or establish seven-class or spoken “boots and cats” accuracy. See [the paired comparison](docs/research/native-hybrid-comparison.md). Local labels show “Suggested,” without an invented confidence score. API failure preserves existing hits; model failure falls back explicitly to TypeSafe.

No user training is required. Corrections can be supplied as examples for the current take. Private recordings are not part of the shipped public-data model. Model attribution and numerical parity checks are in [the model README](src/research-browser-model/README.md).

## Make a beat with TypeSafe

Open **Make a beat** (`/make`), describe a groove, set its tempo, and choose 8, 16, 32, or 64 sixteenth-note steps. Sixteen steps make one bar of 4/4. TypeSafe composes one step at a time; every request includes all previous decisions as individual lines. For each drum, one Choice question selects play or rest and a second selects the intensity to use if it plays (14 questions in one API request per step). The questions at a given step share the same history and run independently; multiple drums can sound together. There are no genre templates or rule-based note corrections.

Listen to the pattern, click a cell to change its intensity, and download MIDI. Silent steps remain in the exported timeline. The generator uses the same GM notes as the recorder and a separate rate limit. Keys stay in the Worker. Cancel stops the browser's sequence; a request already accepted upstream may still be billed.

The UI reports completed requests and returned input-token usage. A real API smoke test can be run against a local full-stack preview or the deployed app:

```sh
BEATBOX_URL=https://beatbox.grahammiles.me BEATBOX_STEPS=16 node scripts/generator-smoke.mjs
```

This makes real API calls and writes the resulting pattern and usage to ignored `artifacts/generator/`. Set `BEATBOX_PROMPT` to try another description.

## Keep the groove in Logic

1. Record dry, monophonic vocal percussion in a quiet space. No overlapping sounds or backing music. Use headphones when previewing.
2. Choose **Beatbox hits** for percussion or **Boots & cats · spoken syllables** to group spoken word endings. Syllable mode needs small gaps between words. It is not speech-to-text; review connecting words such as “and” as aux or remove them. Inspect the waveform. Sensitivity and **Re-detect** replace detected hits and edits. Add a missed hit at the waveform cursor, remove false detections, and correct labels/timestamps in the hit editor.
3. Press **Classify sounds**, listen to the drum preview, and correct wrong labels. Manual edits remain unchanged on another classification pass. You can also **Apply this label to similar hits** locally. Then set an export BPM. This does **not** move notes in seconds or quantize them. It controls the MIDI tempo metadata and seconds-to-ticks conversion.
4. Download the `.mid`. Set Logic's project tempo to that same BPM (or import the file's tempo), then drag the file onto a software instrument track with a GM-compatible drum kit. Leave region quantization off.
5. If your kit uses another mapping, remap notes in Logic. Aux uses high woodblock as a placeholder for breaths; GM has no standard breath percussion note.

| Sound | MIDI note | Channel |
|---|---:|---:|
| Kick | 36 | 10 |
| Closed hi-hat | 42 | 10 |
| Open hi-hat | 46 | 10 |
| Ride | 51 | 10 |
| Crash | 49 | 10 |
| Snare | 38 | 10 |
| Aux / breath (high woodblock) | 75 | 10 |

Note numbers are authoritative; octave names vary between DAWs. Preview sounds are synthesized and will not match the timbre of your Logic kit. DAW sample attack times can also affect perceived timing.

## Timing and audio

Web Audio decodes supported audio formats (browser-dependent). Input is limited to 90 seconds / 30 MB; microphone recording stops automatically at 90 seconds. Beatbox-hit detection runs a public-data neural onset model in a browser worker, with an explicitly reported energy-detector fallback. Spoken-syllable mode uses separate grouping. Detection preserves leading silence and never snaps timestamps to a beat grid. Optional groove hints affect uncertain TypeSafe labels, not timing. Feature extraction uses FFT band energy, spectral centroid/flatness, zero crossings, attack, duration, RMS, and normalized 20-band spectral shape for personal examples. No librosa or Python server is required.

MIDI format 0 uses 9,600 ticks per quarter and a tempo event. Note-on timestamps round to the nearest MIDI tick (at most ~0.1042 ms rounding at 30 BPM, less at higher tempos). End-of-track retains recording length. Note lengths are short triggers; hat choke behavior depends on the destination kit.

**Exact transcription is not guaranteed.** Detection can miss soft hits, merge closely spaced articulations, or split noisy tails. Automatic detection is capped at 600 hits. Cymbal imitations can be acoustically ambiguous. The UI offers manual correction; tests validate timing encoding separately from onset accuracy. Microphone/browser encoding may introduce leading delay; compare against the decoded recording.

The included demo is synthesized percussion for checking interaction and timing. It is **not a human beatbox sample or evidence of classification accuracy**. Development evaluation uses licensed public human recordings with annotated classes and onset times, separating training performers from evaluation performers. Additional private recordings remain local. Demo users do not need to provide a training set.

## Deploy

```sh
npx wrangler login
make secret              # optional until you want Jev enabled
make deploy
```

`wrangler.jsonc` configures the Worker, static assets, API routing, rate limiter and custom domain `beatbox.grahammiles.me`. The authenticated Cloudflare account must own that zone. The public API has a per-IP rate limit, not an account-wide spending cap; configure provider usage limits before sharing widely.

## Verification

```sh
make test                # MIDI round-trip and onset tests
make build               # strict TypeScript + Vite production build
npx wrangler deploy --dry-run
npx playwright install chromium
# With make preview running:
node scripts/browser-check.mjs
```

Browser checks cover demo loading, hit edits, original/drum transport, MIDI download, simulated microphone recording, and overflow/screenshots at phone, tablet, desktop and large desktop sizes. Unit tests check MIDI timing, model parity, combination rules, and fallback behavior. Separate live tests used annotated human recordings and a real Logic Pro import; see the validation report for methods and limits.

## Design

No preexisting brand or components were present. The fallback is locally hosted Inter, warm neutral surfaces and a muted sage accent, with Lucide icons. New primitives include the recorder/drop target, waveform editor, drum pads, hit table and export panel. Reduced-motion preferences and visible keyboard focus are respected. Keys 1–7 audition drums outside form controls.

Application code is MIT licensed; public-data model attribution is retained separately. Have fun. Keep the swing.
