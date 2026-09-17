"""Frozen eight-group consistency rule on cached native-browser validation audio.

No new fitting/selection: original core SVM, Ward8, full mean OVO margins.
The features include browser resampling and browser neural detected boundaries.
"""
import hashlib
import json
import pickle
from pathlib import Path

import numpy as np
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics import confusion_matrix

from four_relative_train import CORE, OUT, match_labels
from relative_consistency_validation import vote


def main():
    model_path = Path('artifacts/core-model/relative.pkl')
    pipeline = pickle.load(model_path.open('rb'))
    scaler, svm = pipeline.steps[0][1], pipeline.steps[1][1]
    svm.decision_function_shape = 'ovo'
    records = {r['file']: r for r in json.loads(Path('artifacts/events-v2.json').read_text())}
    recordings = []
    for row in json.loads((OUT/'native-manifest.json').read_text())['rows']:
        record = records[row['file']]
        assert 15 <= record['participant'] <= 20
        x = np.fromfile(OUT/f"{row['stem']}-native.f32", dtype='float32').reshape(-1, 1104)
        labels, reference = match_labels(record, row['nativeTimes'])
        keep = labels >= 0
        truth = CORE[labels[keep]]
        z = scaler.transform(x)
        margins = svm.decision_function(z)
        baseline = svm.predict(z)
        assert np.array_equal(vote(margins), baseline)
        groups = AgglomerativeClustering(n_clusters=min(8, len(z)), linkage='ward').fit_predict(z)
        pooled = margins.copy()
        for group in np.unique(groups):
            selected = groups == group
            pooled[selected] = margins[selected].mean(0)
        predicted = vote(pooled)
        recordings.append({'file': row['file'], 'mode': record['mode'], 'detected': len(x),
                           'reference': reference, 'truth': truth.tolist(),
                           'baseline': baseline[keep].tolist(), 'grouped': predicted[keep].tolist()})

    def score(key, mode='all'):
        selected = [r for r in recordings if mode == 'all' or r['mode'] == mode]
        actual = np.concatenate([r['truth'] for r in selected])
        guessed = np.concatenate([r[key] for r in selected])
        correct = int(sum(actual == guessed))
        detected = sum(r['detected'] for r in selected)
        reference = sum(r['reference'] for r in selected)
        confusion = confusion_matrix(actual, guessed, labels=[0, 1, 2])
        return {'mode': mode, 'correct': correct, 'matched': len(actual), 'detected': detected,
                'reference': reference, 'accuracy': correct/len(actual),
                'jointF1': 2*correct/(detected+reference), 'onsetF1': 2*len(actual)/(detected+reference),
                'confusion': confusion.tolist(), 'matchedClassRecall': (confusion.diagonal()/confusion.sum(1)).tolist()}

    baseline = [score('baseline', mode) for mode in ['all', 'Fixed', 'Personal']]
    assert baseline[0]['correct'] == 590 and baseline[0]['matched'] == 672
    grouped = [score('grouped', mode) for mode in ['all', 'Fixed', 'Personal']]
    report = {'protocol': 'Frozen original three-class relative SVM; Ward8/full mean OVO; native browser resampling/detections; validation15–20 only; no tuning.',
              'classes': ['hat', 'kick', 'snare'], 'modelSha256': hashlib.sha256(model_path.read_bytes()).hexdigest(),
              'baseline': baseline, 'grouped': grouped, 'recordings': recordings}
    destination = Path('artifacts/relative-consistency/native-report.json')
    destination.parent.mkdir(exist_ok=True, parents=True)
    destination.write_text(json.dumps(report, indent=2))
    print(json.dumps({'baseline': baseline, 'grouped': grouped}, indent=2), flush=True)


if __name__ == '__main__':
    main()
