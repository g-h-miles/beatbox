# Unconstrained speech recognition probe (rejected)

This probes whether an existing CTC speech model can provide useful word/letter evidence for spoken boots-and-cats. It does not force a transcript or grammar, fit a model, assign drums from a reference answer, or change production behavior.

The source is Meta's [facebook/wav2vec2-base-960h](https://huggingface.co/facebook/wav2vec2-base-960h), pinned to revision `22aad52d435eb6dbaf354bdad9b0da84ce7d6156`. Its official model card describes English speech recognition at16kHz. The already cached weights are loaded locally; only the pinned vocabulary was fetched. No remote inference or private recording is used.

| Input | Unconstrained CTC output |
|---|---|
| Public CC0 Freesound740030 human development loop | `ITT IT IT I IF F IFIF` |
| Synthetic continuous phrase control | `BOOTS AND CATS AND BOOTS AND CATS` |
| Synthetic spaced-word control | `FOOTS CATS FOOTS CATS FOOTS CATS FOOTS CATS` |

The speech control establishes that the inference path works, not human beatbox accuracy. The public loop has no independently verified transcript or instrument/onset annotations; its output does not supply usable boots/cats evidence. Forcing the expected phrase would manufacture apparent success rather than validate recognition. Reject using this probe to replace the current classifier or derive a claimed95% score.

Character spans and logits are preserved in ignored `artifacts/boots-research/ctc`. Their20ms frame coordinates are model output positions, not exact sound-onset annotations. The loader reports a missing `masked_spec_embed`; this training-only augmentation parameter is not used in this evaluation-mode probe. Run `python ml/boots_ctc_probe.py` with the existing ML environment and cached model.
