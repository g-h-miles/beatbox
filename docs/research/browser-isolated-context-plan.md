# Planned isolated-hit augmentation with exact browser context

**Preparation only: no extraction, fitting, evaluation, or script changes were performed for this plan.** The proposed condition adds unused isolated AVP training hits while keeping every original groove training row unchanged. It differs from the earlier rejected augmentation by placing one isolated example at a time into its own speaker's existing groove normalization context.

## Existing evidence

`ml/core_relative_augment.py` extracted descriptors from Python filterbanks and normalized isolated examples together by participant/articulation mode. Its pooled condition grouped all isolated classes together; its shuffled condition made roughly 32-event mixed contexts three times. Neither inserted a single isolated example into the corresponding actual groove. Both retained the original 1,161 groove rows and used isolated sample weight 0.5 with C=3. They scored 569 and 572 correct validation core hits versus their then-current 592 baseline on 706 detections. Those results are not directly comparable with today's 707-event browser baseline.

`ml/core_relative_detected_train.py` used detected training crops instead: 1,143 matched training detections, or 2,304 rows combining those with annotated groove events. Normalization included unmatched detections before dropping their loss labels. Its C=3 conditions reached 580 and 585 correct versus 592. It did not use isolated recordings or the proposed insertion context.

The current production training manifest has exact browser features for 27 annotated grooves, participants 1–14. P14 has Fixed only. The public metadata contains 108 corresponding isolated recordings and 2,943 annotated isolated core hits. These are unused by the current production browser classifier, although they were used in the earlier rejected research experiment.

## Fixed proposed condition

1. Allow only participant IDs 1–14 and the existing four annotated classes. Preserve source participant, Fixed/Personal mode, file, event index, and annotation time. No validation or test event enters context construction.
2. Obtain each isolated event's **raw 1,104-dimensional `describeBank` vector** with the exact browser resampling, crop, Kaldi-bank, and descriptor functions. Use its own recording's next annotated onset for crop termination, with the existing maximum crop rule. Do not normalize a single-instrument recording by itself.
3. For each isolated event, take the raw descriptor matrix of the **same participant and same mode's existing groove**. Append exactly that one isolated raw vector. Apply the existing browser `normalizeRecording` to the complete temporary matrix, then keep **only its final augmented row**. Discard the newly normalized groove rows; retain the original cached groove training rows unchanged.
4. Each isolated event contributes once. Do not append all isolated events at once, create class-conditioned statistics, balance context composition using labels, cross Fixed/Personal modes, or synthesize audio. Context statistics see descriptor values only; annotation labels are used solely as supervised targets after the row is constructed.
5. Fit one fixed candidate with 1,161 unchanged original groove rows plus 2,943 inserted isolated rows. Keep original rows at sample weight 1 and isolated rows at **0.5**, matching the earlier conservative augmentation weight. Fit StandardScaler on the candidate training rows only, and apply the weights to SVC fitting. Keep current fixed C=10 for core and C=1 for four-class subtype, RBF gamma=`scale`, and eight Ward groups/full-mean margins. No C, weight, context-size, or grouping search.
6. Freeze the candidate before one comparison on the existing native P15–20 validation detections. Compare raw and current pooled/combined outputs with current acoustic baseline 639 core/605 four-class correct of 672 matches on 707 detections. Report class and recording regressions, particularly Personal snares. Do not run P21–28 unless a later explicitly authorized frozen evaluation is warranted.

## Exact event counts

| Target | Original groove rows | Isolated rows added | Candidate rows |
| --- | ---: | ---: | ---: |
| Closed hat | 219 | 729 | 948 |
| Open hat | 200 | 734 | 934 |
| Kick | 436 | 743 | 1,179 |
| Snare | 306 | 737 | 1,043 |
| Total | **1,161** | **2,943** | **4,104** |

Core hats merge to 1,882 candidate rows. Every isolated participant/mode combination has a corresponding groove: **27 contexts, no missing-context fallback needed**. Context groove lengths range from 18 to 85 events. The full candidate's effective SVC weight is 2,632.5 under the declared 1/0.5 weights. This changes event weighting as well as timbre coverage; it does not add speakers.

## Reuse and integrity checks for implementation

The recent `scripts/browser-absolute-relative-extract.mjs` writes `[raw1104, relative1104]` rows. Its existing training-only files under `artifacts/browser-absolute-relative/` can supply groove raw vectors without re-extracting them. Select filenames through the explicit 1–14 training manifest, never a wildcard over validation files. Verify row counts/times and the cached relative half against the unchanged production training features before reuse. The failed absolute+relative classifier itself is not reused.

New isolated vectors must use browser `describeBank` directly; raw vectors cannot be reconstructed from normalized features. Preserve float32 arithmetic through `normalizeRecording`, including its median and population-standard-deviation calculation with `+0.1`. Write hashes for unchanged original groove rows and assert byte equality before/after augmentation.

## Why this is worth a bounded test, and why it may fail

It adds 737 annotated training snares and more articulatory examples while locating each new hit relative to a real mixed groove from the same speaker/mode. This could improve coverage of repeatedly misclassified timbres without erasing isolated-class frequency structure through homogeneous normalization. It cannot manufacture absent vocal techniques or resolve unseen-speaker mismatch by itself. Isolated delivery may differ from in-groove delivery, and the added rows can still distort scaling or decision boundaries. The earlier isolated-context failures require treating this as one rejectable experiment, not a presumed improvement.
