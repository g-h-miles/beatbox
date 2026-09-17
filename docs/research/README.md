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
