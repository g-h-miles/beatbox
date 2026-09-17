"""Bounded ImageNet transfer ablation on AVP, with performer-separated evaluation.

Uses cached 128-bin log-mel audio features, never rendered pictures with axes.
Train1–14, validation15–20, test21–28. Test is evaluated once after selection.
"""
import json
import time
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import confusion_matrix
from torch import nn
from torchvision.models import ResNet18_Weights, resnet18

ROOT = Path('artifacts/image-transfer')
CLASSES = ['hhc', 'hho', 'kd', 'sd']


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    torch.manual_seed(7301)
    torch.set_num_threads(4)
    rng = np.random.default_rng(7301)
    rows = json.loads(Path('artifacts/ml-v2/events.json').read_text())
    raw = np.load('artifacts/ml-v2/fbanks.npy').astype(np.float32).transpose(0, 2, 1)
    # Kaldi BEATs normalization is affine; undoing it is unnecessary before
    # per-clip min/max normalization. Clamp an80dB dynamic range in natural log.
    peak = raw.max(axis=(1, 2), keepdims=True)
    raw = np.maximum(raw, peak - 80 / 4.34294482 / (2 * 6.55582))
    lo = raw.min(axis=(1, 2), keepdims=True)
    raw = (raw - lo) / np.maximum(peak - lo, 1e-5)
    X = torch.from_numpy(raw)
    y = np.array([CLASSES.index(r['label']) if r['label'] in CLASSES else -1 for r in rows])
    p = np.array([r['participant'] for r in rows])
    annotated = np.array([r['kind'] == 'annotation' for r in rows])
    groove = np.array([r['groove'] for r in rows])
    train = np.flatnonzero((p <= 14) & annotated & (y >= 0))
    validation = np.flatnonzero((p >= 15) & (p <= 20) & ~annotated & groove)
    test = np.flatnonzero((p >= 21) & ~annotated & groove)
    device = 'mps' if torch.backends.mps.is_available() else 'cpu'
    model = resnet18(weights=ResNet18_Weights.IMAGENET1K_V1)
    model.fc = nn.Linear(model.fc.in_features, 4)
    for parameter in model.parameters():
        parameter.requires_grad_(False)
    for parameter in model.fc.parameters():
        parameter.requires_grad_(True)
    model.to(device)
    mean = torch.tensor([.485, .456, .406], device=device)[None, :, None, None]
    std = torch.tensor([.229, .224, .225], device=device)[None, :, None, None]

    def inputs(indices, augment=False):
        images = X[indices].to(device)[:, None]
        if augment:
            images = images + torch.randn_like(images) * .015
            # Small frequency/time masks, no image flips or rotations.
            if rng.random() < .5:
                start = int(rng.integers(0, 120))
                images[:, :, start:start + 8] = 0
            if rng.random() < .5:
                start = int(rng.integers(0, 44))
                images[:, :, :, start:start + 4] = 0
        images = nn.functional.interpolate(images, (128, 96), mode='bilinear', align_corners=False)
        return (images.expand(-1, 3, -1, -1) - mean) / std

    @torch.no_grad()
    def evaluate(indices):
        model.eval()
        predictions = []
        for offset in range(0, len(indices), 96):
            predictions.extend(model(inputs(indices[offset:offset + 96])).argmax(1).cpu().tolist())
        predictions = np.array(predictions)
        truth = y[indices]
        matched = truth >= 0
        correct = int(sum(predictions[matched] == truth[matched]))
        participants = set(p[indices])
        count = sum(annotated & groove & np.isin(p, list(participants)) & (y >= 0))
        collapse = np.array([0, 0, 1, 2])
        core_correct = int(sum(collapse[predictions[matched]] == collapse[truth[matched]]))
        return {'correct': correct, 'matched': int(sum(matched)), 'detected': len(indices),
                'referenceEvents': int(count), 'conditionalFourClassAccuracy': correct / sum(matched),
                'endToEndFourClassF1': 2 * correct / (len(indices) + count),
                'coreMergedHatCorrect': core_correct,
                'conditionalThreeClassAccuracy': core_correct / sum(matched),
                'endToEndThreeClassF1': 2 * core_correct / (len(indices) + count),
                'confusion': confusion_matrix(truth[matched], predictions[matched], labels=range(4)).tolist()}

    class_weights = len(train) / (4 * np.bincount(y[train], minlength=4))
    criterion = nn.CrossEntropyLoss(weight=torch.tensor(class_weights, dtype=torch.float32, device=device))
    optimizer = torch.optim.AdamW(model.fc.parameters(), lr=.001, weight_decay=.01)
    best = -1
    best_state = None
    history = []
    start = time.time()
    for epoch in range(8):
        if epoch == 2:
            for parameter in model.layer4.parameters():
                parameter.requires_grad_(True)
            optimizer = torch.optim.AdamW([
                {'params': model.layer4.parameters(), 'lr': 8e-5},
                {'params': model.fc.parameters(), 'lr': 3e-4}], weight_decay=.02)
        model.train()
        # Keep pretrained running statistics fixed on small audio batches.
        for module in model.modules():
            if isinstance(module, nn.BatchNorm2d):
                module.eval()
        losses = []
        shuffled = rng.permutation(train)
        for offset in range(0, len(shuffled), 64):
            batch = shuffled[offset:offset + 64]
            optimizer.zero_grad(set_to_none=True)
            loss = criterion(model(inputs(batch, augment=True)), torch.tensor(y[batch], device=device))
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 3)
            optimizer.step()
            losses.append(float(loss.detach().cpu()))
        score = evaluate(validation)
        item = {'epoch': epoch + 1, 'loss': float(np.mean(losses)), 'validation': score,
                'elapsedSeconds': round(time.time() - start, 2)}
        history.append(item)
        print(json.dumps(item), flush=True)
        if score['endToEndFourClassF1'] > best:
            best = score['endToEndFourClassF1']
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
            best_epoch = epoch + 1
        if time.time() - start > 480:
            break
    model.load_state_dict(best_state)
    report = {'architecture': 'ImageNetResNet18; frozen backbone2epochs then layer4+head fine-tuning',
              'input': '128-bin Kaldi log-mel, full0.5s event crop, grayscale repeated3channels, resized128x96',
              'classes': CLASSES, 'trainPerformers': list(range(1, 15)),
              'validationPerformers': list(range(15, 21)), 'testPerformers': list(range(21, 29)),
              'selectedEpoch': best_epoch, 'trainingEvents': len(train), 'history': history,
              'test': evaluate(test), 'seconds': round(time.time() - start, 2),
              'limitations': ['Previously inspected AVP performers, not a fresh unseen corpus.',
                              'Original app detector provides evaluation crops; labels never set crop boundaries.',
                              'Merged-hat metric is diagnostic only; model and selection remain four-class.',
                              'No boots-and-cats, ride, crash, or auxiliary-class validation.']}
    (ROOT / 'report.json').write_text(json.dumps(report, indent=2))
    torch.save(best_state, ROOT / 'resnet18.pt')
    print(json.dumps(report['test']), flush=True)


if __name__ == '__main__':
    main()
