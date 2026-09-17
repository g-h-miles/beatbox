"""Training-only small group heads: acoustic margins versus margins plus rhythm.

Fixed C grid0.1,1,10; train AVP1–14 predicted grooves, validate15–20 only.
Groups may contain mixed labels. Training preserves their full label distribution
via repeated group descriptors, weighting each group equally. No reference tempo,
downbeat, class-presence assumption, or label-informed clustering is used.
"""
import csv
import json
import pickle
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
from sklearn.cluster import AgglomerativeClustering
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from prepare import crop, fbank
from relative_consistency_validation import relative_features, vote

ROOT = Path('artifacts/group-rhythm')
MAP = {'hhc': 0, 'hho': 0, 'kd': 1, 'sd': 2, 'closed': 0, 'open': 0, 'kick': 1, 'snare': 2}


def descriptors(times, margins, groups):
    intervals = np.diff(times)
    unit = max(.025, float(np.median(intervals)) if len(intervals) else .25)
    before = np.r_[unit, intervals] / unit
    after = np.r_[intervals, unit] / unit
    rows = {}
    for group in np.unique(groups):
        indices = np.flatnonzero(groups == group)
        m = margins[indices]
        acoustic = np.r_[m.mean(0), m.std(0), m.min(0), m.max(0)]
        recurrence = np.diff(times[indices]) / unit
        rhythm = [len(indices)/len(times), len(indices)/max(.1, times[-1]-times[0]),
                  *np.quantile(before[indices], [.25, .5, .75]),
                  *np.quantile(after[indices], [.25, .5, .75]),
                  *(np.quantile(recurrence, [.25, .5, .75]) if len(recurrence) else [0, 0, 0]),
                  float(np.mean(np.diff(indices) == 1)) if len(indices) > 1 else 0]
        # Multiple pulse scales, all inferred from observed IOIs. The first
        # detected onset is a coordinate origin, never a declared downbeat.
        for multiple in [2, 4, 8]:
            phase = 2*np.pi*(times[indices]-times[0])/(unit*multiple)
            c, s = np.cos(phase).mean(), np.sin(phase).mean()
            rhythm.extend([c, s, float(np.hypot(c, s))])
        rows[int(group)] = {'acoustic': acoustic.astype(float),
                            'acousticRhythm': np.r_[acoustic, rhythm].astype(float)}
    return rows


