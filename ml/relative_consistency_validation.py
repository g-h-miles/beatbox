"""Validation-only grouping ablation for the frozen relative SVM/neural crops.

Unsupervised groups use every detected hit and never assume class presence.
Eight fixed candidates: Ward groups3,4,6,8 with margin-pooling blend0.5 or1.
No supervised fitting, test cohort, reserved corpus, or private audio access.
"""
import hashlib
import json
import pickle
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
from scipy.fft import dct
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics import confusion_matrix

from prepare import crop, fbank

ROOT = Path('artifacts/relative-consistency')
CLASSES = ['hat', 'kick', 'snare']


def relative_features(banks):
    parts = []
    for lo, hi in [(0, 2), (2, 10), (10, 25), (0, 10)]:
        frames = banks[:, lo:hi]
        means = frames.mean(1)
        parts.extend([means-means.mean(1, keepdims=True), frames.std(1),
                      dct(means, type=2, norm='ortho')[:, 1:21]])
    x = np.concatenate(parts, axis=1)
    return (x-np.median(x, axis=0))/(x.std(axis=0)+.1)


def vote(margins):
    # sklearn/libsvm three-class pair order(0,1),(0,2),(1,2).
    votes = np.zeros((len(margins), 3), dtype=int)
    for column, (i, j) in enumerate([(0, 1), (0, 2), (1, 2)]):
        votes[:, i] += margins[:, column] > 0
        votes[:, j] += margins[:, column] <= 0
    return votes.argmax(1)


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    model_path = Path('artifacts/core-model/relative.pkl')
    pipeline = pickle.load(model_path.open('rb'))
    scaler, svm = pipeline.steps[0][1], pipeline.steps[1][1]
    svm.decision_function_shape = 'ovo'
    validation = json.loads(Path('artifacts/typesafe-validation/report.json').read_text())['recordings']
    recordings = []
    for record in validation:
        person = record['participant']
        assert 15 <= person <= 20
        audio_path = Path('artifacts/avp-full/AVP_Dataset') / record['mode'] / f'Participant_{person}' / record['file']
        cached = json.loads((Path('artifacts/typesafe-validation') / record['file'].replace('.wav', '.json')).read_text())
        times = np.array([hit['time'] for hit in cached['hits']])
        audio, rate = sf.read(audio_path, dtype='float32', always_2d=True)
        audio = librosa.resample(audio.mean(1), orig_sr=rate, target_sr=16000)
        banks = np.stack([fbank(crop(audio, time, times[i+1] if i+1 < len(times) else len(audio)/16000))
                          for i, time in enumerate(times)]).astype(np.float32)
        x = relative_features(banks)
        z = scaler.transform(x)
        margins = svm.decision_function(z)
        baseline = svm.predict(z)
        assert np.array_equal(vote(margins), baseline), 'OVO vote parity failed'
        # Matching reference indices come from the fixed neural evaluation;
        # they never determine feature boundaries or unsupervised groups.
        indices = np.array([m['hit'] for m in record['matches']])
        truth = np.array([CLASSES.index('hat' if m['expected'] in ['closed', 'open'] else m['expected'])
                          for m in record['matches']])
        recordings.append({'file': record['file'], 'mode': record['mode'], 'participant': person,
                           'detected': len(times), 'reference': record['reference'],
                           'z': z, 'margins': margins, 'baseline': baseline,
                           'indices': indices, 'truth': truth})
        print(f"Prepared {record['file']}: {len(times)} predicted events", flush=True)

    def score(predictions):
        reports = []
        for mode in ['all', 'Fixed', 'Personal']:
            selected = [i for i, r in enumerate(recordings) if mode == 'all' or r['mode'] == mode]
            actual = np.concatenate([recordings[i]['truth'] for i in selected])
            guessed = np.concatenate([predictions[i][recordings[i]['indices']] for i in selected])
            correct = int(sum(actual == guessed))
            detected = sum(recordings[i]['detected'] for i in selected)
            reference = sum(recordings[i]['reference'] for i in selected)
            reports.append({'mode': mode, 'correct': correct, 'matched': len(actual), 'detected': detected,
                            'reference': reference, 'accuracy': correct/len(actual),
                            'jointF1': 2*correct/(detected+reference),
                            'confusion': confusion_matrix(actual, guessed, labels=[0, 1, 2]).tolist()})
        return reports

    baseline = score([r['baseline'] for r in recordings])
    assert baseline[0]['correct'] == 592 and baseline[0]['matched'] == 672, 'Frozen baseline mismatch'
    trials = []
    for count in [3, 4, 6, 8]:
        groups = [AgglomerativeClustering(n_clusters=min(count, len(r['z'])), linkage='ward').fit_predict(r['z'])
                  for r in recordings]
        for blend in [.5, 1.]:
            predictions = []
            for recording, group in zip(recordings, groups):
                pooled = recording['margins'].copy()
                for label in np.unique(group):
                    indices = group == label
                    pooled[indices] = (1-blend)*pooled[indices] + blend*pooled[indices].mean(0)
                predictions.append(vote(pooled))
            row = {'clusters': count, 'blend': blend, 'scores': score(predictions)}
            trials.append(row)
            print(json.dumps(row), flush=True)
    best = max(trials, key=lambda r: r['scores'][0]['jointF1'])
    report = {'sourceModel': str(model_path), 'modelSha256': hashlib.sha256(model_path.read_bytes()).hexdigest(),
              'scope': 'Only P15–20 validation audio/caches. No P21–28/reserved/private audio or supervised fitting.',
              'grouping': 'Ward clustering on training-StandardScaler-transformed recording-relative acoustic features, all detections included.',
              'pooling': 'Blend each raw SVM OVO margin with same-group mean then apply original libsvm votes. No probabilities invented.',
              'classes': CLASSES, 'baseline': baseline, 'trials': trials, 'bestValidationCandidate': best,
              'perRecordingBaseline': [{'file': r['file'], 'correct': int(sum(r['baseline'][r['indices']]==r['truth'])), 'matched': len(r['truth'])} for r in recordings],
              'limitation': 'Candidate comparison is development evidence, not independent test performance. No class presence or rhythmic pattern is assumed.'}
    (ROOT/'report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({'baseline': baseline, 'best': best}, indent=2), flush=True)


if __name__ == '__main__':
    main()
