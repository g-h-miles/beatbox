"""Independent librosa/PyTorch references for browser preprocessing and inference."""
import json
from pathlib import Path
import librosa
import numpy as np
import soundfile as sf
import torch
from scipy.signal import find_peaks
from train_transcriber import Transcriber, ROOT, RATE, HOP

def spec(audio):
    mel = librosa.feature.melspectrogram(y=audio, sr=RATE, n_fft=512, hop_length=HOP, n_mels=64, fmin=40)
    return ((librosa.power_to_db(mel, ref=np.max, top_db=80) + 40) / 20).astype(np.float32)

torch.set_num_threads(4)
i = np.arange(4096, dtype=np.float64)
audio = ((.3 * np.sin(2 * np.pi * 440 * i / RATE) + .1 * np.sin(2 * np.pi * 4100 * i / RATE)) * np.exp(-i / 1300)).astype(np.float32)
audio[700] += .6
spectrum = spec(audio)
fixture = {'frames': spectrum.shape[1], 'values': [{'band': b, 'frame': t, 'value': float(spectrum[b, t])} for b in range(0, 64, 3) for t in [0, 1, 5, 17, 30, 37]]}
Path('tests/neural-spectrogram-fixture.json').write_text(json.dumps(fixture))
path = 'artifacts/avp-full/AVP_Dataset/Personal/Participant_8/P8_Improvisation_Personal.wav'
audio, rate = sf.read(path, dtype='float32', always_2d=True)
original = audio.mean(1)
original.tofile(ROOT / 'browser-original.f32')
(ROOT / 'browser-audio-info.json').write_text(json.dumps({'sampleRate': rate}))
audio = librosa.resample(original, orig_sr=rate, target_sr=RATE)
audio.tofile(ROOT / 'browser-audio.f32')
spectrum = spec(audio); padded = np.pad(spectrum, ((0, 0), (96, 96)), constant_values=-2)
model = Transcriber().eval(); saved = torch.load(ROOT / 'transcriber.pt', map_location='cpu', weights_only=True); model.load_state_dict(saved['state'])
onsets, instruments = [], []
with torch.no_grad():
    for offset in range(0, spectrum.shape[1], 800):
        end = min(offset + 800, spectrum.shape[1])
        onset, instrument = model(torch.from_numpy(padded[:, offset:end + 192][None]))
        onsets.append(onset.sigmoid()[0, 96:-96].numpy()); instruments.append(instrument[0, :, 96:-96].numpy())
onset, instrument = np.concatenate(onsets), np.concatenate(instruments, 1)
peaks, _ = find_peaks(onset, height=saved['threshold'], distance=8, prominence=.05)
labels = ['closed', 'open', 'kick', 'snare']
reference = [{'time': float(t * HOP / RATE), 'drum': labels[int(instrument[:, t].argmax())]} for t in peaks]
(ROOT / 'browser-reference.json').write_text(json.dumps(reference))
print('reference events', len(reference))
