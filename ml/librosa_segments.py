"""Librosa silence regions for spaced calibration recordings, not dense grooves."""
import librosa
import numpy as np


def segment_calibration(audio, rate):
    audio = np.asarray(audio, dtype=np.float32)
    if not len(audio) or np.max(np.abs(audio)) < 1e-5:
        return []
    regions = librosa.effects.split(audio, top_db=30, frame_length=512, hop_length=110)
    merged = []
    for start, end in regions:
        if merged and start - merged[-1][1] < rate * .12:
            merged[-1][1] = int(end)
        else:
            merged.append([int(start), int(end)])
    return [{'start': start / rate, 'end': end / rate} for start, end in merged if end - start > rate * .035]
