# Exact-browser absolute plus standardized-relative features

The earlier core_relative experiment used Python absolute plus unscaled-relative
features. This condition instead uses exact browser raw1104 descriptors plus
standardized recording-relative1104 descriptors, concatenated to2208. Browser
native resampling, Kaldi bank and cropHit boundaries remain unchanged.

Training is original27 AVP1–14 annotated grooves,1161 events only. Fit separate
training-only StandardScaler + RBF SVC(gamma=scale): core3 C10 and four-class C1.
No weight changes, hyperparameter selection, extra examples or feature search.
Freeze both models/checksums before evaluation feature reads. Fixed8 Ward clusters
in each model's standardized2208space, fullmean OVO votes, core3 chooses instrument,
while predicted hats use the four-model pooled closed/open margin (positiveclosed).

Native validation15–20 only:707detections/694references/672matches. Compare frozen
original639core/605four. No21–28, private/reserved examples, tuning, app edits or
deployment. Root owns browser feature extraction; this script does not access
audio or change detector times. Previously exposed development evidence only.
