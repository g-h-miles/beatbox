"""Post-selection diagnostic: reference crops versus detector crops by style.

This uses labels for diagnosis only; it neither trains nor selects a model.
Reference-boundary classification is not end-to-end transcription accuracy.
"""
import json
import pickle
from collections import Counter, defaultdict
from pathlib import Path
import numpy as np

root = Path('artifacts/core-model')
metadata = json.loads(Path('artifacts/ml-v2/events.json').read_text())
features = np.load(root / 'features.npy')
model = pickle.load((root / 'baseline.pkl').open('rb'))
mapping = {'hhc': 0, 'hho': 0, 'kd': 1, 'sd': 2}
results = []
for kind in ['annotation', 'detection']:
    for mode in ['Fixed', 'Personal']:
        indices = [i for i, event in enumerate(metadata)
                   if event['participant'] >= 21 and event['kind'] == kind
                   and event['mode'] == mode and event['groove']
                   and event['label'] in mapping]
        labels = np.array([mapping[metadata[i]['label']] for i in indices])
        predicted = model.predict(features[indices])
        results.append({'boundaries': kind, 'mode': mode, 'events': len(indices),
                        'correct': int(np.sum(predicted == labels)),
                        'classification': float(np.mean(predicted == labels))})
records = json.loads(Path('artifacts/events-v2-phonemes.json').read_text())
syllables = defaultdict(Counter)
for record in records:
    for event in record['annotations']:
        if 'phonemes' in event and event['label'] in mapping:
            syllables[event['phonemes']['syllable']][mapping[event['label']]] += 1
count = sum(sum(v.values()) for v in syllables.values())
correct = sum(max(v.values()) for v in syllables.values())
report = {
    'cropDiagnostic': results,
    'phoneticTrainingAudit': {
        'events': count, 'globalMajoritySyllableMappingCorrect': correct,
        'globalMajoritySyllableMappingAccuracy': correct / count,
        'warning': 'Not an acoustic accuracy ceiling: subtle timbre and context can distinguish identical phonetic transcriptions.',
        'ambiguousSyllables': {k: dict(v) for k, v in syllables.items() if len(v) > 1}
    },
    'classOrder': ['hat', 'kick', 'snare'],
    'selection': 'Diagnostic only, after validation-based model selection; held-out cohort was inspected in prior research.'
}
(root / 'diagnostic-report.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
