# Next route toward zero-calibration beatbox transcription

Research date: 2026-09-17. This is a bounded primary-source review, not a claim that no better unpublished/proprietary system exists. No new test predictions were generated and no reserved data was consumed.

## Finding

I did not find a downloadable, openly licensed beatbox transcription checkpoint with demonstrated >95% correctly labeled event performance on previously unseen speakers. The strongest-looking figures found are classification of manually cropped sounds, user-adapted evaluation, or ordinary drum audio. They do not establish the requested zero-calibration product performance.

| Primary source | What it measures | Why it is not the requested evidence |
|---|---|---|
| [Sinyor et al., ISMIR 2005](https://ismir2005.ismir.net/proceedings/2126.pdf) | 95.55% five-class and 98.15% three-class classification; 1,192 manually segmented samples, six performers, 10-fold cross-validation | The paper does not specify holding speakers out by fold. Subjects heard model examples and produced non-pitched imitations. This does not include detection errors or literal voiced “boots and cats.” |
| [Delgado et al., 2022](https://arxiv.org/abs/2204.04646), [author code/results](https://github.com/alejandrodl/vocal-percussion-transcription) | Best reported syllable embedding: 89.9% participant-wise /87.4% boxeme-wise KNN classification | Explicitly a user-based method. Its embeddings and familiar AVP/LVT corpus do not establish a >95% zero-calibration path. Author README's pretrained-weight entry remains a placeholder rather than a usable checkpoint link. |
| [Martanto and Kartowisastro, 2025](https://thescipub.com/pdf/jcssp.2025.961.970.pdf) | Per-class F1 for KNN/SVM/etc. using MFCC and other descriptors | Still uses existing amateur/professional corpora. It explicitly applies a randomized 80:20 split to extracted features, not a documented speaker-held-out split. No larger new corpus or pretrained transcription model is provided. |
| [User-supplied DrumTranscriber article](https://towardsai.com/p/l/building-an-audio-classification-model-for-automatic-drum-transcription-heres-what-i-learnt), [author repository](https://github.com/yoshi-man/DrumTranscriber) | 90.7% test accuracy /90.8% F1, six drum classes, spectrogram image transfer learning | These are actual drum-track crops, stratified train/validation/test classification; not human vocal percussion or end-to-end event F1. Its workflow is useful engineering guidance, not evidence that the same model should achieve >95% on unheard beatbox voices. |
| [BaDumTss author repository](https://github.com/LCS2-IIITD/BaDumTss-PAKDD22) | Public multitask onset/classification training code and a dataset link | The inspected repository supplies training scripts, not a released checkpoint with a documented held-out-speaker score. Its existence does not resolve this project's generalization limitation. |
| [Neural Beatbox author prototype](https://codepen.io/naotokui/pen/NBzJMW), [author training gist](https://gist.github.com/naotokui/a2b331dd206b13a70800e862cfe7da3c) | Browser drum-kit sound classifier and generative rhythm demo | The source identifies a drum-kit spectrogram classifier; no held-out-human-speaker transcription metric is supplied. A compelling demo is not a comparable benchmark. |
| [Indexing and Querying Drum Loops Databases, author PDF](https://perso.telecom-paristech.fr/grichard/Publications/Cbmi.pdf) | Explicit speaker-independent recognition accuracy84.4%, with substitution/insertion/deletion penalties on1,057 vocal utterances | A relevant sequence-recognition precedent, but below target and uses a defined onomatopoeia vocabulary. It supports testing sequence context, not promising95%. |

The Evain2021 author manuscript was identified at [HAL](https://hal.science/hal-02896690v2), but its download currently returns access denial. I did not bypass that protection or use a third-party reupload as the basis for a new numerical claim.

## Corpus availability

Already acquired this session:

- MDV:420 intended-drum human imitations from14 performers; train/validation/test split fixed before evaluation. Recording-level labels only.
- VIS percussion subset:97 expert-included recordings from68 performer IDs; all reserved. Recording-level labels only; snare rolls/rimshots and unsplit hi-hats require explicit taxonomy handling.
- AVP-LVT: phoneme labels recovered. LVT's actual separate Google Drive audio is access-restricted, so its40 CSVs are not40 usable new audio recordings.
- Two unannotated CC0 human loops remain reserved; one real boots/cats clip was deliberately released to development.

See [data-sources.md](data-sources.md) for licenses, fixed splits, sources, hashes, and restrictions. No newly discovered larger usable corpus emerged from this follow-up. In particular, hundreds of augmented copies of one hit do not add hundreds of voices, and already-inspected AVP/Beatboxset1 cohorts cannot be called fresh tests by changing filenames or split labels.

## Concrete next experiment already assigned

The core classifier agent is implementing **a per-hit Transformer using recording-relative acoustic features and sequence context**, compared directly with an independent per-hit MLP on the same inputs. Training uses AVP performers1–14; validation uses15–20. Maximum40 epochs with patience8. Timestamps remain fixed.

This is a technically distinct experiment from another isolated-hit backbone: it tests whether a sound's repeated role, neighboring articulations, and inter-onset timing can resolve an ambiguous kick/snare mapping without asking the user for training examples. The sources above make sequence modeling plausible; they do not demonstrate this experiment will reach95%.

For a reviewable result:

1. Compare context vs independent MLP on identical detected events, feature extraction, training speakers and optimization budget. Do not credit better segmentation to the sequence classifier.
2. Report core kick/snare/hat macro-F1 and confusion, four-class metrics separately, conditional accuracy on matched events, and correctly labeled event F1 including missing/extra hits.
3. Also compare Fixed vs Personal recording modes. Fixed instructions resemble a constrained vocabulary; success there is not general amateur performance.
4. Keep exact event times. Tempo/beat position may be soft evidence only; never impose kick-on-one, move offbeat notes, or synthesize missing notes to improve a score.
5. Stop using the current validation cohort to choose models after this bounded comparison; freeze any candidate before one reserved-speaker evaluation. A successful validation result is still not proof on the user's voice or literal boots/cats.

Do not duplicate this experiment in a second agent. If it fails, the defensible finding is that current public corpus coverage and taxonomy leave the requested universal accuracy unproven—not that more hardware or another generic pretrained backbone guarantees a fix.

## Metric distinctions

- **Onset F1:** label-agnostic timing matches. A95% onset result may still contain many wrong drums.
- **Conditional classification accuracy:** correct labels divided by matched onsets; ignores missed/extra hits.
- **Joint labeled-event F1:**2×correctly labeled timing matches divided by detected+reference events. This is the relevant MIDI transcription score.
- **Recording classification:** one intended class per isolated file; cannot substitute for free-groove transcription.
- **User-calibrated:** target-speaker labeled examples used for adaptation. Must not be described as zero-calibration or unseen-speaker performance.
- **Oracle selector:** chooses a correct answer using ground truth after the fact. An upper bound, never a deployable classifier.
