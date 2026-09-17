# Frozen music-and-speech CLAP representation experiment

This tests an audio-text-pretrained representation, distinct from the prior BEATs, wav2vec, supervised CNN, and sequence-context experiments. No earlier CLAP run was found in the ML scripts or artifact reports before this experiment.

## Model and compatibility

The official [LAION model card](https://huggingface.co/laion/larger_clap_music_and_speech) identifies `laion/larger_clap_music_and_speech` as a music/speech CLAP checkpoint and lists **Apache-2.0**. The [official CLAP repository](https://github.com/LAION-AI/CLAP) documents its music/speech model family and audio-embedding use.

Pinned revision: `195c3a3e68faebb3e2088b9a79e79b43ddbda76b`.

Downloaded checkpoint: **776,444,665 bytes**, SHA256 `b73c5e596fda5b29b522a1ab3f0842977fe2b147bf8b78c2ec5f7ae6267038a1`.

The existing PyTorch **2.14.0** and Transformers **5.17.0** loaded `ClapAudioModelWithProjection` successfully on Apple MPS. Its audio encoder/projection contains **68,611,864 parameters**, producing 512-dimensional normalized embeddings. No dependencies were installed or replaced. Text-model keys in the complete checkpoint are unused by this audio-only model; the load reported no missing audio weights. The official feature extractor/configuration is used.

## Predeclared rendering and split

- Training: AVP performers 1–14, all supported annotation hits: **4,104** events.
- Validation: performers 15–20 groove recordings, using the frozen neural detector's **706 actual detections**, including **34 unmatched detections**. Reference count is 694, matched count 672.
- No performers 21–28, reserved MDV/VIS tests, or private user recordings are loaded.
- A single rendering is used throughout: mono 48 kHz audio, beginning 10 ms before the event and ending at the next event, capped at 500 ms; subtract mean and normalize peak to 0.8. Training crop boundaries use annotations; validation crop boundaries use only neural detections.
- The official processor's `repeatpad` pads these short clips to its standard 10-second input. This repeats audio as part of the model's normal preprocessing. No alternative padding/crop render was tried or chosen after seeing validation results.
- The encoder remains frozen. Linear SVM C={0.1,1,10} and RBF SVM C={1,10,100}, with default scale gamma, form the fixed head search. Validation labeled end-to-end F1 selects the head. No text prompts or task fine-tuning are used.

All validation predictions count in the end-to-end denominator, including unmatched extras. The three classes are merged **hat / kick / snare**. This does not establish separate hats, cymbals/ride/crash/aux, or literal spoken-phrase accuracy. The validation cohort and detector threshold were inspected in previous experiments; this is not a fresh blind test.

## Reproduce

```sh
python ml/clap_embed.py
python ml/clap_head.py
```

Weights, embedding cache, metadata, selected local head, and full report live under ignored `artifacts/clap`. Model/feature configuration and version/hash provenance are recorded in `model-manifest.json`. Only trusted local sklearn pickle artifacts should be loaded. No application or deployment code changes are part of this experiment.

## Completed result: rejected

All **4,810 embeddings** were produced successfully in about **91 seconds** of model inference. The fixed head search selected **linear SVM C=1**:

- Correct matched core labels: **574/672 = 85.42%**.
- Onset F1: **96.00%**; onset times are unchanged.
- Labeled end-to-end F1: **82.00%** (706 detections, 694 references).
- Confusion rows/columns are hat, kick, snare: `[[259,4,22],[22,204,9],[36,5,111]]`.

The existing relative acoustic SVM on the same validation neural crops achieves **592/672 = 88.10%**, joint F1 **84.57%**. CLAP therefore does not justify replacing it. The CLAP head search ranged from 78.42% to 85.42% matched classification; no rendering was changed after seeing those results.

A post-selection validation diagnostic found 537 events correctly labeled by both CLAP and the existing relative SVM, 37 correct only by CLAP, 55 correct only by the relative SVM, and 43 wrong in both. An oracle choosing between them using ground truth would get 629/672; **that is not a real model score** and is not used as a quality claim. Full model results are in `report.json`, with this diagnostic separately in `complementarity.json`.

The model is rejected for deployment. Reserved tests remain untouched, and no additional dependencies or application changes were introduced.
