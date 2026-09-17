# Experimental onset model

`beatbox-onsets.onnx` is a 1.09 MB PyTorch temporal convolutional model exported at ONNX opset 17. The app uses this model to find hit timestamps. It discards the model's drum labels and keeps classification separate. If the model cannot load, the app visibly falls back to basic detection.

Training source: Alejandro Delgado, **Amateur Vocal Percussion Dataset v3**, https://zenodo.org/records/3250230, CC BY 4.0. These model weights are derived from that dataset; attribution must accompany reuse. Code is under the repository's MIT license; the dataset's attribution requirement is retained for the model artifact.

Classes are closed hat, open hat, kick and snare. Ride, crash and aux are not represented by this model. Its strongest verified improvement is onset detection. Timing results on four drum classes do not establish seven class recognition accuracy. Ride, crash, aux, and spoken words need separate validation. Its drum labels are not used by the app. `ml/README.md` records the exact results and limitations.

Input: `[1, 64, frames]`, centered 512-point STFT, 22,050 Hz, hop 110 samples, librosa Slaney mel filters, fmin 40 Hz, relative dB range 80, `(dB + 40) / 20`. Outputs: onset logits and four drum logits. Inference uses 96-frame contextual padding on each side and retains the central frames. Apply the threshold and peak policy in `src/neural-spectrogram.ts`; do not interpret logits as calibrated accuracy.
