"""Export public-AVP-only frozen relative SVM and verify exact multiclass votes.

This is a research runtime artifact, not a deployed model. Input feature parity
is required separately before browser integration.
"""
import json
import pickle
from pathlib import Path
import numpy as np
from scipy.fft import dct


def main():
    root = Path('artifacts/neural-crop')
    pipeline = pickle.load(Path('artifacts/core-model/relative.pkl').open('rb'))
    scaler, svm = pipeline.steps[0][1], pipeline.steps[1][1]
    artifact = {'format': 'beatbox-rbf-svm-v1', 'classes': ['hat', 'kick', 'snare'],
                'training': 'AVP public performers1–14 annotated grooves only; no private audio',
                'scalerMean': scaler.mean_.tolist(), 'scalerScale': scaler.scale_.tolist(),
                'supportVectors': svm.support_vectors_.tolist(), 'dualCoefficients': svm.dual_coef_.tolist(),
                'intercepts': svm.intercept_.tolist(), 'supportCounts': svm.n_support_.tolist(),
                'gamma': float(svm._gamma),
                'featurePipeline': {
                    'audio': '16k mono antialiased librosa resample; crop starts10ms before predicted onset, ends next predicted onset or500ms, mean-remove, peak.8, zero-pad8000samples',
                    'bank': 'torchaudio.compliance.kaldi.fbank(audio*32768,num_mel_bins128,sample_frequency16000,frame_length25,frame_shift10);(bank-15.41663)/(2*6.55582); float16roundtrip thenfloat32',
                    'dimensions': [48, 128], 'frameWindows': [[0, 2], [2, 10], [10, 25], [0, 10]],
                    'perWindow': '128frame-means centered by their frequencymean;128framestd population;DCTII ortho of frame-means indices1:21. Concatenate in thatorder.',
                    'perRecording': 'For every1104feature subtract median overALLpredicted events, divide by populationstd+.1. Include unmatched/extraevents. Do not use labels.',
                    'classifier': 'StandardScaler, thenRBF SVC; multiclassone-vs-one votes; earliestclass wins vote ties. Positivepairscore votes firstclass.',
                }}
    # Independently reproduce the original model's predictions across every
    # public cached event; no labels are used in this numerical parity check.
    metadata = json.loads(Path('artifacts/ml-v2/events.json').read_text())
    bank = np.load('artifacts/ml-v2/fbanks.npy').astype(np.float32)
    parts = []
    for lo, hi in [(0, 2), (2, 10), (10, 25), (0, 10)]:
        z = bank[:, lo:hi]; a = z.mean(1)
        parts.extend([a-a.mean(1, keepdims=True), z.std(1), dct(a, type=2, norm='ortho')[:, 1:21]])
    x = np.concatenate(parts, 1)
    for file in sorted(set(r['file'] for r in metadata)):
        for kind in ['annotation', 'detection']:
            indices = [i for i, r in enumerate(metadata) if r['file'] == file and r['kind'] == kind]
            if indices:
                x[indices] = (x[indices] - np.median(x[indices], 0)) / (np.std(x[indices], 0) + .1)
    expected = pipeline.predict(x)
    standardized = scaler.transform(x).astype(np.float64)
    predicted = []
    supports = svm.support_vectors_
    boundaries = np.r_[0, np.cumsum(svm.n_support_)]
    for offset in range(0, len(x), 256):
        batch = standardized[offset:offset+256]
        squared = (batch*batch).sum(1)[:, None] + (supports*supports).sum(1)[None] - 2*batch@supports.T
        kernel = np.exp(-svm._gamma * np.maximum(squared, 0))
        votes = np.zeros((len(batch), 3), dtype=int)
        pair = 0
        for i in range(3):
            for j in range(i+1, 3):
                a, b = slice(boundaries[i], boundaries[i+1]), slice(boundaries[j], boundaries[j+1])
                score = kernel[:, a]@svm.dual_coef_[j-1, a] + kernel[:, b]@svm.dual_coef_[i, b] + svm.intercept_[pair]
                votes[:, i] += score > 0
                votes[:, j] += score <= 0
                pair += 1
        predicted.extend(votes.argmax(1))
    mismatches = int(np.sum(expected != predicted))
    if mismatches:
        raise RuntimeError(f'Export inference parity failed: {mismatches} mismatches')
    target = root/'relative-svm.json'
    target.write_text(json.dumps(artifact, separators=(',', ':')))
    report = {'events': len(expected), 'mismatches': mismatches, 'bytes': target.stat().st_size,
              'supportVectors': len(supports), 'features': supports.shape[1],
              'limitation': 'Model numerical parity only; no browser audio-feature parity established.'}
    (root/'export-parity.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
