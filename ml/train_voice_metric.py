"""Episodic voice adaptation: learn to compare a person's examples to their grooves.

Unlike a global drum classifier, each episode learns the relationship between
isolated support examples and separate improvisations from the same performer.
"""
import json
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import accuracy_score
from torch import nn

ROOT = Path('artifacts/ml-v2')
CLASSES = ['hhc', 'hho', 'kd', 'sd']


class VoiceMetric(nn.Module):
    def __init__(self):
        super().__init__()
        self.network = nn.Sequential(
            nn.Conv2d(1, 24, 3, padding=1), nn.GroupNorm(6, 24), nn.GELU(), nn.MaxPool2d(2),
            nn.Conv2d(24, 48, 3, padding=1), nn.GroupNorm(8, 48), nn.GELU(), nn.MaxPool2d(2),
            nn.Conv2d(48, 96, 3, padding=1), nn.GroupNorm(8, 96), nn.GELU(), nn.MaxPool2d(2),
            nn.Conv2d(96, 96, 3, padding=1), nn.GroupNorm(8, 96), nn.GELU(),
            nn.AdaptiveAvgPool2d((4, 3)), nn.Flatten(), nn.Linear(1152, 128),
            nn.LayerNorm(128))

    def forward(self, bank):
        return nn.functional.normalize(self.network(bank[:, None]), dim=1)


def main():
    torch.manual_seed(42); torch.set_num_threads(4)
    rng = np.random.default_rng(42)
    rows = json.loads((ROOT / 'events.json').read_text())
    X = np.load(ROOT / 'fbanks.npy').astype(np.float32).transpose(0, 2, 1)
    y = np.array([CLASSES.index(r['label']) if r['label'] in CLASSES else -1 for r in rows])
    people = np.array([r['participant'] for r in rows]); modes = np.array([r['mode'] for r in rows])
    annotated = np.array([r['kind'] == 'annotation' for r in rows]); groove = np.array([r['groove'] for r in rows])
    tasks = []
    for person in range(1, 29):
        for mode in ['Fixed', 'Personal']:
            mask = (people == person) & (modes == mode)
            support = [np.flatnonzero(mask & annotated & ~groove & (y == c)) for c in range(4)]
            train_query = np.flatnonzero(mask & annotated & groove & (y >= 0))
            eval_query = np.flatnonzero(mask & ~annotated & groove & (y >= 0))
            if min(map(len, support)) >= 5 and len(train_query) and len(eval_query):
                tasks.append({'person': person, 'mode': mode, 'support': support,
                              'trainQuery': train_query, 'evalQuery': eval_query})
    train_tasks = [t for t in tasks if t['person'] <= 14]
    model = VoiceMetric().to('mps')
    optimizer = torch.optim.AdamW(model.parameters(), lr=2e-4, weight_decay=.02)
    best, stale, history = -1, 0, []

    def tensor(indices, augment=False):
        bank = torch.from_numpy(X[indices]).to('mps')
        if augment:
            bank = bank + torch.randn((len(bank), 1, 1), device='mps') * .12 + torch.randn_like(bank) * .035
            # Independent small spectral shifts simulate variation in vocal tract position.
            for i in range(len(bank)):
                shift = int(rng.integers(-3, 4))
                bank[i] = torch.roll(bank[i], shift, 0)
                if shift > 0: bank[i, :shift] = -2.5
                if shift < 0: bank[i, shift:] = -2.5
        return bank

    def scores(support, query):
        prototypes = support.reshape(4, 5, -1).mean(1)
        # Learn relative similarities, not a universal voice-independent mapping.
        return -20 * ((query[:, None] - prototypes[None]) ** 2).sum(2)

    @torch.no_grad()
    def evaluate(min_person, max_person):
        model.eval(); correct = total = 0; details = []
        for task in tasks:
            if not min_person <= task['person'] <= max_person: continue
            support = np.concatenate([a[:5] for a in task['support']])
            embedded_support = model(tensor(support))
            query = task['evalQuery']; predictions = []
            for offset in range(0, len(query), 128):
                predictions.extend(scores(embedded_support, model(tensor(query[offset:offset + 128]))).argmax(1).cpu().numpy())
            c = int(sum(np.array(predictions) == y[query])); correct += c; total += len(query)
            details.append({'participant': task['person'], 'mode': task['mode'], 'correct': c, 'total': len(query), 'accuracy': c / len(query)})
        return {'correct': correct, 'total': total, 'accuracy': correct / total,
                'meanProfileAccuracy': float(np.mean([d['accuracy'] for d in details])), 'profiles': details}

    for epoch in range(40):
        model.train(); losses = []
        for _ in range(80):
            task = train_tasks[int(rng.integers(len(train_tasks)))]
            support = np.concatenate([rng.choice(a, 5, replace=False) for a in task['support']])
            query = rng.choice(task['trainQuery'], 32, replace=len(task['trainQuery']) < 32)
            embedded = model(tensor(np.r_[support, query], augment=True))
            loss = nn.functional.cross_entropy(scores(embedded[:20], embedded[20:]), torch.from_numpy(y[query]).to('mps'))
            optimizer.zero_grad(set_to_none=True); loss.backward(); nn.utils.clip_grad_norm_(model.parameters(), 2); optimizer.step()
            losses.append(loss.item())
        result = evaluate(15, 20)
        item = {'epoch': epoch + 1, 'loss': float(np.mean(losses)), 'validationAccuracy': result['accuracy'], 'meanProfileAccuracy': result['meanProfileAccuracy']}
        print(json.dumps(item), flush=True); history.append(item)
        if result['meanProfileAccuracy'] > best:
            best, stale = result['meanProfileAccuracy'], 0
            torch.save({k: v.detach().cpu() for k, v in model.state_dict().items()}, ROOT / 'voice-metric.pt')
        else: stale += 1
        if stale >= 8: break
    model.load_state_dict(torch.load(ROOT / 'voice-metric.pt', map_location='mps', weights_only=True))
    report = {'examplesPerClass': 5, 'selection': 'mean validation-profile accuracy, performers 15–20',
              'history': history, 'validation': evaluate(15, 20), 'previouslyInspectedTest': evaluate(21, 28)}
    (ROOT / 'voice-metric-report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({k: v for k, v in report.items() if k != 'history'}, indent=2), flush=True)


if __name__ == '__main__': main()
