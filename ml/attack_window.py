"""Keep the main acoustic attack inside the classifier's fixed-size window.

This chooses classifier input only. It must never rewrite MIDI timestamps.
"""
import numpy as np
from scipy.ndimage import uniform_filter1d


def attack_window(audio, rate, seconds=.5):
    audio=np.asarray(audio,dtype=np.float32)
    if not len(audio):return audio
    rms=np.sqrt(np.maximum(0,uniform_filter1d(audio.astype(np.float64)**2,max(1,round(rate*.008)))))
    peak=int(np.argmax(rms))
    # Backtrack through the contiguous body of the strongest sound. A long,
    # quiet lead-in must not consume the classifier's entire half-second.
    start=peak
    while start>0 and rms[start-1]>rms[peak]*.12:
        start-=1
    start=max(0,start-round(rate*.015))
    return audio[start:min(len(audio),start+round(rate*seconds))]
