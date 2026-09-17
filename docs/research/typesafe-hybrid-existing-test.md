# Frozen TypeSafe / acoustic hybrid comparison

This experiment uses the previously inspected AVP test performers21–28:14 retained Fixed/Personal grooves,1,163 reference events,1,175 neural detections, and1,139 matches within50ms. These performers were excluded from acoustic-model training. This is **not a fresh unseen corpus**; no reserved MDV/VIS audio was evaluated here.

The acoustic classifier and neural onset model were frozen. TypeSafe received the original44.1kHz numeric descriptors and spectrum, a full crop ending at the next predicted onset or0.5seconds, and separately measured active duration. There were no examples, prompt changes, texture masking, fitting, or test-based parameter selection. Sequential API batches contained at most24 hits and started at least2.3seconds apart. Full responses and probabilities remain in ignored `artifacts/typesafe-existing-test/`.

The hybrid uses the training-only spectral-diversity threshold **1.2873168143334053**. Below the threshold it retains TypeSafe predictions. Above it, the hybrid retains TypeSafe ride/crash/aux predictions, otherwise uses the acoustic SVM's kick/snare/hat label. Hat subtype follows the larger TypeSafe closed/open posterior. It does not invent SVM confidence values or alter timestamps.

| Frozen pipeline | Correct core labels /1,139 | Core accuracy | Core joint F1 | Correct four-class labels | Four-class joint F1 |
| --- | ---: | ---: | ---: | ---: | ---: |
| TypeSafe |739|64.88%|63.22%|605|51.75%|
| Relative SVM |898|78.84%|76.82%|Not evaluated|Not evaluated|
| Gated hybrid |848|74.45%|72.54%|686|58.68%|

Core merges closed/open hats. Four-class scoring keeps them separate. Joint F1 counts extra and missing events; conditional accuracy only counts matched events. The shared onset F1 is97.43%, which does **not** establish97.43% correctly labeled MIDI notes.

The gate enabled13 recordings and returned no relative labels for P24 Personal, where keeping TypeSafe avoided10 errors. Compared with TypeSafe, the hybrid corrected181 core labels but spoiled72. Kick recall improved280→357/409 and hat recall333→382/452, while snare recall **regressed126→109/278**. Open-hat classification remained55/231. No ride/crash/aux examples in this evaluation establish recognition of those classes. Spoken “boots and cats” was not evaluated here.

Results establish a core aggregate improvement on this existing cohort, with material class regressions. They do not meet the95% transcription target or establish reliable seven-class behavior. No application changes or deployment were performed by these evaluation scripts.

## Rejected validation-only snare preservation rule

After observing snare errors, one fixed follow-up rule was evaluated **only on the existing P15–20 validation caches**: preserve any TypeSafe snare prediction; otherwise retain the frozen gated hybrid. No21–28 records were read for this follow-up, and no threshold search occurred. Because the hypothesis was motivated by previously inspected errors, this is development evidence rather than an independent test.

| Validation result | Existing gated hybrid | Preserve TypeSafe snare |
| --- | ---: | ---: |
| Correct core labels /672 |582|524|
| Core joint F1 |83.14%|74.86%|
| Correct four-class labels /672 |538|483|
| Four-class joint F1 |76.86%|69.00%|

The rule corrected15 snares but spoiled73 core labels. Four-class counts changed: closed hats149→143, open hats57→45, kicks221→169, snares111→126. Fixed-style recordings gained0 and lost32 correct core labels; Personal-style recordings gained15 and lost41. **Reject this rule.**

## Reproduce

With the existing public AVP manifests, frozen neural/SVM prediction reports, and cached validation API results present:

```sh
npx tsx scripts/typesafe-existing-test.ts
npx tsx scripts/typesafe-validation-snare.ts
```

The first script uses the live production endpoint for uncached test recordings and saves its exact answers. Reruns reuse completed caches. The second reads validation caches only and makes no API calls. Reports are written to `artifacts/typesafe-existing-test/report.json` and `artifacts/typesafe-validation/preserve-snare-report.json` respectively. Provider changes can affect uncached reruns; cached outputs are the evidence for the numbers above.
