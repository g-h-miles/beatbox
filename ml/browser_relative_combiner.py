"""Fixed candidate: three-class core vote plus four-class pooled hat margin.

No fit, thresholds, or parameter selection. Validation only in this script.
"""
import hashlib
import json
import pickle
from pathlib import Path
import numpy as np
from sklearn.cluster import AgglomerativeClustering
from four_relative_train import OUT as VAL, evaluate, match_labels
from browser_relative_train import OUT, vote


def pooled_margins(model, features):
    scaler, svm = model.steps[0][1], model.steps[1][1]
    svm.decision_function_shape = 'ovo'
    z = scaler.transform(features)
    margins = svm.decision_function(z)
    groups = AgglomerativeClustering(n_clusters=min(8,len(z)), linkage='ward').fit_predict(z)
    for group in np.unique(groups):
        keep = groups == group
        margins[keep] = margins[keep].mean(0)
    return margins


class Combined:
    def __init__(self, core, four):
        self.core, self.four = core, four

    def predict(self, features):
        core = vote(pooled_margins(self.core, features), 3)
        four = pooled_margins(self.four, features)
        # Four-class OVO column0 is closed-vs-open; positive favors closed.
        return np.where(core == 0, np.where(four[:,0] > 0, 0, 1), core + 1)


def main():
    selection = json.loads((OUT/'report.json').read_text())
    assert [r['selectedC'] for r in selection['targets']] == [10,1]
    models = [pickle.load((OUT/f'browser-relative-{k}.pkl').open('rb')) for k in [3,4]]
    records = {r['file']: r for r in json.loads(Path('artifacts/events-v2.json').read_text())}
    sequences = []
    for row in json.loads((VAL/'native-manifest.json').read_text())['rows']:
        record = records[row['file']]
        assert 15 <= record['participant'] <= 20
        labels, reference = match_labels(record,row['nativeTimes'])
        sequences.append({'file': row['file'], 'mode': record['mode'], 'labels': labels, 'annotated': reference,
                          'features': np.fromfile(VAL/f"{row['stem']}-native.f32", dtype='float32').reshape(-1,1104)})
    result = evaluate(Combined(*models), sequences)
    frozen = {'protocol': 'Core from browser-trained C10 three-class pooled votes. Hat subtype solely sign of browser-trained C1 four-class closed/open margin averaged over its own8Wardgroups; positive closed, else open. No threshold fitting or test access.',
              'models': {str(k): {'path': str(OUT/f'browser-relative-{k}.pkl'), 'sha256': hashlib.sha256((OUT/f'browser-relative-{k}.pkl').read_bytes()).hexdigest()} for k in [3,4]},
              'classes': ['hhc','hho','kd','sd'], 'validation': result}
    (OUT/'combiner-frozen.json').write_text(json.dumps(frozen,indent=2))
    print(json.dumps({k:v for k,v in result.items() if k!='recordings'},indent=2),flush=True)


if __name__ == '__main__': main()
