"""Evaluate genuine voice setup: isolated examples -> separate improvisations."""
import json
from pathlib import Path

import numpy as np
import torch
from scipy.signal import find_peaks
from scipy.spatial.distance import cdist
from sklearn.metrics import accuracy_score
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from train_transcriber import Transcriber, prepare, ROOT, CLASSES, DT


def extract():
    records = json.loads(Path('artifacts/events-v2.json').read_text())
    spectra = prepare(records)
    model = Transcriber().to('mps')
    checkpoint = torch.load(ROOT / 'transcriber.pt', map_location='mps', weights_only=True)
    model.load_state_dict(checkpoint['state']); model.eval()
    rows, vectors = [], []
    with torch.no_grad():
        for i, (record, x) in enumerate(zip(records, spectra)):
            padded = np.pad(x, ((0, 0), (96, 96)), constant_values=-2)
            all_spectral, all_temporal, all_onset = [], [], []
            for offset in range(0, x.shape[1], 800):
                stop = min(offset + 800, x.shape[1])
                bank = torch.from_numpy(padded[:, offset:stop + 192][None]).to('mps')
                spectral = model.spectral(bank[:, None]).flatten(1, 2)
                temporal = model.temporal(spectral)
                all_spectral.append(spectral[0, :, 96:-96].cpu().numpy())
                all_temporal.append(temporal[0, :, 96:-96].cpu().numpy())
                all_onset.append(model.onset(temporal)[0, 0, 96:-96].sigmoid().cpu().numpy())
            embedding = np.concatenate([np.concatenate(all_spectral, 1), np.concatenate(all_temporal, 1)], 0)
            onset = np.concatenate(all_onset)
            groove = 'Improvisation' in record['file']
            if groove:
                peaks, _ = find_peaks(onset, height=checkpoint['threshold'], distance=8, prominence=.05)
                events = [{'time': peak * DT} for peak in peaks]
            else:
                events = record['annotations']
            used = set()
            for event in events:
                label = event.get('label'); error = None
                if groove:
                    candidates = [(abs(event['time'] - a['time']), j) for j, a in enumerate(record['annotations']) if j not in used and a['label'] in CLASSES]
                    delta, j = min(candidates, default=(float('inf'), -1))
                    label = None
                    if delta < .05:
                        used.add(j); label = record['annotations'][j]['label']; error = delta
                if label not in CLASSES:
                    continue
                frame = min(embedding.shape[1] - 1, round(event['time'] / DT))
                vector = embedding[:, max(0, frame - 1):frame + 2].mean(1)
                rows.append({'participant': record['participant'], 'mode': record['mode'],
                             'file': record['file'], 'groove': groove, 'time': event['time'],
                             'label': label, 'errorSeconds': error})
                vectors.append(vector)
            if i % 40 == 0: print('embedded', i, flush=True)
    np.save(ROOT / 'voice-embeddings.npy', np.stack(vectors))
    (ROOT / 'voice-events.json').write_text(json.dumps(rows))


def main():
    torch.set_num_threads(4)
    if not (ROOT / 'voice-embeddings.npy').exists(): extract()
    rows = json.loads((ROOT / 'voice-events.json').read_text())
    X = np.load(ROOT / 'voice-embeddings.npy')
    labels = np.array([r['label'] for r in rows]); people = np.array([r['participant'] for r in rows])
    grooves = np.array([r['groove'] for r in rows]); modes = np.array([r['mode'] for r in rows])
    results = []
    for features, lo, hi in [('spectral', 0, 256), ('temporal', 256, 352), ('both', 0, 352)]:
        z = StandardScaler().fit(X[people <= 14, lo:hi]).transform(X[:, lo:hi])
        for count in [3, 5, 10]:
            for method in ['nearest', 'svc1', 'svc10', 'svc100']:
                for cohort, participants in [('validation', range(15, 21)), ('previouslyInspectedTest', range(21, 29))]:
                    truth, prediction = [], []; supplied = 0
                    for person in participants:
                        for mode in ['Fixed', 'Personal']:
                            mask = (people == person) & (modes == mode)
                            train = np.concatenate([np.flatnonzero(mask & ~grooves & (labels == label))[:count] for label in CLASSES])
                            test = np.flatnonzero(mask & grooves)
                            if not len(test) or len(set(labels[train])) < 2: continue
                            if method == 'nearest': model = KNeighborsClassifier(n_neighbors=1)
                            else: model = SVC(C=float(method[3:]), kernel='rbf', gamma='scale')
                            model.fit(z[train], labels[train]); prediction.extend(model.predict(z[test])); truth.extend(labels[test]); supplied += len(train)
                    result = {'features': features, 'examplesPerClass': count, 'method': method, 'cohort': cohort,
                              'correct': int(sum(np.array(truth) == prediction)), 'total': len(truth),
                              'accuracy': accuracy_score(truth, prediction), 'suppliedExamples': supplied}
                    results.append(result)
    best = max((r for r in results if r['cohort'] == 'validation'), key=lambda r: r['accuracy'])
    selected = [r for r in results if all(r[k] == best[k] for k in ['features', 'examplesPerClass', 'method'])]
    report = {'selection': 'validation participants 15–20 only', 'selected': selected, 'trials': results}
    (ROOT / 'voice-setup-report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(selected, indent=2), flush=True)


if __name__ == '__main__': main()
