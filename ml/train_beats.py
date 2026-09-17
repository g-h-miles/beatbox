"""Fine-tune an AudioSet-pretrained BEATs encoder on complete vocal percussion events.

Select checkpoints on validation performers, never on test recordings. The final
report distinguishes conditional classification from end-to-end event accuracy.
"""
import argparse
import copy
import json
import sys
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

sys.path.insert(0, str(Path('artifacts/beats').resolve()))
from BEATs import BEATs, BEATsConfig

ROOT = Path('artifacts/ml-v2')
CLASSES = ['hhc', 'hho', 'kd', 'sd']


class Recognizer(nn.Module):
    def __init__(self, unfreeze=4):
        super().__init__()
        checkpoint = torch.load('artifacts/beats/model.pt', map_location='cpu', weights_only=True)
        config = BEATsConfig(checkpoint['cfg'])
        config.encoder_layerdrop = 0
        self.encoder = BEATs(config)
        self.encoder.load_state_dict(checkpoint['model'])
        self.encoder.predictor = None
        for parameter in self.encoder.parameters():
            parameter.requires_grad = False
        if unfreeze:
            for layer in self.encoder.encoder.layers[-unfreeze:]:
                for parameter in layer.parameters():
                    parameter.requires_grad = True
        self.head = nn.Sequential(nn.LayerNorm(1536), nn.Linear(1536, 128),
                                  nn.GELU(), nn.Dropout(.3), nn.Linear(128, len(CLASSES)))

    def embedding(self, bank):
        encoder = self.encoder
        features = encoder.patch_embedding(bank.unsqueeze(1))
        features = features.flatten(2).transpose(1, 2)
        features = encoder.layer_norm(features)
        if encoder.post_extract_proj is not None:
            features = encoder.post_extract_proj(features)
        features, _ = encoder.encoder(encoder.dropout_input(features), padding_mask=None)
        return torch.cat([features.mean(1), features.std(1)], dim=1)

    def forward(self, bank):
        return self.head(self.embedding(bank))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--epochs', type=int, default=25)
    parser.add_argument('--unfreeze', type=int, default=4)
    parser.add_argument('--name', default='beats-v2')
    args = parser.parse_args()
    torch.manual_seed(42)
    np.random.seed(42)
    torch.set_num_threads(4)
    device = 'mps' if torch.backends.mps.is_available() else 'cpu'
    rows = json.loads((ROOT / 'events.json').read_text())
    banks = np.load(ROOT / 'fbanks.npy').astype(np.float32)
    labels = np.array([CLASSES.index(r['label']) if r['label'] in CLASSES else -1 for r in rows])
    participants = np.array([r['participant'] for r in rows])
    annotation = np.array([r['kind'] == 'annotation' for r in rows])
    groove = np.array([r['groove'] for r in rows])
    train = annotation & (participants <= 14) & (labels >= 0)
    validation = ~annotation & groove & (participants >= 15) & (participants <= 20) & (labels >= 0)
    model = Recognizer(args.unfreeze).to(device)
    loader = DataLoader(TensorDataset(torch.from_numpy(banks[train]), torch.from_numpy(labels[train])),
                        batch_size=48, shuffle=True)
    optimizer = torch.optim.AdamW([
        {'params': [p for p in model.encoder.parameters() if p.requires_grad], 'lr': 1e-5},
        {'params': model.head.parameters(), 'lr': 3e-4},
    ], weight_decay=.01)
    loss_fn = nn.CrossEntropyLoss(label_smoothing=.05)
    checkpoint_path = ROOT / f'{args.name}.pt'
    best, stale, history = -1, 0, []

    @torch.no_grad()
    def predict(mask):
        model.eval()
        indices = np.flatnonzero(mask)
        outputs = []
        for offset in range(0, len(indices), 64):
            batch = torch.from_numpy(banks[indices[offset:offset + 64]]).to(device)
            outputs.append(model(batch).cpu().numpy())
        return np.concatenate(outputs)

    for epoch in range(args.epochs):
        model.train()
        total = 0
        for bank, target in loader:
            bank, target = bank.to(device), target.to(device)
            # Gain/noise and narrow frequency masking leave event timing intact.
            bank = bank + torch.randn((len(bank), 1, 1), device=device) * .12
            bank = bank + torch.randn_like(bank) * .025
            if torch.rand(()).item() < .5:
                start = int(torch.randint(0, 116, ()).item())
                bank[:, :, start:start + 12] = -2.5
            optimizer.zero_grad(set_to_none=True)
            loss = loss_fn(model(bank), target)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1)
            optimizer.step()
            total += loss.item()
        predicted = predict(validation).argmax(1)
        score = f1_score(labels[validation], predicted, average='macro', zero_division=0)
        metric = {'epoch': epoch + 1, 'loss': total / len(loader), 'validationMacroF1': score,
                  'validationAccuracy': accuracy_score(labels[validation], predicted)}
        history.append(metric)
        print(json.dumps(metric), flush=True)
        if score > best:
            best, stale = score, 0
            torch.save({key: value.detach().cpu() for key, value in model.state_dict().items()}, checkpoint_path)
        else:
            stale += 1
        if stale >= 6:
            break
    model.load_state_dict(torch.load(checkpoint_path, map_location=device, weights_only=True))
    report = {'classes': CLASSES, 'seed': 42, 'training': 'AVP annotated events, participants 1–14',
              'selection': 'macro F1 on detected groove events, participants 15–20',
              'history': history, 'bestValidationMacroF1': best, 'cohorts': {}}
    for name, people in [('validation', (participants >= 15) & (participants <= 20)),
                         ('previouslyInspectedTest', participants >= 21)]:
        mask = ~annotation & groove & people
        logits = predict(mask)
        pred = logits.argmax(1)
        truth = labels[mask]
        matched = truth >= 0
        correct = int((pred[matched] == truth[matched]).sum())
        gt_count = int((annotation & groove & people).sum())
        detected_count = int(mask.sum())
        report['cohorts'][name] = {
            'correctlyLabeledMatches': correct, 'matched': int(matched.sum()),
            'detected': detected_count, 'annotated': gt_count,
            'classificationAccuracy': accuracy_score(truth[matched], pred[matched]),
            'classificationMacroF1': f1_score(truth[matched], pred[matched], average='macro'),
            'endToEndPrecision': correct / detected_count,
            'endToEndRecall': correct / gt_count,
            'endToEndF1': 2 * correct / (detected_count + gt_count),
            'confusion': confusion_matrix(truth[matched], pred[matched], labels=range(4)).tolist(),
        }
        np.save(ROOT / f'{args.name}-{name}-logits.npy', logits)
    (ROOT / f'{args.name}-report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report['cohorts'], indent=2), flush=True)


if __name__ == '__main__':
    main()
