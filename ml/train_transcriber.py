"""Joint beatbox onset detection and classification on librosa spectrograms.

Fully convolutional temporal model. No grid, BPM, or quantization is involved.
Whole performers are kept separate. Score complete recordings, including extra
and missing notes, not just preselected correctly detected events.
"""
import argparse
import json
import hashlib
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
import torch
from scipy.signal import find_peaks
from torch import nn

ROOT = Path('artifacts/ml-v2')
CLASSES = ['hhc', 'hho', 'kd', 'sd']
RATE, HOP, FRAMES = 22050, 110, 512
DT = HOP / RATE


class Residual(nn.Module):
    def __init__(self, channels, dilation):
        super().__init__()
        self.net = nn.Sequential(nn.Conv1d(channels, channels, 3, padding=dilation, dilation=dilation),
                                 nn.GroupNorm(8, channels), nn.GELU(), nn.Dropout(.15),
                                 nn.Conv1d(channels, channels, 1))

    def forward(self, x):
        return x + self.net(x)


class Transcriber(nn.Module):
    def __init__(self):
        super().__init__()
        self.spectral = nn.Sequential(
            nn.Conv2d(1, 16, 3, padding=1), nn.GroupNorm(4, 16), nn.GELU(), nn.MaxPool2d((2, 1)),
            nn.Conv2d(16, 32, 3, padding=1), nn.GroupNorm(8, 32), nn.GELU(), nn.MaxPool2d((2, 1)),
            nn.Conv2d(32, 32, 3, padding=1), nn.GroupNorm(8, 32), nn.GELU(), nn.MaxPool2d((2, 1)))
        self.temporal = nn.Sequential(nn.Conv1d(256, 96, 1),
                                      *[Residual(96, d) for d in (1, 2, 4, 8, 16, 32)])
        self.onset = nn.Conv1d(96, 1, 1)
        self.instrument = nn.Conv1d(96, len(CLASSES), 1)

    def forward(self, x):
        x = self.spectral(x[:, None])
        x = x.flatten(1, 2)
        x = self.temporal(x)
        return self.onset(x)[:, 0], self.instrument(x)


def prepare(records):
    signature = hashlib.sha256(json.dumps([r['path'] for r in records]).encode()).hexdigest()[:12]
    cache = ROOT / f'transcription-spectra-{signature}.npz'
    if cache.exists():
        with np.load(cache) as saved:
            return [saved[str(i)] for i in range(len(records))]
    spectra = []
    for i, record in enumerate(records):
        audio, rate = sf.read(record['path'], dtype='float32', always_2d=True)
        audio = librosa.resample(audio.mean(1), orig_sr=rate, target_sr=RATE)
        mel = librosa.feature.melspectrogram(y=audio, sr=RATE, n_fft=512,
                                            hop_length=HOP, n_mels=64, fmin=40)
        db = librosa.power_to_db(mel, ref=np.max, top_db=80)
        spectra.append(((db + 40) / 20).astype(np.float32))
    np.savez_compressed(cache, **{str(i): x for i, x in enumerate(spectra)})
    return spectra


def targets(record, length):
    onset = np.zeros(length, dtype=np.float32)
    instrument = np.zeros((len(CLASSES), length), dtype=np.float32)
    for event in record['annotations']:
        center = event['time'] / DT
        lo, hi = max(0, int(center) - 7), min(length, int(center) + 8)
        bump = np.exp(-.5 * ((np.arange(lo, hi) - center) / 1.5) ** 2)
        onset[lo:hi] = np.maximum(onset[lo:hi], bump)
        if event['label'] in CLASSES:
            k = CLASSES.index(event['label'])
            instrument[k, lo:hi] = np.maximum(instrument[k, lo:hi], bump)
    return onset, instrument


def match(record, peaks, classes):
    truth = [a for a in record['annotations'] if a['label'] in CLASSES]
    pairs = sorted((abs(p * DT - a['time']), i, j) for i, p in enumerate(peaks)
                   for j, a in enumerate(truth) if abs(p * DT - a['time']) < .05)
    used_p, used_t, correct, errors = set(), set(), 0, []
    for distance, i, j in pairs:
        if i in used_p or j in used_t:
            continue
        used_p.add(i); used_t.add(j); errors.append(distance)
        correct += CLASSES[classes[i]] == truth[j]['label']
    return np.array([len(peaks), len(truth), len(used_p), correct, sum(errors)], dtype=float)


