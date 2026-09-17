import unittest
import numpy as np
from attack_window import attack_window
from librosa_segments import segment_calibration

class AttackWindowTests(unittest.TestCase):
    def test_keeps_main_attack_after_long_quiet_lead_in(self):
        rate=16000
        audio=np.zeros(rate*2,dtype=np.float32)
        audio[100:1000]=.003
        audio[rate:rate+1600]=np.sin(np.arange(1600)*.12)*.8
        original=audio.copy()
        result=attack_window(audio,rate)
        self.assertLessEqual(len(result),rate*.5)
        self.assertGreater(np.max(np.abs(result)),.7)
        np.testing.assert_array_equal(audio,original)

    def test_silence_does_not_create_librosa_regions(self):
        self.assertEqual(segment_calibration(np.zeros(22050),22050),[])

    def test_regions_follow_separated_attacks_under_gain_change(self):
        rate=22050;audio=np.zeros(rate*3,dtype=np.float32)
        rng=np.random.default_rng(4)
        for time in [.2,1.2,2.2]:
            start=round(time*rate); audio[start:start+2205]=rng.normal(0,.1,2205)*np.hanning(2205)
        loud=segment_calibration(audio,rate); quiet=segment_calibration(audio*.02,rate)
        self.assertEqual(len(loud),3);self.assertEqual(loud,quiet)

if __name__=='__main__':unittest.main()