def match(times, annotations):
    pairs = sorted((abs(time-a[0]), i, j) for i, time in enumerate(times)
                   for j, a in enumerate(annotations) if abs(time-a[0]) < .05)
    used_i, used_j, indices, labels = set(), set(), [], []
    for _, i, j in pairs:
        if i in used_i or j in used_j:
            continue
        used_i.add(i); used_j.add(j); indices.append(i); labels.append(annotations[j][1])
    return np.array(indices), np.array(labels)


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    svm_pipeline = pickle.load(Path('artifacts/core-model/relative.pkl').open('rb'))
    scaler, svm = svm_pipeline.steps[0][1], svm_pipeline.steps[1][1]
    svm.decision_function_shape = 'ovo'
    train_records = []
    for record in json.loads(Path('artifacts/diversity/training.json').read_text()):
        if 'Improvisation' not in record['file']:
            continue
        assert 1 <= record['participant'] <= 14
        path = Path(record['path'])
        audio, rate = sf.read(path, dtype='float32', always_2d=True)
        audio = librosa.resample(audio.mean(1), orig_sr=rate, target_sr=16000)
        times = np.asarray(record['times'])
        banks = np.stack([fbank(crop(audio, t, times[i+1] if i+1 < len(times) else len(audio)/16000))
                          for i, t in enumerate(times)]).astype(np.float32)
        z = scaler.transform(relative_features(banks))
        margins = svm.decision_function(z)
        groups = AgglomerativeClustering(n_clusters=min(8, len(times)), linkage='ward').fit_predict(z)
        # Read labels only after inference boundaries, features and groups exist.
        annotations = []
        with path.with_suffix('.csv').open() as handle:
            for row in csv.reader(handle):
                if len(row) >= 2 and row[1].strip() in MAP:
                    annotations.append((float(row[0]), MAP[row[1].strip()]))
        indices, labels = match(times, annotations)
        train_records.append({'file': record['file'], 'groups': groups, 'indices': indices, 'labels': labels,
                              'descriptors': descriptors(times, margins, groups)})
    validation = []
    source = json.loads(Path('artifacts/typesafe-validation/report.json').read_text())
    for record in source['recordings']:
        assert 15 <= record['participant'] <= 20
        fixture = json.loads((Path('artifacts/relative-consistency/parity/validation')/record['file'].replace('.wav', '.json')).read_text())
        groups = np.asarray(fixture['groups'])
        validation.append({'file': record['file'], 'mode': record['mode'], 'groups': groups,
                           'indices': np.array([m['hit'] for m in record['matches']]),
                           'labels': np.array([MAP[m['expected']] for m in record['matches']]),
                           'reference': record['reference'], 'detected': len(groups),
                           'baseline': np.asarray(fixture['pooledLabels']),
                           'descriptors': descriptors(np.array(fixture['times']), np.array(fixture['margins']), groups)})

    def evaluate(model=None, view=None):
        scores = []
        for mode in ['all', 'Fixed', 'Personal']:
            correct = count = detected = reference = 0
            per_class = np.zeros((3, 2), dtype=int)
            for record in validation:
                if mode != 'all' and record['mode'] != mode:
                    continue
                if model is None:
                    predicted = record['baseline'][record['indices']]
                else:
                    features = np.array([record['descriptors'][int(record['groups'][i])][view] for i in record['indices']])
                    predicted = model.predict(features)
                truth = record['labels']
                correct += int(sum(predicted == truth)); count += len(truth)
                detected += record['detected']; reference += record['reference']
                for label in range(3):
                    per_class[label] += [sum(truth == label), sum((truth == label) & (predicted == truth))]
            scores.append({'mode': mode, 'correct': correct, 'matched': count, 'accuracy': correct/count,
                           'detected': detected, 'reference': reference, 'jointF1': 2*correct/(detected+reference),
                           'perClassTotalCorrect': per_class.tolist()})
        return scores

    baseline = evaluate()
    assert baseline[0]['correct'] == 635 and baseline[0]['matched'] == 672
    trials, selected = [], {}
    for view in ['acoustic', 'acousticRhythm']:
        x, y, weights = [], [], []
        for record in train_records:
            counts = {int(group): int(sum(record['groups'][record['indices']] == group)) for group in np.unique(record['groups'])}
            for index, label in zip(record['indices'], record['labels']):
                group = int(record['groups'][index])
                x.append(record['descriptors'][group][view]); y.append(label); weights.append(1/counts[group])
        best = None
        for c in [.1, 1., 10.]:
            head = make_pipeline(StandardScaler(), LogisticRegression(C=c, max_iter=2000, solver='lbfgs', random_state=731))
            head.fit(np.asarray(x), np.asarray(y), logisticregression__sample_weight=np.asarray(weights))
            scores = evaluate(head, view)
            item = {'view': view, 'C': c, 'scores': scores}
            trials.append(item)
            print(json.dumps(item), flush=True)
            if best is None or scores[0]['jointF1'] > best[0]:
                best = (scores[0]['jointF1'], head, item)
        selected[view] = best[2]
        with (ROOT/f'{view}-head.pkl').open('wb') as handle:
            pickle.dump(best[1], handle)
    report = {'scope': 'Train predicted AVP grooves1–14; validation15–20 only. No test/reserved/private data.',
              'classOrder': ['hat', 'kick', 'snare'], 'trainingRecordings': len(train_records),
              'trainingMatchedEvents': sum(len(r['labels']) for r in train_records),
              'groupTargets': 'Mixed-label distribution retained via repeated identical group descriptors with equal total group weight.',
              'acousticFeatures': 'Group mean/std/min/max of3 raw SVM OVO margins.',
              'rhythmFeatures': 'Group frequency; observed preceding/following IOI quantiles; same-group recurrence quantiles; adjacency; phase moments at2/4/8×median observed IOI. No reference tempo/downbeats.',
              'baseline': baseline, 'trials': trials, 'selected': selected,
              'limitation': 'Neural/SVM models already saw training voices; group-head training scores are not independent evidence. Validation-selected result only.'}
    (ROOT/'report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({'baseline': baseline, 'selected': selected}, indent=2), flush=True)


if __name__ == '__main__':
    main()
