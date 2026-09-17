import base64
import io
import json
import tempfile
import unittest
import wave
from pathlib import Path
import numpy as np
from import_training_pack import import_pack


def recording(round_number, frequency):
    t = np.arange(22050) / 22050
    samples = (np.sin(2 * np.pi * frequency * t) * 4000).astype('<i2')
    output = io.BytesIO()
    with wave.open(output, 'wb') as writer:
        writer.setnchannels(1); writer.setsampwidth(2); writer.setframerate(22050); writer.writeframes(samples.tobytes())
    return {'id': f'kick-{round_number}', 'drum': 'kick',
            'split': 'training' if round_number == 1 else 'holdout',
            'audioBase64': base64.b64encode(output.getvalue()).decode()}


class TrainingPackTests(unittest.TestCase):
    def test_preserves_fresh_take_and_does_not_invent_onsets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); pack = root / 'pack.json'
            pack.write_text(json.dumps({'format': 'beatbox-training-v1', 'recordings': [recording(1, 440), recording(2, 880)]}))
            manifest_path = import_pack(pack, 'test-voice', root / 'private')
            manifest = json.loads(manifest_path.read_text())
            self.assertEqual([r['split'] for r in manifest['recordings']], ['training', 'holdout'])
            self.assertTrue(all(r['onsetAnnotations'] is None for r in manifest['recordings']))
            self.assertTrue(all((manifest_path.parent / r['file']).exists() for r in manifest['recordings']))

    def test_rejects_duplicate_audio_across_training_and_holdout(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); pack = root / 'pack.json'
            pack.write_text(json.dumps({'format': 'beatbox-training-v1', 'recordings': [recording(1, 440), recording(2, 440)]}))
            with self.assertRaisesRegex(ValueError, 'duplicates'):
                import_pack(pack, 'test-voice', root / 'private')
            self.assertEqual(list((root / 'private').rglob('*.wav')), [])

    def test_rejects_path_traversal_in_voice_id(self):
        with self.assertRaises(ValueError):
            import_pack('unused.json', '../../public')


if __name__ == '__main__': unittest.main()
