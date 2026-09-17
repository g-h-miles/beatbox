"""Audit frozen native validation timestamps; no fitting, tuning, or test access."""
import json
from pathlib import Path
import numpy as np

OUT = Path('artifacts/native-timing-audit')
CLASSES = ['hhc', 'hho', 'kd', 'sd']

def match(times, truth, tolerance):
    candidates = sorted((abs(t-a['time']), i, j)
                        for i, t in enumerate(times) for j, a in enumerate(truth)
                        if abs(t-a['time']) < tolerance)
    used_i, used_j, pairs = set(), set(), []
    for distance, i, j in candidates:
        if i not in used_i and j not in used_j:
            used_i.add(i)
            used_j.add(j)
            pairs.append((i, j))
    return pairs

def maximum_matches(times, truth, tolerance):
    """Maximum-cardinality ordered matching, independent of greedy tie choices."""
    actual = sorted(a['time'] for a in truth)
    previous = [0] * (len(actual) + 1)
    for time in sorted(times):
        current = [0] * (len(actual) + 1)
        for j, reference in enumerate(actual, 1):
            current[j] = max(previous[j], current[j-1],
                             previous[j-1] + int(abs(time-reference) < tolerance))
        previous = current
    return previous[-1]

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    records = {r['file']: r for r in json.loads(Path('artifacts/events-v2.json').read_text())}
    native = json.loads(Path('artifacts/four-relative/native-manifest.json').read_text())['rows']
    totals = {ms: {'matched': 0, 'maximumCardinalityMatched': 0, 'detected': 0, 'reference': 0} for ms in [5, 10, 20, 50]}
    residuals, rows = [], []
    for row in native:
        record = records[row['file']]
        assert 15 <= record['participant'] <= 20
        truth = [a for a in record['annotations'] if a['label'] in CLASSES]
        times = row['nativeTimes']
        for ms, total in totals.items():
            pairs = match(times, truth, ms / 1000)
            total['matched'] += len(pairs)
            total['maximumCardinalityMatched'] += maximum_matches(times, truth, ms / 1000)
            total['detected'] += len(times)
            total['reference'] += len(truth)
        pairs = match(times, truth, .05)
        used_i, used_j = {i for i, _ in pairs}, {j for _, j in pairs}
        residuals.extend((times[i]-truth[j]['time'])*1000 for i,j in pairs)
        extras = [{'time': t, 'nearestDetectionMs': min((abs(t-u)*1000 for k,u in enumerate(times) if k!=i), default=None),
                   'nearestReferenceMs': min(abs(t-a['time'])*1000 for a in truth)}
                  for i,t in enumerate(times) if i not in used_i]
        misses = [{'time': a['time'], 'label': a['label'],
                   'nearestDetectionMs': min(abs(t-a['time'])*1000 for t in times)}
                  for j,a in enumerate(truth) if j not in used_j]
        rows.append({'file': row['file'], 'extras': extras, 'misses': misses})
    for total in totals.values():
        total['onsetF1'] = 2*total['matched']/(total['detected']+total['reference'])
    errors = np.array(residuals)
    report = {'protocol': __doc__, 'tolerancesMs': totals,
              'matched50msResiduals': {'medianSignedMs': float(np.median(errors)),
              'medianAbsoluteMs': float(np.median(abs(errors))),
              'p95AbsoluteMs': float(np.quantile(abs(errors), .95))},
              'missedClasses': {c: sum(a['label']==c for r in rows for a in r['misses']) for c in CLASSES},
              'extraWithin100msOfAnotherDetection': sum(a['nearestDetectionMs'] < 100 for r in rows for a in r['extras']),
              'recordings': rows,
              'limitations': 'Previously used AVP validation, not independent evidence; greedy one-to-one matching identical to earlier reports; reference annotation precision not independently audited. No changes to timestamps.'}
    (OUT/'report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({k:v for k,v in report.items() if k!='recordings'}, indent=2))

if __name__ == '__main__':
    main()
