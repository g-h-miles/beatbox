# Frozen group rule: noncore safety check

**Reject the group override for release.** On three existing Beatboxset validation recordings, it recovered two core labels but changed a genuine annotated noncore event from auxiliary to open hat. Baseline noncore retention was already poor; this rule made it worse. No replacement rule was tried.

## Cohort and scope

The allowed validation split is the alphabetically ninth through eleventh Beatboxset1 recordings: `putfile_bui.wav`, `putfile_dbztenkaichi.wav`, and `putfile_pepouni.wav`. Only those audio files and their existing DR/HT annotations were accessed. Neither reserved/test recordings nor private audio were read.

The unchanged production detector accepts at most 90 seconds. Before examining predictions, evaluation was bounded to each recording's first 90 seconds, or its full duration if shorter:

| Recording | Source duration | Evaluated duration | Source sample rate | Native detections | Existing diversity gate |
| --- | ---: | ---: | ---: | ---: | --- |
| putfile_bui | 95.83 s | 90 s | 44,100 Hz | 492 | Pass |
| putfile_dbztenkaichi | 64.25 s | 64.25 s | 22,050 Hz | 312 | Fail |
| putfile_pepouni | 92.55 s | 90 s | 44,100 Hz | 483 | Fail |

**Monophony has not been established for these recordings and is unknown.** No manual listening judgment was used to assume it. These are stress-test counts; they cannot be generalized directly to the user's monophonic target. The paired conversion of an independently annotated noncore event and the weak baseline on this cohort remain valid findings.

Both pipelines share the same 1,287 native detections, newly requested full TypeSafe probabilities, frozen browser model outputs, and pre-existing diversity gate. The candidate is exactly the earlier validation rule: only an individual noncore TypeSafe choice whose probability argmax is also noncore can be replaced; its frozen core Ward group's mean-probability argmax must be core, and the recording gate must pass. The substitute comes from the frozen browser model. There is no new threshold, model fitting, or condition search.

## Existing annotations and taxonomy

DR and HT are independent source annotators. Their labels map `k` to kick, `hc`/`ho` to hat, and `s`/`sb`/`sk` to snare. Breath (`br`), humming (`m`), speech/singing (`v`), and miscellaneous (`x`) form **other**. Unknown labels `?` and unmapped `t` are excluded rather than guessed. There are no explicit ride/crash reference classes; retaining any noncore output only counts as broad other retention, not correct ride/crash identification.

The annotators disagree substantially. Results are reported separately. Consensus pairs annotations one-to-one in nearest-time order within 50 ms, then retains pairs agreeing on the mapped kick/snare/hat/other category. It does not manufacture labels, require subtype agreement, or use model predictions. Consensus times use DR's annotation.

## Paired classification safety

Counts below apply only to matched native detections, with the same matches in both conditions.

| Reference set | Matched core | Correct core: current → rule | Matched other | Other retained: current → rule | Other converted to core: current → rule |
| --- | ---: | ---: | ---: | ---: | ---: |
| DR | 736 | 491 → 493 | 486 | 3 → 2 | 483 → 484 |
| HT | 1,100 | 647 → 649 | 145 | 3 → 2 | 142 → 143 |
| Consensus | 674 | 475 → 477 | 103 | 2 → 1 | 101 → 102 |

Only four event outputs change, all in `putfile_bui`, the sole recording passing the existing diversity gate. Two recover a correct core class. One destroys a retained true other event; the remaining change does not recover the correct mapped class. The consensus baseline's 475/674 correct core classifications and 2/103 retained other events also show that strong AVP results do not transfer reliably to this cohort.

### Inspectable noncore harm

| Recording | Detected time | DR reference | HT reference | Current | Group rule |
| --- | ---: | --- | --- | --- | --- |
| putfile_bui.wav | 84.258503 s | 84.234694 s, `x` miscellaneous | 84.239456 s, `br` breath | aux | open hat |

Both annotators identify this event as noncore despite differing subtypes. Its pooled group argmax is kick; the frozen acoustic model supplies open hat. This illustrates why core probability mass elsewhere in an acoustic group does not establish that every member is a core drum.

## Onset matching and limits

| Reference set | Reference events | Matched detections | Reference other | Matched other | Timing F1 against that reference set |
| --- | ---: | ---: | ---: | ---: | ---: |
| DR | 1,343 | 1,222 | 562 | 486 | 92.93% |
| HT | 1,501 | 1,245 | 258 | 145 | 89.31% |
| Consensus subset | 838 | 777 | 135 | 103 | 73.13% |

Matches are nearest one-to-one pairs within 50 ms. The detector is identical for both rules. Unknown/unmapped labels and annotator omissions limit interpretation of unmatched detections. In particular, consensus is an incomplete subset: detections unmatched to it are **not known false positives**, so its timing F1 is not a definitive onset quality estimate. No claim of 95% transcription or ride/crash safety follows from this evaluation.

## Reproduction and evidence

`ml/typesafe_noncore_prepare.py` exports only the explicit validation allowlist, truncates audio to the fixed duration limit, and exports unchanged model outputs. `scripts/typesafe-noncore-extract.mjs` uses native browser detection/features. `scripts/typesafe-noncore-validation.ts` prepares inputs by default; `--request` enables the same public feature API, with batches of at most 24 and at least 2.3 seconds between request starts. Completed responses are reused without requesting additional conditions.

Ignored artifacts under `artifacts/typesafe-noncore/` retain the full report, API inputs/probabilities, native event timestamps, groups, model margins, per-annotator matches, and `changed-other-events.json` with exact source labels and before/after outputs. Source annotation definitions are in `artifacts/beatboxset1/about_beatboxset1.txt`; Beatboxset1 is credited to Dan Stowell/QMUL and contributors under CC BY-SA 3.0. No application code was modified or deployed.
