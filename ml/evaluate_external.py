"""Evaluate the fixed neural model against both Beatboxset1 annotators.

This corpus was not used for fitting or checkpoint/threshold selection. Report
out-of-scope classes separately; do not relabel them as one of the four classes.
"""
import json
from pathlib import Path
import librosa
import numpy as np
import soundfile as sf
import torch
from scipy.signal import find_peaks
from train_transcriber import Transcriber, RATE, HOP, DT, ROOT, CLASSES, match, summarize

MAPPING = {'k': 'kd', 'hc': 'hhc', 'ho': 'hho', 'sb': 'sd', 'sk': 'sd', 's': 'sd'}

def main():
    torch.set_num_threads(4)
    model = Transcriber().to('mps')
    checkpoint = torch.load(ROOT / 'transcriber.pt', map_location='mps', weights_only=True)
    model.load_state_dict(checkpoint['state']); model.eval()
    records = json.loads(Path('artifacts/external-events-v2.json').read_text())
    counts = {a: np.zeros(5) for a in ['DR', 'HT']}
    onset_counts = {a: np.zeros(5) for a in ['DR', 'HT']}
    details = []
    with torch.no_grad():
        for record in records:
            audio, rate = sf.read(record['path'], dtype='float32', always_2d=True)
            audio = librosa.resample(audio.mean(1), orig_sr=rate, target_sr=RATE)
            mel = librosa.feature.melspectrogram(y=audio, sr=RATE, n_fft=512, hop_length=HOP, n_mels=64, fmin=40)
            x = ((librosa.power_to_db(mel, ref=np.max, top_db=80) + 40) / 20).astype(np.float32)
            padded = np.pad(x, ((0, 0), (96, 96)), constant_values=-2)
            onsets, classes = [], []
            for offset in range(0, x.shape[1], 800):
                end = min(offset + 800, x.shape[1])
                bank = torch.from_numpy(padded[:, offset:end + 192][None]).to('mps')
                onset, instrument = model(bank)
                onsets.append(onset.sigmoid()[0, 96:-96].cpu().numpy())
                classes.append(instrument[0, :, 96:-96].cpu().numpy())
            onset, instrument = np.concatenate(onsets), np.concatenate(classes, 1)
            peaks, _ = find_peaks(onset, height=checkpoint['threshold'], distance=8, prominence=.05)
            predictions = instrument[:, peaks].argmax(0)
            item = {'file': record['file'], 'detected': len(peaks), 'annotators': {}}
            for annotator, annotations in record['annotations'].items():
                mapped = [{'time': a['time'], 'label': MAPPING.get(a['label'])} for a in annotations]
                # Full onset score includes breath, voice and other annotated events.
                all_events = [{'time': a['time'], 'label': 'kd'} for a in annotations]
                onset_counts[annotator] += match({'annotations': all_events}, peaks, np.zeros(len(peaks), dtype=int))
                count = match({'annotations': mapped}, peaks, predictions)
                counts[annotator] += count
                item['annotators'][annotator] = {**summarize(count), 'outOfScopeAnnotations': sum(a['label'] not in MAPPING for a in annotations)}
            details.append(item)
    report = {'dataset': 'Beatboxset1, CC BY-SA 3.0', 'selection': 'Fixed AVP validation checkpoint/threshold; no fitting on this corpus',
              'fourClass': {a: summarize(c) for a, c in counts.items()},
              'allAnnotatedOnsets': {a: summarize(c) for a, c in onset_counts.items()}, 'files': details}
    # Labels in the all-onset proxy are placeholders, so suppress its class metrics.
    for result in report['allAnnotatedOnsets'].values():
        for key in ['correct', 'classificationAccuracy', 'endToEndF1']: result.pop(key)
    (ROOT / 'external-report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({k: v for k, v in report.items() if k != 'files'}, indent=2), flush=True)

if __name__ == '__main__': main()
