# Published phoneme coverage of repeated core errors

The source audit finds **both sparse Personal-training coverage and disagreements between annotation releases**. Most repeatedly failed snares in P23/P25/P27 carry source phoneme tokens that the aligned Personal training grooves associate predominantly with hats. Separately, 19 of those 117 failed snare references have a different drum label at the exact same timestamp in AVP-LVT. Neither finding justifies changing previously reported scores.

This is a read-only join of existing predictions and public source annotations. No model fitting, new inference, LVT data access, private data access, label replacement, timestamp adjustment, or alternative scoring was performed.

## Alignment protocol

`ml/core_phonetic_error_audit.py` reads the AVP Personal annotation files in the [AVP-LVT release](https://zenodo.org/records/5578744), whose four columns are time, drum class, onset token, and coda token. It joins them to the original AVP reference annotations using one-to-one nearest matching within 5 ms, **requiring the original drum label to agree**. All accepted matches are effectively exact in time: maximum floating-point difference below 4×10⁻¹⁴ seconds.

The existing native detector/reference matches are reused from the earlier validation and test reports; source phonemes are attached to the reference event, not guessed from the predicted class. Tokens are preserved verbatim with an `onset|coda` separator. This audit does not reinterpret `x`, `ts`, or other source codes as a definitive physiological description.

| Scope, Personal only | Files | Original reference annotations | Same-label aligned | Same-time drum-label conflicts | Other unmatched |
| --- | ---: | ---: | ---: | ---: | ---: |
| Training P1–14, grooves and isolated | 65 | 1,933 | 1,897 | 30 | 6 |
| Validation P15–20 grooves | 6 | 345 | 334 | 11 | 0 |
| Existing test P21–28 grooves | 6 | 549 | 510 | 39 | 0 |

Among detector-matched Personal events, phonemes are available for 320/331 validation events and 499/535 existing-test events. Fixed-mode source phonemes are unavailable here. Thus an absent token in this audit **does not prove the Fixed training audio lacks the corresponding articulation**.

## The 117 failed snares

The original reference labels and existing acoustic predictions remain unchanged: P23 Personal has 35/35 incorrect snares, P25 has 59/59, and P27 has 23/23. Of these, 98 have same-label source phoneme matches; the other 19 are the version conflicts described below.

| Source token | P23 failed snares | P25 failed snares | P27 failed snares | Existing acoustic output |
| --- | ---: | ---: | ---: | --- |
| `ts|x` | 25 | 0 | 23 | All 48 → hat |
| `tʃ|x` | 0 | 35 | 0 | All 35 → hat |
| `t|x` | 3 | 7 | 0 | All 10 → hat |
| `k|x` | 0 | 4 | 0 | Three → hat, one → kick |
| `tʃ|h` | 0 | 1 | 0 | One → hat |
| Excluded source-label conflict | 7 | 12 | 0 | Original failure counts preserved |

## Training coverage of those exact source tokens

These counts include only source/original-label-agreeing **Personal** training annotations. They distinguish production groove supervision from isolated recordings used by prior rejected augmentation research.

| Token | Groove hats | Groove snares | Isolated hats | Isolated snares | Participants contributing snare supervision |
| --- | ---: | ---: | ---: | ---: | --- |
| `ts|x` | 36 | 0 | 97 | 8 | Isolated: P12 only |
| `tʃ|x` | 17 | 4 | 29 | 13 | Groove: P9 only; isolated: P5/P9 |
| `t|x` | 17 | 0 | 70 | 0 | None in aligned Personal sources |
| `k|x` | 0 | 2 | 4 | 0 | Groove: P13 only |
| `tʃ|h` | 2 | 6 | 36 | 16 | Groove and isolated: P9 only |

These tokens are not globally unique instrument identifiers. For example, existing-test `ts|x` has 30 source-aligned hats correctly predicted as hats alongside 48 source-aligned snares all predicted as hats. The same pattern appears for `t|x` (58 hats versus ten snares) and `tʃ|x` (ten hats versus 35 snares). This is evidence of a label/technique coverage problem worth examining, not proof that the underlying audio is indistinguishable or that intent cannot be learned.

The eight isolated `ts|x` snares and 13 isolated `tʃ|x` snares were already available to the rejected isolated-context augmentation. Their existence alone therefore does not justify repeating that experiment or claiming the problem has been solved by adding those files.

## Exact source-label conflicts

For the 19 excluded focus events, the source annotation occurs at exactly the original timestamp:

| Recording | Original label | AVP-LVT label | Count |
| --- | --- | --- | ---: |
| P23 Personal | snare | open hat | 7 |
| P25 Personal | snare | closed hat | 3 |
| P25 Personal | snare | open hat | 5 |
| P25 Personal | snare | kick | 4 |

Examples include P23 at 7.291927438 s (original `sd`, source `hho`, token `tʃ|x`), P25 at 4.051882086 s (`sd` versus `hhc`, `t|x`), and P25 at 6.588526077 s (`sd` versus `kd`, `p|x`). The artifact preserves every such conflict. The audit establishes disagreement; it does **not** establish which release is correct, whether it reflects changed intent interpretation, or why the change occurred.

There are also 30 training and 11 validation label conflicts, so this is not merely an isolated adverse test example. Six training references have no source event within the join tolerance and are kept unmatched. Do not attach a distant phoneme annotation to fill those gaps.

## Consequences for further work

Preserve the published baseline and its exact reference version. Do not relabel or remove the 19 focus events to improve the score. A useful next data-quality action is a source-version discrepancy ledger and a model-blind review of corresponding audio/annotation intent, beginning with training discrepancies. Any adjudicated reference version requires explicit provenance and a separately declared evaluation; prior scores stay attached to the old version.

For new training data, the concrete gap is multiple-speaker **snare** examples of the `ts|x`, `tʃ|x`, and `t|x` source-token families, paired with hats from the same speakers and recording conditions. That is a data-collection target, not permission to infer new labels from tokens. The held-out identities diagnosed here must not be added to training while continuing to call their old results held out.

## Reproduction and limits

Run `ml/core_phonetic_error_audit.py`. The ignored `artifacts/core-phonetic-errors/report.json` records alignment summaries, every unmatched/conflicting source entry, exact tokens, class/participant training coverage, and existing event predictions. It asserts original reference class identity before attaching a phoneme. The analysis uses previously inspected test errors for explanation, not new parameter selection. No acoustic similarity measurement, causal claim, new model metric, or reserved-data evaluation is implied.
