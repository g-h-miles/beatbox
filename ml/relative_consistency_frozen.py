"""Evaluate the frozen validation-selected8-group margin pool; no tuning.

Reads only existing AVP validation/test cohorts and their exact cached boundaries.
Exports complete per-event grouping/margin fixtures for browser parity work.
"""
import json
import pickle
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics import confusion_matrix

from prepare import crop, fbank
from relative_consistency_validation import relative_features, vote

ROOT = Path('artifacts/relative-consistency')
CLASSES = ['hat', 'kick', 'snare']
THRESHOLD = 1.2873168143334053


def core(label):
    return 'hat' if label in ['closed', 'open'] else label


def diversity(spectra):
    if len(spectra) < 6:
        return 0.
    count = min(96, len(spectra))
    selected = np.asarray([spectra[int(i*len(spectra)/count)] for i in range(count)])
    distances = sorted(float(np.sqrt(np.mean((selected[i]-selected[j])**2)))
                       for i in range(count) for j in range(i+1, count))
    return distances[int((len(distances)-1)*.75)]


def combined(hit, prediction, gate):
    answer = hit['answer']
    if not gate or answer['drum'] in ['ride', 'crash', 'aux']:
        return answer['drum']
    if prediction != 0:
        return CLASSES[prediction]
    probabilities = answer['probabilities']
    return 'closed' if probabilities.get('closed', 0) >= probabilities.get('open', 0) else 'open'


def main():
    pipeline = pickle.load(Path('artifacts/core-model/relative.pkl').open('rb'))
    scaler, svm = pipeline.steps[0][1], pipeline.steps[1][1]
    svm.decision_function_shape = 'ovo'
    all_reports = {}
    for split, cache_root in [('validation', Path('artifacts/typesafe-validation')),
                              ('existingTest', Path('artifacts/typesafe-existing-test'))]:
        source = json.loads((cache_root/'report.json').read_text())
        recordings = []
        fixture_dir = ROOT/'parity'/split
        fixture_dir.mkdir(parents=True, exist_ok=True)
        for record in source['recordings']:
            person = record['participant']
            assert 15 <= person <= 20 if split == 'validation' else 21 <= person <= 28
            cached = json.loads((cache_root/record['file'].replace('.wav', '.json')).read_text())
            hits = cached['hits']
            times = np.array([hit['time'] for hit in hits])
            path = Path('artifacts/avp-full/AVP_Dataset')/record['mode']/f'Participant_{person}'/record['file']
            audio, rate = sf.read(path, dtype='float32', always_2d=True)
            audio = librosa.resample(audio.mean(1), orig_sr=rate, target_sr=16000)
            banks = np.stack([fbank(crop(audio, start, times[i+1] if i+1 < len(times) else len(audio)/16000))
                              for i, start in enumerate(times)]).astype(np.float32)
            z = scaler.transform(relative_features(banks))
            margins = svm.decision_function(z)
            baseline = svm.predict(z)
            assert np.array_equal(vote(margins), baseline)
            clusters = AgglomerativeClustering(n_clusters=min(8, len(z)), linkage='ward').fit_predict(z)
            pooled = margins.copy()
            for group in np.unique(clusters):
                pooled[clusters == group] = margins[clusters == group].mean(0)
            predictions = vote(pooled)
            value = diversity([h['features']['spectrum'] for h in hits])
            gate = value > THRESHOLD
            if 'gateEnabled' in record:
                assert gate == record['gateEnabled'], 'Gate parity failed'
            events = []
            for match in record['matches']:
                i = match['hit']; expected = match['expected']; hit = hits[i]
                events.append({'hit': i, 'time': hit['time'], 'expected': expected,
                               'typeSafe': hit['answer']['drum'],
                               'baselineRaw': CLASSES[baseline[i]], 'pooledRaw': CLASSES[predictions[i]],
                               'baselineHybrid': combined(hit, baseline[i], gate),
                               'pooledHybrid': combined(hit, predictions[i], gate)})
            fixtures = {'file': record['file'], 'classes': CLASSES, 'pairOrder': [[0, 1], [0, 2], [1, 2]],
                        'times': times.tolist(), 'standardizedFeatures': z.tolist(),
                        'margins': margins.tolist(), 'groups': clusters.tolist(), 'pooledMargins': pooled.tolist(),
                        'baselineLabels': baseline.tolist(), 'pooledLabels': predictions.tolist(),
                        'gateEnabled': gate, 'diversity': value,
                        'grouping': 'Ward Euclidean on standardized1104features; min(8,eventCount) groups; full mean raw OVO margins.'}
            (fixture_dir/record['file'].replace('.wav', '.json')).write_text(json.dumps(fixtures, separators=(',', ':')))
            recordings.append({'file': record['file'], 'participant': person, 'mode': record['mode'],
                               'detected': len(hits), 'reference': record['reference'], 'matched': len(events),
                               'gateEnabled': gate, 'diversity': value, 'events': events})
            print(f"Prepared {split} {record['file']}", flush=True)
        summaries = []
        for mode in ['all', 'Fixed', 'Personal']:
            selected = [r for r in recordings if mode == 'all' or r['mode'] == mode]
            events = [e for r in selected for e in r['events']]
            detected = sum(r['detected'] for r in selected)
            reference = sum(r['reference'] for r in selected)
            for name in ['typeSafe', 'baselineRaw', 'pooledRaw', 'baselineHybrid', 'pooledHybrid']:
                core_correct = sum(core(e['expected']) == core(e[name]) for e in events)
                four_correct = None if name.endswith('Raw') else sum(e['expected'] == e[name] for e in events)
                summaries.append({'mode': mode, 'pipeline': name, 'detected': detected, 'reference': reference,
                                  'matched': len(events), 'coreCorrect': core_correct,
                                  'coreAccuracy': core_correct/len(events), 'coreJointF1': 2*core_correct/(detected+reference),
                                  'fourCorrect': four_correct,
                                  'fourAccuracy': None if four_correct is None else four_correct/len(events),
                                  'fourJointF1': None if four_correct is None else 2*four_correct/(detected+reference),
                                  'perClass': [{'label': label, 'total': sum(e['expected'] == label for e in events),
                                                'correctCore': sum(e['expected'] == label and core(e[name]) == core(label) for e in events),
                                                'correctFour': None if name.endswith('Raw') else sum(e['expected'] == label and e[name] == label for e in events)}
                                               for label in ['closed', 'open', 'kick', 'snare']]})
        baseline_raw = next(s for s in summaries if s['mode']=='all' and s['pipeline']=='baselineRaw')
        baseline_hybrid = next(s for s in summaries if s['mode']=='all' and s['pipeline']=='baselineHybrid')
        assert baseline_raw['coreCorrect'] == (592 if split == 'validation' else 898)
        assert baseline_hybrid['coreCorrect'] == (582 if split == 'validation' else 848)
        all_reports[split] = {'summaries': summaries, 'recordings': recordings}
    report = {'frozenCandidate': {'wardClusters': 8, 'marginBlend': 1., 'gateThreshold': THRESHOLD},
              'scope': 'Validation-selected candidate evaluated once on previously inspected test21–28; no tuning or reserved/private access.',
              'featureParity': 'Exact frozen crop/fbank/recording-normalization/training-scaler and baseline vote parity asserted.',
              'limitation': 'No novel test corpus; no ride/crash/aux or spoken-phrase ground truth. Four-label hybrid still uses TypeSafe hat subtypes.',
              **all_reports}
    (ROOT/'frozen-report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(all_reports['existingTest']['summaries'], indent=2), flush=True)


if __name__ == '__main__':
    main()
