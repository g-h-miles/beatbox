# AVP + MDV + Beatboxset1 domain-broadening candidate

This experiment adds independent human percussion imitations and explicit noncore negative classes. It does not use Graham's private recordings. None of these candidate models are wired into the app.

## Data and boundaries

- AVP: performers 1–14 train (4,104 annotation-derived events), 15–20 validation (681 matched actual detections). Performers 21–28 are not evaluated in this experiment.
- MDV: performers 0–7 train (240 recordings), 8–10 validation (90 recordings). **Performers 11–13 stay locked and are not read or evaluated by these scripts.** Ground truth is recording-level intended instrument, not verified event boundaries or audible articulation. MDV reference BFD drum samples are excluded; only CC BY 4.0 human imitation audio is loaded.
- Beatboxset1: alphabetically first eight recordings train (1,209 consensus-labeled events), next three validation (772 matched detections); final three excluded. Training keeps mapped class agreement between DR and HT within 50 ms. The source corpus was inspected in previous work, so this is not a new blind validation set. Ambiguous/missing annotation pairs are excluded explicitly.

The output classes are `hat`, `kick`, `snare`, and `other`. Both AVP hats are merged. MDV cymbals/toms and Beatboxset breath/humming/speech/miscellaneous sounds supervise `other`; this is not separate ride/crash recognition.

All features use the existing 16 kHz, 500 ms, 128-band Kaldi filterbank preparation. AVP/Beatboxset evaluation uses detector-derived boundaries. MDV onset is an energy estimate at 8% of peak smoothed RMS; it is not a reference timestamp. The model sees at most the first 500 ms of each imitation.

## Models and selection

`core_mdv_classical.py` compares ExtraTrees, gradient boosting, and RBF SVM over attack/post-attack/decay filterbank statistics. `core_mdv_neural.py` trains a compact CNN with centered filterbanks and frequency augmentation. Training balances each domain/class combination by inverse event count. Validation selection maximizes the mean of the domains' macro recalls; neither locked MDV nor held-out AVP test labels participate.

Every report includes separate domain overall/core classification and noncore recall. Different domain boundary/annotation conventions make a single pooled accuracy inappropriate. No onset F1 or end-to-end MIDI accuracy is claimed for the isolated MDV recordings.

## Reproduce

```sh
python ml/core_mdv_prepare.py
python ml/core_mdv_classical.py
python ml/core_mdv_neural.py
```

Prepared inputs, local checkpoints, and full histories live in ignored `artifacts/core-model/mdv`. Sources and hashes for MDV are in `artifacts/new-public-audio/mdv/manifest.json`, produced by `scripts/data-prepare-mdv.py`. AVP and Beatboxset sources are documented in the main ML README. Python/sklearn pickle models must only be loaded from trusted local runs.

## Completed result

The neural run stopped after 20 epochs; validation selected epoch 11. The classical comparison selected the RBF SVM. Neither is suitable to ship.

| Selected model | AVP core accuracy | Beatboxset core accuracy | MDV core accuracy | MDV noncore recall |
| --- | ---: | ---: | ---: | ---: |
| SVM | 571/681 = 83.85% | 486/659 = 73.75% | 27/54 = 50.00% | 20/36 = 55.56% |
| CNN | 538/681 = 79.00% | 435/659 = 66.01% | 38/54 = 70.37% | 26/36 = 72.22% |

The equal-domain validation macro recall is 65.06% for SVM and 67.81% for CNN. MDV overall accuracy is 47/90 = 52.22% for SVM and 64/90 = 71.11% for CNN. These disappointing validation results do not justify consuming the reserved test cohort or deploying the models. More diverse recordings by themselves did not solve cross-voice recognition, and explicit noncore examples reveal weak rejection that core-only tests conceal.

## Cross-voice invariance experiment (rejected)

`core_mdv_contrastive.py` makes a specific representation change rather than increasing CNN capacity:

- Input has an original centered-spectrum channel and a second channel subtracting each frequency's temporal mean. The latter emphasizes attack/body changes over stationary vocal/microphone color.
- Augmentation includes smooth spectral tilt.
- Supervised contrastive positives must share a class but come from different voices. Same-voice/same-class pairs are excluded from that loss denominator. The auxiliary contrastive loss has weight 0.25 beside classification CE.
- Inference compares normalized 128-dimensional embeddings using train-only cosine kNN or class prototypes. The rule and checkpoint are selected using the same validation domains, never the reserved tests.

The run early-stopped after 22 epochs (maximum 30), selecting epoch 14 and class prototypes. Equal-domain validation macro recall was **66.35%**, below the earlier CNN's 67.81%. Core accuracies: AVP **79.59%**, Beatboxset **67.22%**, MDV **62.96%**. MDV noncore recall was **63.89%**. A subsequent validation-only check with one prototype per training voice/class and the mean of the five nearest voices per class reached **66.68%** macro recall—still below the earlier CNN. This post-training rule check is additional validation selection, not an independent evaluation.

A descriptive training-only probe found reduced same-voice nearest-neighbor concentration within class:

| Class | Generic CNN | Contrastive embedding |
| --- | ---: | ---: |
| Hat | 82.90% | 78.24% |
| Kick | 81.38% | 74.15% |
| Snare | 85.09% | 80.59% |
| Other | 77.25% | 66.52% |

The probe excludes the identical event, but other events from the same recording remain, and all probe events were training data. It is **not** a held-out speaker-invariance metric. It supports the narrower observation that the representation changed toward less within-voice concentration; it did not improve validation recognition sufficiently. No candidate from this experiment should be deployed, and no reserved test voices were consumed.

```sh
python ml/core_mdv_contrastive.py
python ml/core_mdv_voice_probe.py
python ml/core_mdv_voice_prototypes.py
```

Reports: `contrastive-report.json`, `voice-probe-report.json`, and `voice-prototype-report.json` under `artifacts/core-model/mdv`.
