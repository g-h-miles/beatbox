"""Fixed five-epoch onset-only fine-tuning; see onset_only_protocol.md."""
import hashlib
import json
from pathlib import Path
import numpy as np
import torch
from torch import nn
from train_transcriber import Transcriber, prepare, targets, FRAMES
import peak_distance_evaluate as evaluation

OUT = Path('artifacts/onset-only')

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    torch.manual_seed(1709)
    torch.set_num_threads(4)
    rng = np.random.default_rng(1709)
    records = json.loads(Path('artifacts/events-v2.json').read_text())
    training = [r for r in records if 1 <= r['participant'] <= 14]
    validation = [r for r in records if 15 <= r['participant'] <= 20 and 'Improvisation' in r['file']]
    assert len(validation) == 12
    for row in training + validation:
        expected = Path('artifacts/avp-full/AVP_Dataset')/row['mode']/f"Participant_{row['participant']}"/row['file']
        assert Path(row['path']).resolve() == expected.resolve()
    spectra = prepare(training)
    labels = [targets(r, x.shape[1])[0] for r, x in zip(training, spectra)]
    grooves = [i for i, r in enumerate(training) if 'Improvisation' in r['file']]
    assert len(grooves) == 27
    source = Path('artifacts/ml-v2/transcriber.pt')
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    checkpoint = torch.load(source, map_location='cpu', weights_only=True)
    model = Transcriber().to('mps')
    model.load_state_dict(checkpoint['state'])
    for parameter in model.instrument.parameters():
        parameter.requires_grad_(False)
    optimizer = torch.optim.AdamW((p for p in model.parameters() if p.requires_grad), lr=.0001, weight_decay=.02)
    history = []
    for epoch in range(5):
        model.train()
        losses = []
        for step in range(40):
            banks, target = [], []
            for _ in range(16):
                i = int(rng.choice(grooves if rng.random() < .75 else len(training)))
                start = int(rng.integers(0, max(1, spectra[i].shape[1]-FRAMES)))
                bank = spectra[i][:, start:start+FRAMES]
                onset = labels[i][start:start+FRAMES]
                pad = FRAMES-bank.shape[1]
                banks.append(np.pad(bank, ((0,0),(0,pad)), constant_values=-2))
                target.append(np.pad(onset, (0,pad)))
            x = torch.from_numpy(np.stack(banks)).to('mps')
            y = torch.from_numpy(np.stack(target)).to('mps')
            x += torch.randn((len(x),1,1), device='mps')*.2
            x += torch.randn_like(x)*.04
            if rng.random() < .5:
                at = int(rng.integers(0,58))
                x[:, at:at+6] = -2
            optimizer.zero_grad(set_to_none=True)
            onset, _ = model(x)
            loss = nn.functional.binary_cross_entropy_with_logits(onset[:,64:-64], y[:,64:-64], pos_weight=torch.tensor(6.,device='mps'))
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 2)
            optimizer.step()
            losses.append(loss.item())
        history.append({'epoch': epoch+1, 'trainingLoss': float(np.mean(losses))})
        print(json.dumps(history[-1]), flush=True)
    output = OUT/'onset-only.pt'
    torch.save({'state': {k:v.detach().cpu() for k,v in model.state_dict().items()}, 'threshold': .4}, output)
    frozen = {'protocol': 'ml/onset_only_protocol.md', 'sourceSha256': source_hash,
              'candidateSha256': hashlib.sha256(output.read_bytes()).hexdigest(),
              'trainingRecordings': len(training), 'history': history}
    (OUT/'frozen.json').write_text(json.dumps(frozen, indent=2))
    assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
    baseline = evaluation.score(validation, 8)
    assert (baseline['detected'], baseline['reference'], baseline['matched']) == (706,694,672)
    evaluation.OUT = OUT
    evaluation.prepare(validation, model.eval())
    candidate = evaluation.score(validation, 8)
    report = {**frozen, 'baseline': baseline, 'candidate': candidate}
    (OUT/'report.json').write_text(json.dumps(report, indent=2))
    for name, result in [('baseline',baseline),('candidate',candidate)]:
        print(name, json.dumps({k:v for k,v in result.items() if k!='recordings'}), flush=True)

if __name__ == '__main__':
    main()
