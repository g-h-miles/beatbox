"""Fit a private seven-class profile using take 1; evaluate take 2 once.

Scores measure recording-label agreement on automatically proposed segments,
not verified note accuracy. Raw recordings and fitted profiles stay ignored.
"""
import argparse
import json
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
import torch
from scipy.signal import find_peaks
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.metrics import confusion_matrix

from train_transcriber import Transcriber, RATE, HOP, prepare

CLASSES = ['kick', 'closed', 'open', 'ride', 'crash', 'snare', 'aux']


def features(audio):
    padded = np.pad(audio, (0, max(0, 11025 - len(audio))))[:11025]
    padded = padded / max(float(np.max(np.abs(padded))), 1e-5)
    mel = librosa.feature.melspectrogram(y=padded, sr=RATE, n_fft=512,
                                        hop_length=HOP, n_mels=64, fmin=40)
    db = librosa.power_to_db(mel, ref=np.max, top_db=80)
    # Preserve attack versus decay rather than averaging the entire sound.
    parts = np.array_split(db, 5, axis=1)
    return np.concatenate([np.r_[p.mean(1), p.std(1)] for p in parts])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('manifest', type=Path)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    torch.set_num_threads(4)
    model = Transcriber().eval()
    checkpoint = torch.load('artifacts/ml-v2/transcriber.pt', map_location='cpu', weights_only=True)
    model.load_state_dict(checkpoint['state'])
    banks, labels, splits, folds, rows = [], [], [], [], []
    for entry in manifest['recordings']:
        path = args.manifest.parent / entry['file']
        audio, rate = sf.read(path, dtype='float32')
        audio = librosa.resample(audio, orig_sr=rate, target_sr=RATE)
        spectrum = prepare([{'path': str(path)}])[0]
        padded = np.pad(spectrum, ((0, 0), (96, 96)), constant_values=-2)
        probabilities = []
        with torch.no_grad():
            for start in range(0, spectrum.shape[1], 800):
                end = min(start + 800, spectrum.shape[1])
                onset, _ = model(torch.from_numpy(padded[:, start:end + 192][None]))
                probabilities.extend(onset.sigmoid()[0, 96:-96].numpy())
        peaks, _ = find_peaks(probabilities, height=checkpoint['threshold'], distance=8, prominence=.05)
        times = peaks * HOP / RATE
        quality = {'file': entry['file'], 'split': entry['split'], 'label': entry['drum'],
                   'duration': len(audio) / RATE, 'candidateEvents': len(times),
                   'clippedFraction': float(np.mean(np.abs(audio) >= .999)), 'times': times.tolist()}
        rows.append(quality)
        for i, time in enumerate(times):
            start = max(0, round((time - .01) * RATE))
            end = min(len(audio), round((times[i + 1] if i + 1 < len(times) else len(audio) / RATE) * RATE), start + 11025)
            banks.append(features(audio[start:end]))
            labels.append(CLASSES.index(entry['drum']))
            splits.append(entry['split'])
            folds.append(min(2, int(i * 3 / len(times))))
    X, y, folds = np.array(banks), np.array(labels), np.array(folds)
    training = np.array(splits) == 'training'
    holdout = ~training
    if set(y[training]) != set(range(7)) or set(y[holdout]) != set(range(7)):
        raise ValueError('Need detected examples for all seven classes in each take.')
    candidates = []
    for c in [.1, 1, 10, 100]:
        correct = total = 0
        for fold in range(3):
            fit = training & (folds != fold)
            validation = training & (folds == fold)
            classifier = make_pipeline(StandardScaler(), SVC(C=c, kernel='rbf', class_weight='balanced'))
            classifier.fit(X[fit], y[fit])
            prediction = classifier.predict(X[validation])
            correct += int(sum(prediction == y[validation])); total += int(sum(validation))
        candidates.append({'C': c, 'trainingBlockCV': correct / total})
    selected = max(candidates, key=lambda item: item['trainingBlockCV'])
    classifier = make_pipeline(StandardScaler(), SVC(C=selected['C'], kernel='rbf', class_weight='balanced'))
    classifier.fit(X[training], y[training])
    prediction = classifier.predict(X[holdout])
    matrix = confusion_matrix(y[holdout], prediction, labels=list(range(7)))
    report = {'scope': 'Agreement with recording labels on unreviewed neural onset candidates; not transcription accuracy.',
              'classes': CLASSES, 'selection': candidates, 'selectedC': selected['C'],
              'trainingCandidates': int(sum(training)), 'holdoutCandidates': int(sum(holdout)),
              'holdoutCorrect': int(sum(prediction == y[holdout])),
              'holdoutAgreement': float(np.mean(prediction == y[holdout])),
              'confusionMatrix': matrix.tolist(), 'recordings': rows}
    (args.manifest.parent / 'profile-assessment.json').write_text(json.dumps(report, indent=2))
    # Reproducible private training inputs, no pickle or public voice-derived model.
    np.savez_compressed(args.manifest.parent / 'profile-training.npz', X=X[training], y=y[training], C=selected['C'])
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
