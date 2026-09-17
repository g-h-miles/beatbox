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

TypeSafe's documented [System One API](https://docs.typesafe.ai/api) accepts structured state, **not raw audio**. We compute acoustic features in the browser and ask `jev-latest` a Choice question for each hit. Up to 24 independent questions share a request. The Worker validates both inputs and answers, bounds request size, restricts browser origins, rate-limits callers, applies timeouts, and retries upstream 429/529 responses with backoff. No audio leaves the browser. Classification is explicit: press **Classify with TypeSafe**.

**This is experimental acoustic-feature classification, not a trained beatbox recognition model.** Real-human spot checks, spoken-word tests, and Logic Pro import/playback validation are documented in [docs/VALIDATION.md](docs/VALIDATION.md). Without personal examples, live Jev scored about 59–62% on two real takes; one take reached 47/47 matched labels after three explicit examples. These are development results, not a universal accuracy claim. Confidence reports Jev's distribution concentration, not probability that the entire audio pipeline is correct. Without an API key, local feature heuristics produce clearly marked review suggestions. Local predictions do not pretend to be Jev results. Failed AI passes leave all existing hits intact.

## Keep the groove in Logic

1. Record dry, monophonic vocal percussion in a quiet space. No overlapping sounds or backing music. Use headphones when previewing.
2. Choose **Beatbox hits** for percussion or **Boots & cats · spoken syllables** to group spoken word endings. Syllable mode needs small gaps between words. It is not speech-to-text; review connecting words such as “and” as aux or remove them. Inspect the waveform. Sensitivity and **Re-detect** replace detected hits and edits. Add a missed hit at the waveform cursor, remove false detections, and correct labels/timestamps in the hit editor.
3. For better classification, explicitly label a representative hit of each sound before pressing **Classify with TypeSafe**. Those corrections become personal acoustic examples for this take and remain unchanged by AI. You can also **Apply this label to similar hits** locally. Then set an export BPM. This does **not** move notes in seconds or quantize them. It controls the MIDI tempo metadata and seconds-to-ticks conversion.
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

Web Audio decodes supported audio formats (browser-dependent). Input is limited to 90 seconds / 30 MB; microphone recording stops automatically at 90 seconds. Detection operates on a mono downmix with 2 ms hops, adaptive energy novelty and sample-level attack refinement. It preserves leading silence and does not estimate or snap to a beat grid. Feature extraction uses FFT band energy, spectral centroid/flatness, zero crossings, attack, duration, RMS, and normalized 20-band spectral shape for personal examples. No librosa or Python server is required.

MIDI format 0 uses 9,600 ticks per quarter and a tempo event. Note-on timestamps round to the nearest MIDI tick (at most ~0.1042 ms rounding at 30 BPM, less at higher tempos). End-of-track retains recording length. Note lengths are short triggers; hat choke behavior depends on the destination kit.

**Exact transcription is not guaranteed.** Detection can miss soft hits, merge closely spaced articulations, or split noisy tails. The detector enforces approximately 48 ms between detections and caps automatic hits at 600. Cymbal imitations can be acoustically ambiguous. The UI offers manual correction; tests validate timing encoding separately from onset accuracy. Microphone/browser encoding may introduce leading delay; compare against the decoded recording.

The included demo is synthesized percussion for checking interaction and timing. It is **not a human beatbox sample or evidence of classification accuracy**. For a meaningful evaluation, record three isolated examples per class and a 15–30 second groove, annotate intended classes and onset times, then measure onset precision/recall, timestamp error and the class confusion matrix. Samples from the actual user are more useful than unlicensed clips.

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

Browser checks cover demo loading, hit edits, original/drum transport, MIDI download, simulated microphone recording, and overflow/screenshots at phone, tablet, desktop and large desktop sizes. Unit tests use synthetic signals. Separate live tests used annotated human recordings and a real Logic Pro import; see the validation report for methods and limits.

## Design

No preexisting brand or components were present. The fallback is locally hosted Inter, warm neutral surfaces and a muted sage accent, with Lucide icons. New primitives include the recorder/drop target, waveform editor, drum pads, hit table and export panel. Reduced-motion preferences and visible keyboard focus are respected. Keys 1–7 audition drums outside form controls.

MIT licensed. Have fun. Keep the swing.
