# Fixed cross-speaker linear metric experiment

Only1161 existing exact-browser annotated AVP1–14 groove features are used for
training. Core classes hat/kick/snare; no new recordings, crops or feature changes.
Input StandardScaler is fitted to training features only. Rank32 linear projection
has no bias and is initialized from training-only PCA32 components whitened by
sqrt(explained variance+1e-6), deterministic full SVD. Seed1709.

For each anchor, positives have the same core label and a different participant.
One positive is sampled uniformly from that training-only set each epoch using
seed1709. Each anchor's negative is fixed to the nearest different-class training
example by Euclidean distance in standardized input, determined before fitting.
Equal participant×class anchor weights normalizedmean1. No validation mining.

Fixed objective: weighted mean max(0,d(anchor,positive)-d(anchor,negative)+1),
where d is mean squared coordinate distance in rank32 projected space, plus
0.01*mean((W-W_initial)^2). Full-batch Adam lr0.001,100epochs, no early stop,
no validation monitoring, no scheduler. TorchCPU with at most4threads for this
small matrix problem. Check finite objective throughout.

After the100th epoch, fit a training-only projected StandardScaler and C10 RBF
core SVM gamma=scale. Freeze input scaler, projection, output scaler, classifier
and checksums before reading native AVP15–20 validation features. Report raw and
fixed8Ward/fullmean OVO predictions using projected standardized feature geometry.
Compare frozen corebaseline639/672 and joint91.22%. No four-class adaptation,
parameter selection, test21–28/private/reserved reads, app changes, port or deploy.
This is previously exposed development validation, not an independent test.
