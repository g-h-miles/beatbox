"""Small-data audio descriptors retaining attack, spectrum, and decay."""
import librosa
import numpy as np
from scipy.ndimage import uniform_filter1d


def describe(audio, rate):
    audio = np.asarray(audio, dtype=np.float32)
    envelope = np.sqrt(np.maximum(0, uniform_filter1d(audio * audio, max(1, round(rate * .003)))))
    active = np.flatnonzero(envelope > envelope.max() * .12)
    if len(active):
        audio = audio[max(0, active[0] - round(rate * .004)):min(len(audio), active[-1] + round(rate * .025))]
    audio = audio / max(float(np.max(np.abs(audio))), 1e-5)
    duration = len(audio) / rate
    audio = np.pad(audio, (0, max(0, 512 - len(audio))))
    mel = librosa.feature.melspectrogram(y=audio, sr=rate, n_fft=512, hop_length=110, n_mels=40, fmin=40)
    db = librosa.power_to_db(mel, ref=np.max, top_db=60)
    # Attack/whole/decay remain separate, but duration does not create a large
    # block of trailing silence in every descriptor.
    n = db.shape[1]
    chunks = [db[:, :max(1, min(n, 10))], db, db[:, max(0, n//2):]]
    shape = np.concatenate([np.r_[p.mean(1), p.std(1)] for p in chunks])
    mfcc = librosa.feature.mfcc(S=db, n_mfcc=20)
    timbre = np.r_[mfcc.mean(1), mfcc.std(1), np.quantile(mfcc, [.1,.5,.9], axis=1).ravel()]
    power = mel.sum(0); cumulative = np.cumsum(power) / max(power.sum(), 1e-9)
    decay = np.array([np.searchsorted(cumulative,q) * .005 for q in [.1,.25,.5,.75,.9]])
    envelope_shape = np.interp(np.linspace(0, 1, 24), np.linspace(0, 1, len(power)), power / max(power.max(), 1e-9))
    return {'spectral': np.r_[shape, np.log1p(duration * 100), np.log1p(decay * 100)],
            'mfcc': np.r_[timbre, np.log1p(duration * 100), np.log1p(decay * 100)],
            'envelope': np.r_[np.log1p(duration * 100), np.log1p(decay * 100), envelope_shape]}
