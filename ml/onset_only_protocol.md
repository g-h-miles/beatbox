# Frozen onset-only fine-tuning experiment

The deployed onset network was trained with both onset and instrument losses,
although production now discards its instrument predictions. Test whether
optimizing its shared features for onsets alone helps timing detection.

Start from the existing `transcriber.pt`; never overwrite it. Train only AVP
participants 1–14, using the original mixture of 75% groove and 25% all training
recordings. Keep the architecture, 512-frame crops, central loss region,
Gaussian onset targets, positive weight 6, and original noise/frequency-mask
augmentation. Freeze the unused instrument head.

Fixed schedule: seed 1709, five epochs, 40 batches per epoch, batch size 16,
AdamW learning rate 0.0001 and weight decay 0.02, gradient norm cap 2. No early
stopping, checkpoint selection, threshold search, or further tuning. Keep peak
height 0.4, separation eight frames, and prominence 0.05.

Save and hash the final checkpoint before evaluating AVP 15–20 grooves. Report
misses/extras, per-class misses, fast-event recall, and onset F1 against the
frozen baseline probabilities. No test/reserved/private audio, production
changes, or class-accuracy claims. Reused development validation and Python
preprocessing do not establish independent or browser-equivalent performance.

## Frozen Python result

The fixed five-epoch run used 135 training recordings, including 27 grooves.
At the unchanged peak settings, validation detections increased 706→718,
matches increased 672→683 of 694 references, and onset F1 rose 96.00%→96.74%.
Misses fell 22→11 while extras rose 34→35. Missed closed/open/kick/snare counts
changed from 6/1/12/3 to 3/2/5/1. Fast-event recall remained 9/10 and later
fast-pair-member recall remained 4/5. This is detection evidence only.

`onset_only_export.py` exports into ignored research artifacts and verifies
ONNX/PyTorch logits at three sequence lengths (maximum error 0.00001526).
`scripts/onset-only-extract.mjs` intercepts only the research browser's model
requests; it does not replace deployed assets. Native browser extraction on the
12 validation recordings produced 720 events, fetched the candidate model 12
times, and reported no page errors. The classifier follow-up is documented
separately in `onset_only_classify.md`.

All checkpoints and exact per-record probability arrays remain under ignored
`artifacts/onset-only/`. Original production checkpoints and source settings
were not modified.
