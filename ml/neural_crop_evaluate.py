"""Frozen classical classifier with independently predicted neural crop boundaries.

No fitting, threshold selection, or ground-truth-dependent crop selection occurs.
Compare old/new onset pipelines on the same previously inspected AVP cohorts.
"""
import argparse
import json
import pickle
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
import torch
from scipy.fft import dct
from scipy.signal import find_peaks
from sklearn.metrics import confusion_matrix

from prepare import crop, fbank
from train_transcriber import Transcriber, DT, RATE, HOP, summarize

ROOT = Path('artifacts/neural-crop')
MAPPING = {'hhc': 0, 'hho': 0, 'kd': 1, 'sd': 2}


def features(banks, relative=False):
    parts = []
    if relative:
        for lo, hi in [(0, 2), (2, 10), (10, 25), (0, 10)]:
            z = banks[:, lo:hi]
            a = z.mean(1)
            parts.extend([a - a.mean(1, keepdims=True), z.std(1), dct(a, type=2, norm='ortho')[:, 1:21]])
        x = np.concatenate(parts, axis=1)
        # All detections, including extras, participate; no calibration labels.
        return (x - np.median(x, axis=0)) / (np.std(x, axis=0) + .1)
    for lo, hi in [(0, 3), (0, 8), (3, 12), (8, 24), (0, 48)]:
        z = banks[:, lo:hi]
        parts += [z.mean(1), z.std(1), dct(z.mean(1), type=2, norm='ortho')[:, :24]]
    return np.concatenate(parts, axis=1)


@torch.no_grad()
def onsets(audio, model, threshold):
    mel = librosa.feature.melspectrogram(y=audio, sr=RATE, n_fft=512,
                                        hop_length=HOP, n_mels=64, fmin=40)
    x = ((librosa.power_to_db(mel, ref=np.max, top_db=80) + 40) / 20).astype(np.float32)
    padded = np.pad(x, ((0, 0), (96, 96)), constant_values=-2)
    parts = []
    for start in range(0, x.shape[1], 800):
        stop = min(start + 800, x.shape[1])
        logits, _ = model(torch.from_numpy(padded[:, start:stop + 192][None]).to('mps'))
        parts.append(logits.sigmoid()[0, 96:-96].cpu().numpy())
    peaks, _ = find_peaks(np.concatenate(parts), height=threshold, distance=8, prominence=.05)
    return peaks * DT


def match(record, times, predicted):
    truth = [a for a in record['annotations'] if a['label'] in MAPPING]
    pairs = sorted((abs(t - a['time']), i, j) for i, t in enumerate(times)
                   for j, a in enumerate(truth) if abs(t - a['time']) < .05)
    used_p, used_t, correct, errors = set(), set(), 0, []
    labels, guesses = [], []
    for distance, i, j in pairs:
        if i in used_p or j in used_t:
            continue
        used_p.add(i); used_t.add(j); errors.append(distance)
        actual = MAPPING[truth[j]['label']]
        correct += int(predicted[i]) == actual
        labels.append(actual); guesses.append(int(predicted[i]))
    return np.array([len(times), len(truth), len(used_p), correct, sum(errors)], dtype=float), labels, guesses


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--classifier', choices=['baseline', 'relative'], default='baseline')
    args = parser.parse_args()
    ROOT.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(4)
    checkpoint = torch.load('artifacts/ml-v2/transcriber.pt', map_location='cpu', weights_only=True)
    onset_model = Transcriber().to('mps').eval()
    onset_model.load_state_dict(checkpoint['state'])
    classifier_path = Path(f'artifacts/core-model/{args.classifier}.pkl')
    classifier = pickle.load(classifier_path.open('rb'))
    if args.classifier == 'relative':
        selected = json.loads(Path('artifacts/core-model/relative-report.json').read_text())['selected']
        assert selected['view'] == 'standardized', 'This ablation implements the selected standardized representation.'
    records = [r for r in json.loads(Path('artifacts/events-v2.json').read_text())
               if r['participant'] >= 15 and 'Improvisation' in r['file']]
    results = []
    for index, record in enumerate(records):
        audio, rate = sf.read(record['path'], dtype='float32', always_2d=True)
        audio = audio.mean(1)
        onset_audio = librosa.resample(audio, orig_sr=rate, target_sr=RATE)
        class_audio = librosa.resample(audio, orig_sr=rate, target_sr=16000)
        neural = onsets(onset_audio, onset_model, checkpoint['threshold'])
        for pipeline, times in [('oldRMS', np.array([e['time'] for e in record['detections']])),
                                ('neural', neural)]:
            banks = np.stack([fbank(crop(class_audio, start, times[i + 1] if i + 1 < len(times) else len(class_audio) / 16000))
                              for i, start in enumerate(times)]).astype(np.float32)
            predicted = classifier.predict(features(banks, relative=args.classifier == 'relative'))
            counts, labels, guesses = match(record, times, predicted)
            results.append({'file': record['file'], 'participant': record['participant'], 'mode': record['mode'],
                            'pipeline': pipeline, 'split': 'validation' if record['participant'] <= 20 else 'test',
                            'counts': counts.tolist(), 'labels': labels, 'guesses': guesses,
                            'events': [{'time': float(t), 'class': int(c)} for t, c in zip(times, predicted)]})
        print(f"{index + 1}/{len(records)} {record['file']}", flush=True)
    summaries = []
    for split in ['validation', 'test']:
        for mode in ['all', 'Fixed', 'Personal']:
            for pipeline in ['oldRMS', 'neural']:
                group = [r for r in results if r['split'] == split and r['pipeline'] == pipeline
                         and (mode == 'all' or r['mode'] == mode)]
                count = np.sum([r['counts'] for r in group], axis=0)
                labels = sum((r['labels'] for r in group), [])
                guesses = sum((r['guesses'] for r in group), [])
                summaries.append({'split': split, 'mode': mode, 'pipeline': pipeline, **summarize(count),
                                  'confusion': confusion_matrix(labels, guesses, labels=[0, 1, 2]).tolist()})
    report = {'classifier': str(classifier_path) + ' (frozen; no refit)',
              'onsetCheckpoint': 'artifacts/ml-v2/transcriber.pt', 'onsetThreshold': checkpoint['threshold'],
              'classes': ['hat', 'kick', 'snare'], 'summaries': summaries, 'recordings': results,
              'limitations': ['Previously inspected AVP participants, not a new unseen test.',
                              'Hat classes are merged; ride, crash, auxiliary, and spoken phrases untested.',
                              'No thresholds or models selected in this ablation; crops depend only on predicted boundaries.']}
    (ROOT / ('report.json' if args.classifier == 'baseline' else 'relative-report.json')).write_text(json.dumps(report, indent=2))
    print(json.dumps(summaries, indent=2), flush=True)


if __name__ == '__main__':
    main()
