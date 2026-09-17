# Beatrhyming reference inventory

The [Blaylock, Phoolsombat, and Mullady study](https://www.frontiersin.org/journals/communication/articles/10.3389/fcomm.2023.1253817/full)
analyzes beatboxing interwoven with speech in one performance. Its
[publisher-hosted supplement](https://frontiersin.figshare.com/articles/dataset/Data_Sheet_1_Speech_and_beatboxing_cooperate_and_compromise_in_beatrhyming_ZIP/24803988)
is CC BY 4.0 and was downloaded for inventory only. No model was trained or
evaluated on it.

The verified archive contains a metrical text transcription and a spreadsheet,
but no audio or TextGrid. The spreadsheet has 88 spectral measurement tokens
with release times spanning 4.198–146.275 seconds: 18 `B`, 32 `K`, 21 `t`, five
`PF`, and 12 `k`. These are source symbols, not newly inferred labels.

This is a promising partial reference, not a complete transcription benchmark.
Coverage of every event and alignment to an obtainable audio file are unverified.
The text's musical grid cannot establish original unquantized onset times.
The study concerns beatrhyming rather than literal spoken boots-and-cats.

Reproduce with `python3 scripts/beatrhyming-inventory.py`. Ignored artifacts are
under `artifacts/new-public-audio/beatrhyming/`. Archive verification:

- MD5: `6b630a2349d2f723c236d1afba9538b1`
- SHA256: `4d0d69d6e10593c47eb1aa50715c0fe7273d2903be42b3fde744155c048b6cb5`

No predictions, audio alignment, forced transcript, or synthetic timing were
created. This source does not establish the requested >95% result.
