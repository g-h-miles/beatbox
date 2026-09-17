"""Export research onset checkpoint without changing production assets."""
import hashlib
import json
from pathlib import Path
import numpy as np
import onnx
import onnxruntime as ort
import torch
from train_transcriber import Transcriber

OUT = Path('artifacts/onset-only')

def main():
    torch.set_num_threads(4)
    model = Transcriber().eval()
    checkpoint = OUT/'onset-only.pt'
    frozen = json.loads((OUT/'frozen.json').read_text())
    assert hashlib.sha256(checkpoint.read_bytes()).hexdigest() == frozen['candidateSha256']
    model.load_state_dict(torch.load(checkpoint, map_location='cpu', weights_only=True)['state'])
    path = OUT/'beatbox-onsets.onnx'
    torch.onnx.export(model, torch.zeros(1,64,992), path, dynamo=False, opset_version=17,
                      input_names=['spectrogram'], output_names=['onsetLogits','drumLogits'],
                      dynamic_axes={'spectrogram': {2:'frames'}, 'onsetLogits': {1:'frames'}, 'drumLogits': {2:'frames'}})
    onnx.checker.check_model(onnx.load(path))
    runtime = ort.InferenceSession(str(path), providers=['CPUExecutionProvider'])
    rng = np.random.default_rng(1709)
    errors = []
    for frames in [193,512,992]:
        x = rng.normal(size=(1,64,frames)).astype('float32')
        with torch.no_grad():
            expected = [v.numpy() for v in model(torch.from_numpy(x))]
        actual = runtime.run(None, {'spectrogram':x})
        errors.append(max(float(np.max(abs(a-b))) for a,b in zip(expected,actual)))
    assert max(errors) < 1e-4
    report = {'maxAbsoluteLogitErrors': errors, 'bytes': path.stat().st_size,
              'onnxSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
              'note': 'Numerical conversion parity only. Production assets unchanged.'}
    (OUT/'export.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report))

if __name__ == '__main__':
    main()
