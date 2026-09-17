# Few-shot audio classification diagnostic

**Reject this condition as a replacement for the acoustic classifier.** Gemini 3.1 Pro preview, supplied with 12 labeled public training examples, classified fewer of the same sampled validation hits correctly. No prompt adjustment, additional condition, or deployment followed.

## Frozen protocol

The [predeclared protocol](../../ml/audio_fewshot_protocol.md) selected three training examples per closed hat/open hat/kick/snare class, using training-only KMeans representatives from AVP participants 1–14 and distinct participants within each class. Examples and queries were encoded as 16 kHz mono PCM16 WAVs: two crop repetitions separated by 100 ms silence, padded to 1.5 seconds.

Eight midpoint-spaced native detected events from each of the 12 existing P15–20 validation recordings gave 96 queries. Selection included unmatched detections. There were 91 matched references and five unmatched queries. All inputs were frozen before any request, with prepared SHA-256 `7fd5dc67da91765ed302734073b3aecaaca458d2734d984594a59c09752b6cd0`.

A standalone temporary remote-development Worker made 12 requests with the fixed Gemini 3.1 Pro preview model and low thinking, each containing all 12 examples and eight queries. All 12 requests returned HTTP 200, with 93.3 seconds cumulative client request wall time. No private/user audio was uploaded. The Worker used server-side credentials and a 55-second server timeout; no API key appears in the artifacts.

## Conditional results

These metrics concern the **91 matched sampled detections only**, not full transcription or unseen holdout performance. The comparator is the frozen production acoustic model's label at exactly the same selected indices, before TypeSafe noncore retention.

| Method | Correct core /91 | Conditional core accuracy | Correct four-class /91 | Conditional four-class accuracy |
| --- | ---: | ---: | ---: | ---: |
| Frozen acoustic classifier | 86 | 94.51% | 82 | 90.11% |
| Few-shot Gemini audio | 75 | 82.42% | 70 | 76.92% |

| Reference class | Matched | Acoustic correct | Few-shot correct |
| --- | ---: | ---: | ---: |
| Closed hat | 21 | 16 | 18 |
| Open hat | 18 | 17 | 12 |
| Kick | 29 | 28 | 27 |
| Snare | 23 | 21 | 13 |

Fixed-style core/four counts fall 44/40→38/33 among 44 matches. Personal-style counts fall 42/42→37/37 among 47 matches. Closed-hat subtype recognition improves, but snare and open-hat regressions dominate.

## Unmatched sampled events

These five events were deliberately eligible for selection. They have no matched reference target, so their outputs are retained without inventing correctness labels.

| Recording | Event ID | Acoustic | Few-shot |
| --- | --- | --- | --- |
| P15 Fixed | hit-34 | kick | kick |
| P16 Fixed | hit-3 | kick | closed |
| P17 Fixed | hit-23 | snare | aux |
| P18 Fixed | hit-59 | snare | kick |
| P18 Personal | hit-109 | kick | kick |

No joint/full-transcription F1 is reported: the sample excludes most detected events and undetected reference hits. The previously inspected validation cohort is not an independent holdout. There are no genuine ride/crash/aux reference examples here, so their recognition is unvalidated. This rejects the tested few-shot condition; it does not establish that every possible audio model or prompt would fail.

## Completion and evidence

The temporary endpoint was stopped after the 12 successful requests; the development process terminated with exit 130. Production was unchanged. The root task reports four endpoint validation tests passing and a passing TypeScript check. No application integration or production deployment occurred.

Preparation and evaluation scripts are `ml/audio_fewshot_prepare.py` and `scripts/audio-fewshot-evaluate.ts`. Complete request inputs, public example/query WAVs, per-record response caches, and the score report remain in ignored `artifacts/audio-fewshot/`. The preparation hash, source event indices, audio hashes, and frozen endpoint configuration are recorded in the protocol and artifacts.
