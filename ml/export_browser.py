"""Export the validated four-class onset model and check ONNX/PyTorch parity."""
import json
from pathlib import Path
import librosa
import numpy as np
import onnx
import onnxruntime as ort
import torch
from train_transcriber import Transcriber, ROOT, RATE, HOP, CLASSES


def main():
    torch.set_num_threads(4)
    model = Transcriber().eval()
    checkpoint = torch.load(ROOT / 'transcriber.pt', map_location='cpu', weights_only=True)
    model.load_state_dict(checkpoint['state'])
    output = Path('public/models'); output.mkdir(parents=True, exist_ok=True)
    path = output / 'beatbox-onsets.onnx'
    # Legacy exporter is used deliberately for simple dynamic-time ONNX operators.
    torch.onnx.export(model, torch.zeros(1, 64, 992), path, dynamo=False, opset_version=17,
                      input_names=['spectrogram'], output_names=['onsetLogits', 'drumLogits'],
                      dynamic_axes={'spectrogram': {2: 'frames'}, 'onsetLogits': {1: 'frames'},
                                    'drumLogits': {2: 'frames'}})
    onnx.checker.check_model(onnx.load(path))
    session = ort.InferenceSession(str(path), providers=['CPUExecutionProvider'])
    rng = np.random.default_rng(42)
    errors = []
    for frames in [193, 512, 992]:
        x = rng.normal(size=(1, 64, frames)).astype(np.float32)
        with torch.no_grad(): expected = [v.numpy() for v in model(torch.from_numpy(x))]
        actual = session.run(None, {'spectrogram': x})
        errors.append(max(float(np.max(np.abs(a - b))) for a, b in zip(expected, actual)))
    assert max(errors) < 1e-4, errors
    bank = librosa.filters.mel(sr=RATE, n_fft=512, n_mels=64, fmin=40)
    sparse_bank = [[[int(i), float(row[i])] for i in np.flatnonzero(row)] for row in bank]
    settings = {'sampleRate': RATE, 'hop': HOP, 'fft': 512, 'threshold': checkpoint['threshold'],
                'classes': CLASSES, 'mel': sparse_bank}
    Path('src/generated/neural-settings.json').write_text(json.dumps(settings, separators=(',', ':')))
    report = {'maxAbsoluteLogitErrors': errors, 'modelBytes': path.stat().st_size,
              'note': 'Numerical conversion parity, not recognition accuracy.'}
    (ROOT / 'onnx-parity.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report), flush=True)


if __name__ == '__main__': main()
