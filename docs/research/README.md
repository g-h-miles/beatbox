# Classification research — not released

These experiments do **not** meet the requested recognition quality. Production remains at commit 2393716. The candidate code is on a research branch, not a production improvement claim.

## Data and evaluation

Source: Alejandro Delgado, **Amateur Vocal Percussion Dataset v3**, https://zenodo.org/records/3250230, licensed CC BY 4.0. Features, model weights and tiny numeric test fixtures in this branch are derived from that dataset. Audio is not redistributed. This attribution applies to the generated model and fixtures in addition to the application MIT license.

The dataset covers kick, snare, closed hat and open hat. It does not establish performance on ride, crash, breath, or spoken English beatboxing.

The extractor runs the application's actual onset detector and matches detections one-to-one to annotations within 50 ms. Only matched, recognized labels enter classification evaluation. Missed and unmatched onsets are **not counted as classification successes**; these figures are not end-to-end transcription accuracy.

- 8,955 matched labeled events.
- Initial training: participants 1–14; model selection: 15–20.
- The selected CatBoost model uses spectra, attack/decay trajectories and DCT cepstral features.
- It scored 80.76% on validation improvisations.
- Refit on participants 1–20, then evaluated on participants 21–28: **2,008/2,857 = 70.28%** over isolated hits and grooves; **804/1,139 = 70.59%** on grooves alone.
- No manual target-recording examples were supplied for those results.
- Random hit-level splitting was deliberately avoided because it leaks performer identity across splits.

The final test results are in [acoustic-report.json](acoustic-report.json). After observing this result, additional experiments compared against the same test cohort; it is no longer a fresh untouched holdout for future research.

## Other experiments

| Method | Observation |
| --- | --- |
| Extra Trees, random forest, SVM, gradient boosting | Validation groove accuracy roughly 76–79% |
| Averaging predictions over similar sounds | No meaningful improvement over cepstral CatBoost |
| Constrained sound clustering | Worse validation results; rejected |
| 64 × 48 log-mel spectrogram CNN, 50 epochs, MPS | 71.55% test groove accuracy |
| CNN with longer sound tails | 69.18% test groove accuracy |
| Same-person isolated reference examples → separate grooves | Roughly 61–76%, depending on features and number of examples; not a reliable quick-setup fix |
| CNN embeddings with personal reference examples | Roughly 67–74%; rejected |

The CNN was selected by validation accuracy, not the final training epoch. Its test measurements used participants 21–28, absent from its training. These experiments used a modest CNN trained from scratch, not a pretrained audio foundation model.

A **paired live API comparison** sampled 12 evenly spaced detections per available held-out improvisation (168 events total). Old Jev-only feature descriptions scored 79/168 (47.02%); Jev plus the trained acoustic evidence scored 99/168 (58.93%); the acoustic classifier alone scored 114/168 (67.86%). These compare on the same clips and illustrate why an API wrapper must not automatically override a better acoustic prediction. They are distinct from the earlier two-take 60% spot check.

## Reproduce

Use a separate Python environment. `scripts/research-requirements.txt` records the experimental versions; runtime production dependencies remain JavaScript-only. Download and extract the attributed dataset under ignored `artifacts/avp-full/AVP_Dataset`.

```sh
python3 -m venv .venv-research
.venv-research/bin/pip install -r scripts/research-requirements.txt
npx tsx scripts/dataset.ts
.venv-research/bin/python scripts/train.py
.venv-research/bin/python scripts/cepstral-eval.py
.venv-research/bin/python scripts/export-model.py
.venv-research/bin/python scripts/train-spectrogram.py
.venv-research/bin/python scripts/train-context-spectrogram.py
```

`export-model.py` writes the candidate model, native Python probability fixtures, and held-out results. Unit tests verify TypeScript inference against native CatBoost probabilities on those numeric fixtures. The live comparison requires a separately uploaded candidate version and a valid server-side TypeSafe key; do not treat its stored preview URL as permanent.

The next experiment should evaluate an audio-capable pretrained model on the same labeled clips, then establish another genuinely fresh test set. Actual audio understanding could supply richer evidence for TypeSafe, but it is not yet demonstrated to solve this task. Any audio upload requires the product to explain where it goes; the current production app sends only features.

## Audio-capable candidate (evaluated; not released)

`worker/audio.ts` adds `/api/classify-audio` on this research branch only. It accepts at most eight canonical PCM16 mono WAV clips (16 kHz, 1.5 seconds each), caps the request body, checks browser origin, uses the existing rate limiter, and validates returned IDs and drum labels. Gemini hears the clips; Jev independently classifies Gemini's auditory descriptions. Both labels are retained so the benchmark can measure whether the second pass helps instead of silently overriding results. Neither model returns or changes MIDI timestamps.

The default model follows Google's current audio documentation (`gemini-3.8-flash`) and is overridable server-side with `GEMINI_MODEL`. Live calls confirmed availability but failed the recognition benchmark; results and the tested response-format contract are recorded below.

Create a dedicated key through Google AI Studio, then use `make audio-secret`. This uses `wrangler versions secret put GEMINI_API_KEY`, which creates a candidate version without deploying it to production. Never put the key in the browser bundle or a committed file. Once a candidate preview is uploaded with the secret, run:

```sh
npx tsx scripts/evaluate-audio.ts https://YOUR-CANDIDATE-PREVIEW-ORIGIN
```