def summarize(counts):
    detected, annotated, matched, correct, error = counts
    return {'detected': int(detected), 'annotated': int(annotated), 'matched': int(matched),
            'correct': int(correct), 'onsetF1': 2 * matched / max(1, detected + annotated),
            'classificationAccuracy': correct / max(1, matched),
            'endToEndF1': 2 * correct / max(1, detected + annotated),
            'meanTimingErrorMs': 1000 * error / max(1, matched)}


def main():
    global CLASSES
    parser = argparse.ArgumentParser()
    parser.add_argument('--epochs', type=int, default=40)
    parser.add_argument('--steps', type=int, default=80)
    parser.add_argument('--manifest', default='artifacts/events-v2.json')
    parser.add_argument('--name', default='transcriber')
    parser.add_argument('--classes', default='hhc,hho,kd,sd')
    parser.add_argument('--augment', action='store_true')
    args = parser.parse_args()
    CLASSES = args.classes.split(',')
    torch.manual_seed(42); np.random.seed(42); torch.set_num_threads(4)
    rng = np.random.default_rng(42)
    device = 'mps' if torch.backends.mps.is_available() else 'cpu'
    records = json.loads(Path(args.manifest).read_text())
    spectra = prepare(records)
    labels = [targets(r, x.shape[1]) for r, x in zip(records, spectra)]
    train = [i for i, r in enumerate(records) if r.get('split', 'train' if r['participant'] <= 14 else '') == 'train']
    grooves = [i for i in train if records[i].get('groove', 'Improvisation' in records[i]['file'])]
    val = [i for i, r in enumerate(records) if r.get('split', 'validation' if 15 <= r['participant'] <= 20 else '') == 'validation' and r.get('groove', 'Improvisation' in r['file'])]
    test = [i for i, r in enumerate(records) if r.get('split', 'test' if r['participant'] >= 21 else '') == 'test' and r.get('groove', 'Improvisation' in r['file'])]
    model = Transcriber().to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=3e-4, weight_decay=.02)
    history, best, stale = [], -1, 0
    checkpoint_path = ROOT / f'{args.name}.pt'

    @torch.no_grad()
    def predictions(indices):
        model.eval(); result = []
        for i in indices:
            x = spectra[i]
            # Chunks keep inference memory bounded. Discard contextual overlap.
            onset_parts, class_parts = [], []
            padded = np.pad(x, ((0, 0), (96, 96)), constant_values=-2)
            for offset in range(0, x.shape[1], 800):
                stop = min(offset + 800, x.shape[1])
                bank = torch.from_numpy(padded[:, offset:stop + 192][None]).to(device)
                onset, instrument = model(bank)
                onset_parts.append(onset.sigmoid()[0, 96:-96].cpu().numpy())
                class_parts.append(instrument[0, :, 96:-96].cpu().numpy())
            result.append((i, np.concatenate(onset_parts), np.concatenate(class_parts, axis=1)))
        return result

    def score(outputs, threshold):
        count = np.zeros(5)
        ignored_predictions = ignored_annotations = 0
        all_onsets = np.zeros(5)
        for i, onset, instrument in outputs:
            peaks, _ = find_peaks(onset, height=threshold, distance=8, prominence=.05)
            annotations = records[i]['annotations']
            all_onsets += match({'annotations': [{'time': a['time'], 'label': CLASSES[0]} for a in annotations]}, peaks, np.zeros(len(peaks), dtype=int))
            known = [a['time'] for a in annotations if a['label'] in CLASSES]
            unknown = [a['time'] for a in annotations if a['label'] not in CLASSES]
            ignored_annotations += len(unknown)
            keep = [not any(abs(peak * DT - t) < .05 for t in unknown) or any(abs(peak * DT - t) < .05 for t in known) for peak in peaks]
            ignored_predictions += len(peaks) - sum(keep)
            peaks = peaks[np.asarray(keep, dtype=bool)]
            count += match(records[i], peaks, instrument[:, peaks].argmax(0))
        return {**summarize(count), 'allAnnotationOnsetF1': summarize(all_onsets)['onsetF1'],
                'ignoredUncertainAnnotations': ignored_annotations, 'ignoredPredictionsAtUncertainEvents': ignored_predictions}

    for epoch in range(args.epochs):
        model.train(); losses = []
        for step in range(args.steps):
            banks, onsets, instruments = [], [], []
            for _ in range(16):
                i = int(rng.choice(grooves if rng.random() < .75 else train))
                length = spectra[i].shape[1]
                start = int(rng.integers(0, max(1, length - FRAMES)))
                bank = spectra[i][:, start:start + FRAMES]
                onset = labels[i][0][start:start + FRAMES]
                instrument = labels[i][1][:, start:start + FRAMES]
                pad = FRAMES - bank.shape[1]
                bank = np.pad(bank, ((0, 0), (0, pad)), constant_values=-2)
                onset = np.pad(onset, (0, pad))
                instrument = np.pad(instrument, ((0, 0), (0, pad)))
                banks.append(bank); onsets.append(onset); instruments.append(instrument)
            x = torch.from_numpy(np.stack(banks)).to(device)
            onset_target = torch.from_numpy(np.stack(onsets)).to(device)
            class_target = torch.from_numpy(np.stack(instruments)).to(device)
            if args.augment:
                scale = float(rng.uniform(.8, 1.2))
                length = round(FRAMES * scale)
                combined = torch.cat([x, onset_target[:, None], class_target], 1)
                combined = nn.functional.interpolate(combined, size=length, mode='linear', align_corners=False)
                if length >= FRAMES:
                    offset = int(rng.integers(0, length - FRAMES + 1)); combined = combined[:, :, offset:offset + FRAMES]
                else:
                    combined = nn.functional.pad(combined, (0, FRAMES - length))
                    combined[:, :64, length:] = -2
                x, onset_target, class_target = combined[:, :64], combined[:, 64], combined[:, 65:]
                shift = int(rng.integers(-3, 4))
                x = torch.roll(x, shift, 1)
                if shift > 0: x[:, :shift] = -2
                if shift < 0: x[:, shift:] = -2
            x += torch.randn((len(x), 1, 1), device=device) * .2
            x += torch.randn_like(x) * .04
            if rng.random() < .5:
                at = int(rng.integers(0, 58)); x[:, at:at + 6] = -2
            optimizer.zero_grad(set_to_none=True)
            onset, instrument = model(x)
            # Avoid learning from chunk edges lacking the full temporal context.
            sl = slice(64, -64)
            onset_loss = nn.functional.binary_cross_entropy_with_logits(
                onset[:, sl], onset_target[:, sl], pos_weight=torch.tensor(6., device=device))
            log_prob = instrument[:, :, sl].log_softmax(1)
            class_loss = -(class_target[:, :, sl] * log_prob).sum() / class_target[:, :, sl].sum().clamp(min=1)
            loss = onset_loss + class_loss
            loss.backward(); nn.utils.clip_grad_norm_(model.parameters(), 2); optimizer.step()
            losses.append(loss.item())
        output = predictions(val)
        trials = [(score(output, threshold), float(threshold)) for threshold in np.arange(.2, .81, .1)]
        metrics, threshold = max(trials, key=lambda trial: trial[0]['endToEndF1'])
        history.append({'epoch': epoch + 1, 'loss': float(np.mean(losses)), 'threshold': threshold, **metrics})
        print(json.dumps(history[-1]), flush=True)
        if metrics['endToEndF1'] > best:
            best, stale = metrics['endToEndF1'], 0
            torch.save({'state': {k: v.detach().cpu() for k, v in model.state_dict().items()},
                        'threshold': threshold}, checkpoint_path)
        else:
            stale += 1
        if stale >= 10:
            break
    saved = torch.load(checkpoint_path, map_location=device, weights_only=True)
    model.load_state_dict(saved['state'])
    report = {'manifest': args.manifest, 'augmentation': args.augment, 'classes': CLASSES, 'frameSeconds': DT, 'history': history, 'threshold': saved['threshold'],
              'validation': score(predictions(val), saved['threshold']),
              'previouslyInspectedTest': score(predictions(test), saved['threshold'])}
    (ROOT / f'{args.name}-report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({k: v for k, v in report.items() if k != 'history'}, indent=2), flush=True)


if __name__ == '__main__':
    main()
