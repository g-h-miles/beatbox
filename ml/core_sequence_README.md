# Event-sequence context experiment (rejected)

This tests whether musical context and timbre recurrence improve core labels without quantizing timestamps. It uses a small event Transformer rather than the earlier frame-level acoustic CNN.

## Fixed protocol

- Train on AVP performers **1–14**, groove recordings only: 27 sequences, 1,190 actual neural detections, 1,161 reference events, 1,143 matched events.
- Validate on performers **15–20**: 12 sequences, 706 detections, 694 references, 672 matched events.
- **Performers 21–28 are not loaded or evaluated.** No MDV locked tests or private recordings are used.
- Onsets come from the existing frozen `transcriber.pt` model and its already selected threshold. The onset model was trained on these training voices and its threshold previously selected on these validation voices; this experiment does not provide a fresh independent detector validation.
- Every detection remains in the sequence. Annotation labels match one-to-one within 50 ms; unmatched labels are masked during loss, never removed from contextual input. Extra/missing detections count against the reported joint F1.
- Audio crops end at the next predicted onset, at most 500 ms. Reference times do not set crop boundaries. Predicted timestamps are never changed.

Acoustic input comprises recording-relative multiframe filterbank summaries, reduced to 64 whitened PCA dimensions using training detections only. Six additional features describe previous/next intervals, interval ratios to the recording median, and normalized elapsed/index position. There is no ground-truth tempo, beat grid, meter, or downbeat input. Training uses random subsequences to discourage fixed song-position shortcuts; inference uses whole sequences.

Both models use the same features, train-only scaler/PCA, supervision, optimizer, batch schedule and validation criterion. The baseline is an independent per-event MLP (75,907 parameters). The context model uses two Transformer layers with four attention heads (274,691 parameters), generic sinusoidal order encoding, and a per-event output head. This is not a parameter-matched architecture comparison.

Protocol was fixed at 40 epochs maximum with patience 8, selected using validation labeled end-to-end F1. The MLP stopped after 11 epochs and selected epoch 3; the Transformer stopped after 27 and selected epoch 19.

## Results

| Model | Correct matched core labels | Classification | Onset F1 | Labeled end-to-end F1 |
| --- | ---: | ---: | ---: | ---: |
| Independent MLP | 547/672 | 81.40% | 96.00% | 78.14% |
| Event Transformer | 553/672 | 82.29% | 96.00% | 79.00% |
| Previously selected relative SVM on neural crops | 592/672 | 88.10% | 96.00% | 84.57% |

The SVM is an existing pipeline comparison, not the parameter-matched baseline: its training features/crops and model selection differ. Its stronger result nevertheless means there is no reason to replace it with either new candidate.

The Transformer only gains six correct labels in aggregate. Hat correct counts rise 221→244 and kick 214→216, while **snare correct counts fall 112→93** (of 152). That behavior does not support deploying learned musical context as a correction for uncertain snares. The small validation gain is not independent evidence or a 95% claim. These are merged-hat/core-class results; ride/crash/aux and literal spoken phrases are outside this experiment.

## Reproduce

```sh
python ml/core_sequence_prepare.py
python ml/core_sequence_train.py --kind mlp
python ml/core_sequence_train.py --kind transformer
```

All reports, prepared sequences, trained checkpoints, and local sklearn preprocessing pickles are in ignored `artifacts/core-model/sequence`. Only load pickle files from trusted local runs. No production source code or UI behavior changed.