The benchmark uploads clips from the public AVP dataset to Google, then sends the resulting descriptions to TypeSafe. It writes an incremental, ignored result file under `artifacts/`. It does not upload a user's recordings automatically. A released audio-model UI will need to state clearly that classification sends audio to Google.

## Live Gemini results — September 16, 2026

The user configured `GEMINI_API_KEY` through the Makefile. Its presence was verified by secret **name**, and successful live inference confirmed it works. No secret value was printed, committed or sent to the browser.

Google's audio documentation example used `generation_config.response_format.text.mime_type: "application/json"`, but the live endpoint rejected that field value. The candidate now uses the successfully tested `response_mime_type: "application/json"` contract. Input IDs are constrained in the output schema; no model controls MIDI timing.

| Experiment | Result | Scope |
| --- | --- | --- |
| Gemini 3.8 Flash, isolated clips in batches of eight | 23/63 labeled clips (36.51%) | Stopped early for poor quality; an extra unlabeled dataset event was excluded. The extractor was corrected to filter unsupported labels before sampling. This partial run is not a complete paired benchmark. |
| Gemini 3.8 Flash, full recording + target onset times | 50/144 (34.72%) | Completed 12 recordings before a model request failed; planned total was 168. Jev on the descriptions scored 51/144 (35.42%). |
| Gemini 3.1 Pro, one normalized sound repeated three times per clip | 6/11 (54.55%) | Small diagnostic probe of the first available example per class from selected personal improvisations; not a broad accuracy estimate. Jev also scored 6/11. |
| Wav2Vec2 base pretrained encoder + CatBoost | 63.30% on 1,139 test groove events | Local experiment; participants 21–28 remained outside training. Worse than the earlier feature classifier. |
| Wav2Vec2 embeddings + same-person isolated references | Approximately 51–55% | Three, five, or ten references per class; did not provide a reliable calibration fix. |
| Within-take nearest-neighbor references | Up to 80.24% on remaining events | Three **ground-truth labeled** examples per present class, excluded from scoring; duration-weighted spectral distance. This is assisted evaluation, not automatic recognition. |

Numeric/description results are retained in [gemini-context-results.json](gemini-context-results.json) and [gemini-pro-probe.json](gemini-pro-probe.json). The benchmark is still restricted to four annotated drum classes, not all seven UI choices. Repeated experimentation on these cohorts means they are development benchmarks, not fresh generalization evidence for another tuning round.

**Decision: do not deploy these candidates.** An audio-capable API did not establish an improvement. The production website remains unchanged. Further useful work requires better task-specific data and model development, or an explicitly assisted workflow; neither a new API key nor a different feature library establishes near-perfect recognition.

`pretrained-embedding.py` uses the Apache-2.0-licensed public `facebook/wav2vec2-base-960h` model, downloaded through Hugging Face, with local MPS inference. Those large weights and all raw audio stay outside Git. Temporary Cloudflare preview endpoints are disabled after testing.


## Follow-up experiments — September 17, 2026

No candidate in this round solved automatic recognition. No production deployment was made.

- **Fine-tuned Wav2Vec2:** unfroze the final two layers of an eight-layer truncated encoder, trained 20 epochs on participants 1–14, and selected the checkpoint using classification accuracy on participants 15–20. Evaluation on the previously inspected participants 21–28 gave **545/1,139 = 47.85%** on matched groove events. This was worse than the feature model and was rejected. The pretrained encoder's frozen features and this fine-tuned version are distinct experiments. MPS requires eager attention during training because its SDPA implementation does not support attention dropout.
- **Sequence prior:** learned drum-to-drum transition frequencies on training grooves and selected transition/prior weights on validation grooves. It changes labels only, never timing. The selected candidate gave **804/1,139 = 70.59%**, versus **808/1,139 = 70.94%** for its paired, unrefitted acoustic baseline. Rejected. The earlier 70.59% acoustic result came from the separately refitted model and is coincidentally the same number.
- **Representative review:** grouped sounds using acoustic features without labels, then revealed only each group's medoid label. Reviewed events were excluded from accuracy. A learned pairwise similarity model was trained on participants 1–14. The configuration with the highest validation accuracy (complete linkage, 12 groups per recording) reached **884/971 = 91.04%** on the remaining test events, after supplying **168 correct representative labels** across 14 recordings. This is a simulated assisted workflow, assumes perfect human labels, and does not establish automatic accuracy or usability. It is still too error-prone to present as a solution.

Full numeric reports: [encoder](finetuned-report.json), [sequence](sequence-report.json), [feature grouping](group-review-report.json), [learned similarity](pair-similarity-report.json). Scripts use the same ignored public audio and cached feature artifacts as the earlier experiments:

```sh
python scripts/finetune-encoder.py
python scripts/group-review-eval.py
python scripts/pair-similarity.py
python scripts/sequence-eval.py
```

The subgroup audit of the earlier refitted acoustic model gave 469/595 (78.82%) on fixed-imitation grooves and 335/544 (61.58%) on personal-imitation grooves. This demonstrates a performance gap; it does not establish that individual annotations are wrong or that intended drum identity is inherently unknowable.

All figures still exclude missed/unmatched onsets. These four-class experiments provide no validation of ride, crash, breath, or literal “boots and cats” recognition. No seven-class automatic accuracy claim is warranted.
