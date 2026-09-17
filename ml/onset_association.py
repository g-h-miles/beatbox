"""Fixed same-event label association, with no annotation-dependent decisions.

Keep candidate onsets unchanged. Pair old/new detections one-to-one by smallest
time difference within four frames (half the frozen eight-frame peak distance).
Paired events inherit the old acoustic label; unpaired candidate events use the
candidate-crop acoustic label. No parameter fitting, grid, or time snapping.
"""
import json
from pathlib import Path
import numpy as np
from four_relative_train import match_labels, evaluate
from train_transcriber import DT

class StoredPredictions:
    def predict(self, x):
        return x.astype('int64')

def main():
    root = Path('artifacts/onset-only')
    scores = json.loads((root/'classification-report.json').read_text())
    old = {r['file']: r for r in scores['baseline']['recordings']}
    new = {r['file']: r for r in scores['candidate']['recordings']}
    old_times = {r['file']: r['nativeTimes'] for r in json.loads(Path('artifacts/four-relative/native-manifest.json').read_text())['rows']}
    manifest = json.loads((root/'native-manifest.json').read_text())['rows']
    records = {r['file']: r for r in json.loads(Path('artifacts/events-v2.json').read_text())}
    sequences, mappings = [], []
    for row in manifest:
        assert 15 <= row['participant'] <= 20
        filename = row['file']
        times, previous = row['times'], old_times[filename]
        pairs = sorted((abs(t-u), i, j) for i,t in enumerate(times) for j,u in enumerate(previous) if abs(t-u) <= 4*DT)
        used_new, used_old, inherited = set(), set(), []
        predictions = np.array(new[filename]['predictions'])
        for distance, i, j in pairs:
            if i in used_new or j in used_old:
                continue
            used_new.add(i)
            used_old.add(j)
            predictions[i] = old[filename]['predictions'][j]
            inherited.append({'candidateIndex': i, 'baselineIndex': j, 'distanceSeconds': distance})
        labels, count = match_labels(records[filename], times)
        sequences.append({'file': filename, 'mode': row['mode'], 'features': predictions, 'labels': labels, 'annotated': count})
        mappings.append({'file': filename, 'inherited': inherited, 'unpairedCandidate': len(times)-len(used_new)})
    report = {'protocol': __doc__, 'associationToleranceSeconds': 4*DT,
              'baseline': scores['baseline'], 'candidateCrops': scores['candidate'],
              'association': evaluate(StoredPredictions(), sequences), 'mappings': mappings,
              'limitations': 'Development-only pure acoustic comparison; requires two detector/classifier passes; no TypeSafe hybrid, browser integration, or independent test claim.'}
    (root/'association-report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({k:v for k,v in report['association'].items() if k!='recordings'}, indent=2))
    print('Inherited', sum(len(m['inherited']) for m in mappings), 'New', sum(m['unpairedCandidate'] for m in mappings))

if __name__ == '__main__':
    main()
