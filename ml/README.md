# Beatbox transcription: local training, browser inference

The recognition work now uses **PyTorch on Apple Silicon and librosa**. TypeSafe and Gemini are not part of this training/inference path. This is a research candidate, not a claim that automatic seven-class transcription is solved. The production classifier has not been replaced with these models.

The machine used for these runs reports an Apple M2 Max and **64 GiB** of unified memory. All training runs completed locally. Larger memory is useful for experiments, but these results show that model capacity alone does not solve the labeling problem.

## What improved

The joint temporal convolutional model learns onsets and drum labels from complete recording spectrograms. It avoids cropping events at the first short quiet gap. Training uses annotated events, including those missed by the original detector; evaluation counts extra and missing notes.

| Evaluation | Original detector onset F1 | Neural detector onset F1 |
| --- | ---: | ---: |
| AVP groove performers 21–28 | 91.34% | **97.43%** |
| Independent Beatboxset1, annotator DR | 89.07% | **95.29%** |
| Independent Beatboxset1, annotator HT | 87.89% | **93.18%** |

For AVP performers 21–28, detections fell from 1,331 to 1,175 while matched reference events stayed at 1,139 of 1,163. Mean neural timing error was 2.65 ms. Matching tolerance is 50 ms. A 97.43% onset F1 is **not** 97.43% correctly labeled MIDI notes.

The exported model is 1,085,531 bytes. ONNX logits agree with PyTorch to less than 0.00001 on the tested shapes. A Chromium worker processed a public 19-second AVP example in approximately half a second, with the same 48 events and labels as Python. Native browser resampling was checked as well. These are parity and execution checks, not recognition accuracy evidence. The module is not connected to the production recording flow yet.

## Classification is still the limiting part

- AudioSet-pretrained **BEATs**, fine-tuned on complete AVP events: 63.83% on matched test groove events. Rejected after seven epochs with validation-based early stopping.
- Four-class joint temporal model: **804/1,139 = 70.59%** correctly labeled matched test events; **68.78% end-to-end F1**. Selected after validation, with 12 epochs run.
- Expanded five-class model, trained with tempo/frequency/gain augmentation on AVP plus Beatboxset1: **730/926 = 78.83%** classification and **77.37% end-to-end F1** on its held-out cohort. This run completed 45 epochs. **This is a different split and corpus from the 70.59% result; it is not a paired nine-point improvement.**
- Episodic voice-adaptation network, trained explicitly on isolated examples → separate grooves: **907/1,139 = 79.63%**, after five labeled examples per class per voice/style. Forty epochs completed. This still does not justify making voice setup a required product step.

The expanded cohort includes AVP performers 25–28 and three Beatboxset1 performers. Validation uses AVP 21–24 plus three different external performers. Training uses AVP 1–20 and eight external performers. These recording sets have been inspected during prior experiments; do not describe subsequent experiments on them as fresh untouched tests. The first external-corpus evaluation above was performed before fitting anything on Beatboxset1.

The five-class expansion maps breath, humming, speech and miscellaneous vocal sounds to `aux`. Where the two external annotators disagree, only onset information is used for training. Its classification evaluation excludes 159 uncertain annotations and 122 detections near uncertain-only events; its separate all-annotation onset F1 is 96.68%. Ride and crash have no dedicated training class. Literal “boots and cats” is also not validated by these corpora. The core product requirement remains incomplete.

Full histories, counts and limitations: [reports](../docs/research/ml-v2).

## Reproduce

Requires Python 3.11, Node.js, and ffmpeg. Audio, large pretrained weights, caches and checkpoints remain under ignored `artifacts/`. The ONNX onset candidate is the only committed model artifact.

1. Put AVP v3 under `artifacts/avp-full/AVP_Dataset` using the source below. The source's `Discarded` personal recordings are not included (265 retained recordings, 9,219 supported annotated events).
2. For external evaluation/expanded training, put Beatboxset1's WAV files and `Annotations_DR` / `Annotations_HT` directories under `artifacts/beatboxset1`.
3. Run:

```sh
make ml-install
make ml-prepare
make ml-train
make ml-train-expanded
make ml-train-voice
make ml-export
```

`ml-prepare` exports all app detections and reference annotations, then builds 20,397 annotated/detected event inputs. The temporal model uses full-recording librosa spectrograms instead of those per-event inputs. All default splits are by performer. Augmentations stretch audio features and their targets together.

The rejected pretrained BEATs experiment can also be reproduced:

```sh
.venv-ml/bin/python ml/bootstrap.py
.venv-ml/bin/python ml/train_beats.py
```

Bootstrap checks hashes of the pinned Microsoft source files and the pinned public weight mirror before use. The checkpoint is loaded with `weights_only=True`.

To check the exported browser implementation, start Vite on port 5174, then run:

```sh
.venv-ml/bin/python ml/browser_reference.py
npm test
node scripts/neural-browser-check.mjs
```

The browser inference module runs in a Web Worker, keeps recordings on device, supports cancellation, and rejects silence and invalid samples. Model scores are not calibrated probabilities of correctness.

## Private labeled recordings

The `/teach` page collects recording-level labels for all seven requested sounds and exports a local JSON pack. It uploads nothing. Take 2 is explicitly marked as holdout.

```sh
make ml-import PACK=/path/to/my-beatbox-training.json VOICE=my-voice
```

Import validates sizes/labels/IDs, decodes audio into local WAVs, rejects exact duplicates, and preserves the train/holdout distinction. It does **not** invent ground-truth onset times. Review and annotate those before using the recordings as transcription benchmarks. A profile's fresh isolated takes are also not a substitute for evaluating a separate groove.

For a preliminary personal spectral classifier, run `python ml/evaluate_private_voice.py artifacts/voice-data/<voice>/<pack>/manifest.json` after training the onset model. This selects an SVM using temporal blocks of Take 1 only, then evaluates Take 2. It accepts variable repetition counts. Reports and profile arrays remain beside the ignored private recordings. Its score is agreement with recording-level labels on automatically detected candidates, not verified event accuracy: breaths, false detections, and missing hits require separate review. Do not tune on the reported Take 2 results or publish the private profile by default.

## Sources and attribution

- Alejandro Delgado, **Amateur Vocal Percussion Dataset v3**, [Zenodo 3250230](https://zenodo.org/records/3250230), CC BY 4.0. The committed ONNX model and spectral model artifacts are derived from AVP. Raw audio is not redistributed.
- Dan Stowell / Queen Mary University of London and the respective contributors, **Beatboxset1** (2008–2009), [Internet Archive](https://archive.org/details/beatboxset1), CC BY-SA 3.0. Annotators: Helena du Toit and Diako Rasoul. Expanded-model checkpoints are experimental local derivatives and are not shipped.
- Sanyuan Chen et al., [BEATs](https://github.com/microsoft/unilm/tree/master/beats), MIT implementation and published weights; the bootstrap manifest records exact sources and hashes. This model did not earn deployment.
- The BaDumTss reimplementation on Hugging Face was inspected but not trained on. Its thousands of files include augmentations of 176 original samples; it was not treated as thousands of independent voices or a new reliable test set.
