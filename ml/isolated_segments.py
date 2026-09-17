"""Energy-supported segmentation for spaced, single-class calibration takes.

This is deliberately not a groove detector: continuous/overlapping sounds need
an onset model. Thresholds are label-independent and preserve quiet recordings
by using their own noise floor and peak energy, rather than an absolute gate.
"""
import numpy as np
from scipy.ndimage import uniform_filter1d


def segment_isolated(audio, rate, minimum_relative_peak=.15):
    audio = np.asarray(audio, dtype=np.float64)
    if not len(audio) or np.max(np.abs(audio)) < 1e-5:
        return []
    # 5 ms RMS; low quantile captures room noise in spaced calibration takes.
    envelope = np.sqrt(np.maximum(0, uniform_filter1d(audio * audio, max(1, round(rate * .005)))))
    floor = float(np.quantile(envelope, .2))
    threshold = max(floor * 8, float(envelope.max()) * .035, 1e-5)
    active = envelope > threshold
    changes = np.diff(np.r_[False, active, False].astype(int))
    spans = list(zip(np.flatnonzero(changes == 1), np.flatnonzero(changes == -1)))
    merged = []
    for start, end in spans:
        if merged and start - merged[-1][1] < rate * .10:
            merged[-1][1] = int(end)
        else:
            merged.append([int(start), int(end)])
    results = []
    for start, end in merged:
        if end - start < rate * .012:
            continue
        if envelope[start:end].max() < envelope.max() * minimum_relative_peak:
            continue
        # Backtrack to lower-energy attack, and preserve decay; do not crop at a
        # neural peak, which can occur inside a multi-stage mouth sound.
        lo, hi = start, end
        while lo > max(0, start - round(rate * .03)) and envelope[lo - 1] > threshold * .25:
            lo -= 1
        while hi < len(audio) and envelope[hi] > threshold * .25:
            hi += 1
        lo = max(0, lo - round(rate * .008))
        hi = min(len(audio), hi + round(rate * .025))
        results.append({'start': lo / rate, 'end': hi / rate,
                        'peakRms': float(envelope[start:end].max())})
    return results
