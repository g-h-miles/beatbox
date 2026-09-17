# Isolated-hit context augmentation (rejected)

The deployed relative SVM trains on 1,161 public AVP groove events from performers 1–14. This experiment adds 2,943 isolated events from those same training performers without using any private or evaluation voice for fitting. It tests whether additional articulations improve zero-calibration recognition.

The same descriptors are computed from the existing float16 fbank cache. Isolated examples are combined only within each participant and articulation mode (Fixed/Personal), then normalized together as if in a mixed recording. This creates feature contexts, not new audio or a claim that synthetic grooves are real performances. Two strategies were declared before evaluating: all isolated events pooled into one context per participant/mode, or three random partitions into roughly 32-event contexts. The seed is fixed. Both append the original groove events, use the original SVC C=3 and gamma='scale', and give isolated-derived rows sample weight 0.5.

Evaluation uses the existing frozen neural detector's complete P15–20 sequences, including unmatched detections in normalization. Both candidates keep all timestamps. There are 706 detections, 694 references and 672 matched events. The baseline is asserted to reproduce 592 correct labels before candidates are evaluated.

| Candidate | Correct core /672 | Core labeled-event F1 | Correct snares /152 |
|---|---:|---:|---:|
| Frozen deployed SVM |592|84.57%|116|
| Pooled isolated contexts |569|81.29%|101|
| Shuffled contexts |572|81.71%|101|

Reject both candidates. More isolated examples did not improve this model's groove classification and worsened snare recall. These are validation-development results, not independent test performance. No P21–28 audio, reserved MDV/VIS corpus, private recordings, app code, or production model was used or changed.

Run `python ml/core_relative_augment.py` after preparing the existing public caches. Results and private-to-workspace checkpoints are ignored under `artifacts/core-model/relative-augment/`. Do not replace `relative.pkl` with these candidates.
