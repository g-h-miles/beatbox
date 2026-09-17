"""Browser-preprocessed train-only SVMs; native validation selects C1/3/10.

Three/four-class targets are separate. Select grouped joint F1 per target,
smaller C ties; always report independent raw and fixed8Ward/full mean scores.
"""
import json
import pickle
from pathlib import Path
import numpy as np
from sklearn.cluster import AgglomerativeClustering
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.metrics import confusion_matrix
from four_relative_train import CORE, match_labels

OUT = Path('artifacts/browser-relative')

def vote(margins, count):
    votes = np.zeros((len(margins), count), dtype=int)
    col = 0
    for i in range(count):
        for j in range(i+1, count):
            votes[:, i] += margins[:, col] > 0
            votes[:, j] += margins[:, col] <= 0
            col += 1
    return votes.argmax(1)

def evaluate(model, sequences, classes, grouped):
    actual, guessed, details = [], [], []
    scaler, svm = model.steps[0][1], model.steps[1][1]
    svm.decision_function_shape = 'ovo'
    for row in sequences:
        z = scaler.transform(row['features'])
        margins = svm.decision_function(z)
        if grouped:
            groups = AgglomerativeClustering(n_clusters=min(8, len(z)), linkage='ward').fit_predict(z)
            for group in np.unique(groups):
                keep = groups == group
                margins[keep] = margins[keep].mean(0)
        p = vote(margins, classes)
        valid = row['labels'] >= 0
        truth = row['labels'][valid]
        if classes == 3: truth = CORE[truth]
        actual.extend(truth); guessed.extend(p[valid])
        details.append({'file': row['file'], 'mode': row['mode'], 'detected': len(p), 'reference': row['reference'],
                        'matched': len(truth), 'correct': int(sum(truth == p[valid])), 'predictions': p.tolist()})
    actual, guessed = np.array(actual), np.array(guessed)
    detected = sum(r['detected'] for r in details); reference = sum(r['reference'] for r in details)
    correct = int(sum(actual == guessed))
    core_correct = correct if classes == 3 else int(sum(CORE[actual] == CORE[guessed]))
    return {'correct': correct, 'coreCorrect': core_correct, 'matched': len(actual), 'detected': detected,
            'reference': reference, 'accuracy': correct/len(actual), 'coreAccuracy': core_correct/len(actual),
            'jointF1': 2*correct/(detected+reference), 'coreJointF1': 2*core_correct/(detected+reference),
            'confusion': confusion_matrix(actual, guessed, labels=list(range(classes))).tolist(), 'recordings': details}

def main():
    manifest = json.loads((OUT/'training-manifest.json').read_text())
    assert len(manifest['rows']) == 27 and all(1 <= r['participant'] <= 14 for r in manifest['rows'])
    x = np.concatenate([np.fromfile(OUT/f"{r['stem']}-features.f32", dtype='float32').reshape(-1,1104) for r in manifest['rows']])
    four_y = np.concatenate([r['labels'] for r in manifest['rows']])
    assert len(x) == len(four_y) == 1161
    records = {r['file']: r for r in json.loads(Path('artifacts/events-v2.json').read_text())}
    sequences = []
    for row in json.loads(Path('artifacts/four-relative/native-manifest.json').read_text())['rows']:
        record = records[row['file']]
        assert 15 <= record['participant'] <= 20
        label, count = match_labels(record, row['nativeTimes'])
        sequences.append({'file': row['file'], 'mode': record['mode'], 'labels': label, 'reference': count,
                          'features': np.fromfile(Path('artifacts/four-relative')/f"{row['stem']}-native.f32", dtype='float32').reshape(-1,1104)})
    report = {'protocol': 'Native browser preprocessing for public AVP1–14 annotated training grooves; native15–20 detected validation. C1/3/10 selected separately for3/4classes using grouped joint F1; fixed8Ward/full mean. No test/private/production changes.', 'trainingEvents': len(x), 'targets': []}
    for classes in [3,4]:
        y = CORE[four_y] if classes == 3 else four_y
        trials = []; best = None
        for c in [1,3,10]:
            model = make_pipeline(StandardScaler(), SVC(C=c, kernel='rbf', gamma='scale', decision_function_shape='ovo'))
            model.fit(x,y)
            raw = evaluate(model,sequences,classes,False); grouped = evaluate(model,sequences,classes,True)
            trial = {'C': c, 'raw': raw, 'grouped': grouped}; trials.append(trial)
            print(json.dumps({'classes': classes, 'C': c, 'raw': {k:v for k,v in raw.items() if k!='recordings'}, 'grouped': {k:v for k,v in grouped.items() if k!='recordings'}}), flush=True)
            if best is None or grouped['jointF1'] > best[0]: best = (grouped['jointF1'], c, model)
        pickle.dump(best[2], (OUT/f'browser-relative-{classes}.pkl').open('wb'))
        report['targets'].append({'classes': ['hat','kick','snare'] if classes==3 else ['hhc','hho','kd','sd'], 'selectedC': best[1], 'trials': trials})
        (OUT/'report.json').write_text(json.dumps(report,indent=2))

if __name__ == '__main__': main()
