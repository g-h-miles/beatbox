"""Combine AVP and Beatboxset1 with explicit performer splits and conservative labels."""
import collections
import json
from pathlib import Path

MAPPING = {'k': 'kd', 'hc': 'hhc', 'ho': 'hho', 'sb': 'sd', 'sk': 'sd', 's': 'sd',
           'br': 'aux', 'm': 'aux', 'v': 'aux', 'x': 'aux'}
records = json.loads(Path('artifacts/events-v2.json').read_text())
for r in records:
    r['dataset'] = 'AVP'
    r['split'] = 'train' if r['participant'] <= 20 else 'validation' if r['participant'] <= 24 else 'test'
external = json.loads(Path('artifacts/external-events-v2.json').read_text())
for i, r in enumerate(sorted(external, key=lambda r: r['file'])):
    annotations = []
    used = set()
    for a in r['annotations']['DR']:
        candidates = [(abs(a['time'] - b['time']), j) for j, b in enumerate(r['annotations']['HT']) if j not in used]
        distance, j = min(candidates, default=(float('inf'), -1))
        label = '?'
        if distance < .05:
            used.add(j)
            first, second = MAPPING.get(a['label']), MAPPING.get(r['annotations']['HT'][j]['label'])
            if first == second and first is not None: label = first
        annotations.append({'time': a['time'], 'label': label})
    # Both annotators' unique onset observations remain positive detection targets.
    annotations.extend({'time': a['time'], 'label': '?'} for j, a in enumerate(r['annotations']['HT']) if j not in used)
    records.append({**r, 'annotations': sorted(annotations, key=lambda a: a['time']),
                    'dataset': 'Beatboxset1', 'mode': 'Personal', 'groove': True,
                    'participant': 101 + i, 'split': 'train' if i < 8 else 'validation' if i < 11 else 'test'})
Path('artifacts/expanded-events.json').write_text(json.dumps(records))
for split in ['train', 'validation', 'test']:
    subset = [r for r in records if r['split'] == split]
    print(split, len(subset), dict(collections.Counter(a['label'] for r in subset for a in r['annotations'])))
