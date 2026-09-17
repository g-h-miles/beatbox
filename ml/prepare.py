"""Build complete-event BEATs inputs from AVP annotations and actual app detections.

Training uses annotated events, including those missed by the onset detector.
Detection evaluation uses only detector-derived crop boundaries. Labels never
choose the evaluation crop. Audio is resampled with librosa's antialiasing filter.
"""
import json
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
import torch
import torchaudio.compliance.kaldi as kaldi

ROOT = Path('artifacts/ml-v2')
RATE = 16000
SAMPLES = 8000
CLASSES = ['hhc', 'hho', 'kd', 'sd']
torch.set_num_threads(4)


def crop(audio, start, end):
    # Include 10 ms of attack context; retain the sound after short energy dips.
    lo = max(0, round((start - .01) * RATE))
    hi = min(len(audio), round(end * RATE), lo + SAMPLES)
    result = np.zeros(SAMPLES, dtype=np.float32)
    fragment = audio[lo:hi].copy()
    if len(fragment):
        fragment -= fragment.mean()
        fragment *= .8 / max(float(np.max(np.abs(fragment))), .0001)
        result[:len(fragment)] = fragment
    return result


def fbank(audio):
    bank = kaldi.fbank(torch.from_numpy(audio)[None] * 32768,
                       num_mel_bins=128, sample_frequency=RATE,
                       frame_length=25, frame_shift=10)
    return ((bank.numpy() - 15.41663) / (2 * 6.55582)).astype(np.float16)


def main():
    ROOT.mkdir(exist_ok=True)
    records = json.loads(Path('artifacts/events-v2.json').read_text())
    metadata, banks = [], []
    for n, record in enumerate(records):
        audio, rate = sf.read(record['path'], dtype='float32', always_2d=True)
        audio = librosa.resample(audio.mean(axis=1), orig_sr=rate, target_sr=RATE)
        annotations = record['annotations']
        used = set()
        for kind in ['annotation', 'detection']:
            events = annotations if kind == 'annotation' else record['detections']
            for i, event in enumerate(events):
                label = event.get('label')
                error = None
                if kind == 'detection':
                    candidates = [(abs(a['time'] - event['time']), j) for j, a in enumerate(annotations)
                                  if j not in used and a['label'] in CLASSES]
                    distance, closest = min(candidates, default=(float('inf'), -1))
                    label = None
                    if distance < .05:
                        used.add(closest)
                        label = annotations[closest]['label']
                        error = event['time'] - annotations[closest]['time']
                elif label not in CLASSES:
                    continue
                end = events[i + 1]['time'] if i + 1 < len(events) else len(audio) / RATE
                metadata.append({
                    'kind': kind, 'file': record['file'], 'path': record['path'],
                    'participant': record['participant'], 'mode': record['mode'],
                    'groove': 'Improvisation' in record['file'], 'time': event['time'],
                    'label': label, 'errorSeconds': error,
                })
                banks.append(fbank(crop(audio, event['time'], end)))
        if n % 20 == 0:
            print(f'Prepared {n + 1}/{len(records)} recordings; {len(banks)} events', flush=True)
    np.save(ROOT / 'fbanks.npy', np.stack(banks))
    (ROOT / 'events.json').write_text(json.dumps(metadata))
    print(f'Saved {len(metadata)} events with {len(banks[0])} frames each.', flush=True)


if __name__ == '__main__':
    main()
