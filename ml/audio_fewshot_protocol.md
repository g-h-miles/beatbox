# Frozen few-shot audio diagnostic

This bounded experiment tests whether a multimodal model can identify unfamiliar public beatbox sounds after hearing labeled training examples. It does not replace or retrain the production model. No API calls are permitted before the temporary diagnostic endpoint is explicitly authorized.

## Frozen inputs

Preparation script: `ml/audio_fewshot_prepare.py`.

Prepared SHA-256: `7fd5dc67da91765ed302734073b3aecaaca458d2734d984594a59c09752b6cd0`.

The 12 examples use only AVP annotated grooves from participants 1–14. The existing 1,104-dimensional browser training features are standardized using training data alone. For each of closed hat, open hat, kick, and snare, KMeans uses three clusters, seed 1709, and `n_init=10`. The closest training event to each centroid is selected, requiring a different participant from prior representatives of that class. If a cluster has no remaining eligible voice, the closest unused voice of that class is the declared fallback. No validation audio, labels, or performance influence selection.

| Class | Selected participants | Training files/event indices |
| --- | --- | --- |
| Closed | 4, 2, 8 | P4 Fixed #6; P2 Personal #12; P8 Personal #13 |
| Open | 13, 3, 7 | P13 Fixed #52; P3 Fixed #5; P7 Personal #22 |
| Kick | 7, 11, 13 | P7 Fixed #31; P11 Fixed #5; P13 Fixed #22 |
| Snare | 8, 4, 11 | P8 Fixed #0; P4 Personal #4; P11 Personal #20 |

The 96 queries use eight events from each of the 12 existing native P15–20 validation recordings. For a recording with `n` detections, indices are `floor((i + 0.5) * n / 8)`, for `i=0..7`. All detections are eligible, including annotation-unmatched detections. Of the fixed 96 selected queries, 91 have existing reference matches and five are unmatched. This selection is not changed after responses.

## Audio encoding

Examples start 10 ms before the selected annotated onset and end at the next annotation or 500 ms after onset, whichever is earlier. Queries use the same crop rule with predicted onsets and the next predicted onset, never annotation-derived endpoints. Source boundaries are clamped to available audio. Each crop is resampled to 16 kHz, mean-centered, peak-normalized to 0.8, repeated twice with 100 ms silence between repetitions, and zero-padded to exactly 1.5 seconds. Each file is mono PCM16 WAV with 24,000 samples and a canonical 44-byte WAV header, 48,044 bytes total.

The JSON `audio` field contains plain base64 WAV. Requests include all 12 examples and at most eight queries:

```
{examples: [{label, audio}], hits: [{id, audio}]}
```

Expected response:

```
{answers: [{id, drum}]}
```

Allowed output labels are `closed`, `open`, `kick`, `snare`, `ride`, `crash`, and `aux`. Only labeled public audio is uploaded. No user recording or private audio is included.

## Evaluation

`scripts/audio-fewshot-evaluate.ts` checks the frozen preparation hash and makes no requests without `--request` and `AUDIO_FEWSHOT_ENDPOINT`. It sends requests sequentially, at least 2.3 seconds between starts, and retains all returned answers. There is no model tuning or alternate prompt condition in this experiment.

Compare the model response against frozen production acoustic labels at exactly the same selected indices. Report conditional correct core/four-class counts among matched queries, per class and recording style, plus the unmatched sampled count. Hats merge only for the core metric. Report unmatched outputs without inventing reference labels. Do not report full-transcription F1: the sampled cohort omits most detections and missing reference events. These are previously inspected validation speakers, not an independent holdout. No production deployment or application integration is implied.

Prepared WAVs, complete request JSON, response caches, provenance, and the eventual report live under ignored `artifacts/audio-fewshot/`.

## Temporary endpoint

`worker/research-audio-fewshot.ts` is a research-only entry point. It uses Gemini `gemini-3.1-pro-preview`, LOW thinking, the fixed prompt in source, and a structured seven-label response. It checks canonical WAV headers, batch limits, unique IDs, and returned labels, and never echoes upstream response bodies or secrets. Its 55-second upstream timeout bounds each request.

Run only with `npx wrangler dev --config wrangler.fewshot.jsonc --remote --ip 127.0.0.1 --port 8791 --inspector-port 9291 --show-interactive-dev-session=false`. The existing remote secret remains in Cloudflare; `/status` returns only whether it exists. This configuration is for temporary remote development, never production deployment. It has no production routes or assets. Stop the development process after the diagnostic.

Worker source SHA-256 used for this experiment: `3b4208ec5e2501294af0a28a14982333a6963abb97a09076f0254627b3b6d442`. No production deployment or global preview URL setting changed.
