import unittest
import numpy as np
from isolated_segments import segment_isolated

class SegmentationTests(unittest.TestCase):
    def test_quiet_gaps_and_multistage_hit(self):
        rate=22050
        rng=np.random.default_rng(12)
        audio=rng.normal(0,.0001,rate*3)
        for start, length, level in [(.3,.06,.3),(.40,.06,.15),(1.2,.06,.25),(2.1,.10,.2)]:
            lo=round(start*rate);n=round(length*rate)
            audio[lo:lo+n]+=rng.normal(0,level,n)*np.hanning(n)
        spans=segment_isolated(audio,rate)
        self.assertEqual(len(spans),3)
        self.assertLess(spans[0]['start'],.34)
        self.assertGreater(spans[0]['end'],.43)
        self.assertLess(abs(spans[1]['start']-1.2),.025)

    def test_recording_gain_does_not_change_boundaries(self):
        rate=22050;rng=np.random.default_rng(2)
        audio=rng.normal(0,.0001,rate*2)
        for start in [.2,1.2]:
            lo=round(start*rate);n=2205
            audio[lo:lo+n]+=rng.normal(0,.1,n)*np.hanning(n)
        loud=segment_isolated(audio,rate);quiet=segment_isolated(audio*.02,rate)
        self.assertEqual([(s['start'],s['end']) for s in loud],[(s['start'],s['end']) for s in quiet])

    def test_silence_has_no_examples(self):
        self.assertEqual(segment_isolated(np.zeros(22050),22050),[])

if __name__=='__main__':unittest.main()
