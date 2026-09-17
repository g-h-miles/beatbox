# Fixed performer/class weighting experiment

Prior scripts were inspected before starting. Existing relative augmentation uses
Python float16 feature caches, isolated-event synthetic contexts and0.5 added-row
weights. Browser domain broadening weights domain×class. Neither is this exact
performer×class browser-feature experiment, so it is not an identical rerun.

Training: original1161 exact-browser annotated groove features from AVP1–14 only.
No new examples or feature changes. Separate core3 C10 and four-class C1 RBF SVC,
gamma=scale. For each model assign inverse count per present participant×targetclass,
then normalize sample weights to mean1. Thus each present participant×class cell
has equal total weight. Fit StandardScaler with those same weights and SVC with
those weights. No missing-class fabrication and no grid or validation selection.

Freeze both model files/checksums before evaluation. Use unchanged production
fixed8Ward/fullmean OVO core vote and four-model pooled closed/open hat margin.
Evaluate native AVP15–20 and previously inspected21–28, never fresh reserved/private
sets. Assert frozen old baselines639core/605four and962core/839four. No retuning,
app changes, port, deploy or commit. Test cohort is explicitly previously inspected.
