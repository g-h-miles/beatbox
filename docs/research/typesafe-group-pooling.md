# TypeSafe probabilities pooled within acoustic groups

A single frozen rule recovered 12 core hits incorrectly labeled as noncore on native AVP validation recordings. It is **not ready to promote from this evidence**: the validation contains zero genuine ride, crash, or auxiliary reference events, so it cannot measure whether the rule destroys those sounds.

The subsequent [mixed-recording safety check](typesafe-noncore-safety.md)
rejects this rule: it changes an independently annotated breath/miscellaneous
event from auxiliary to open hat. The all-core gain below is insufficient to
justify that regression.

## Frozen rule

Use the current browser core model's eight Ward groups, computed from all detected hits without reference labels. Average all seven TypeSafe probabilities within each group. For an individual event whose TypeSafe choice and probability argmax are noncore, substitute the frozen browser combiner's label only when the group probability argmax is core and the existing recording diversity gate passes. Otherwise preserve the current pipeline output. There are no new thresholds, tempo assumptions, model fits, or parameter searches.

The API returned one choice that differed from its probability argmax (kick versus snare). It was core either way and did not affect this rule. Requiring both individual choice and argmax to be noncore conservatively avoids altering existing core decisions.

## Paired validation

The comparison uses exactly 707 native detections on the 12 public AVP P15–20 Fixed/Personal recordings: 694 references and 672 matches within 50 ms. The previous 706-event TypeSafe cache was not reused. Both conditions share one newly requested set of full TypeSafe probabilities, the same native audio descriptors and active duration, and the same frozen browser model outputs. Requests used the unchanged prompt, no examples, batches of at most 24, and starts separated by at least 2.3 seconds. No test, reserved, or private audio was read.

| Pipeline | Core correct /672 | Core joint F1 | Four-label correct /672 | Four-label joint F1 |
| --- | ---: | ---: | ---: | ---: |
| TypeSafe | 454 | 64.81% | 419 | 59.81% |
| Current guarded hybrid | 627 | 89.51% | 593 | 84.65% |
| Group rule | 639 | 91.22% | 605 | 86.37% |
| Frozen model before noncore retention | 639 | 91.22% | 605 | 86.37% |

Joint F1 is `2 × correctly labeled matches / (707 + 694)`, so it includes missing and extra detections. The rule's conditional core accuracy is 639/672 = 95.09%; **this is not 95% correctly labeled transcription**.

All 12 TypeSafe noncore choices were replaced; all were matched to genuine core reference events and corrected. No previously correct label was spoiled. The recovered events were one closed hat, two open hats, three kicks, and six snares. Fixed-style four-label correct counts improve 315→324; Personal improves 278→281. All 12 recordings pass the pre-existing diversity gate.

## Evidence still needed

The available safety denominator is **0 genuine ride, 0 crash, and 0 auxiliary events**. Twelve recovered false noncore choices cannot establish noncore preservation. A promotion decision needs separately labeled real noncore hits from multiple speakers, including breath/noise sounds and mixtures where a ride, crash, or auxiliary sound falls into an acoustic group with kicks, snares, or hats. Report the true noncore events retained and falsely converted per class and speaker, alongside core recoveries, missing hits, and extra detections. Groups containing acoustically similar sounds of different intended classes are the specific failure case this experiment cannot test.

## Reproduction

`ml/typesafe_group_validation_prepare.py` exports the frozen validation model outputs, core groups, and public source audio. `scripts/typesafe-group-validation.ts` prepares exact inputs by default; `--request` enables API requests and reuses completed response caches. It asserts native raw model parity at 639 core and 605 four-label correct matches before writing the report.

Ignored local artifacts under `artifacts/typesafe-group-validation/` preserve exact features and probabilities, every event's labels, pooled probabilities, group IDs, margins, and the full report. No application code was changed or deployed.
