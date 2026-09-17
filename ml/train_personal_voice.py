"""Fine-tune an existing audio embedding on private training takes only.

Class labels are recording-level; segmentation is not annotated ground truth.
Select epoch count using temporal blocks of training audio, then refit those
training takes. Separate-check takes never enter fitting or model selection.
"""
import argparse
import json
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
import torch
from torch import nn
from sklearn.metrics import confusion_matrix
from librosa_segments import segment_calibration
from attack_window import attack_window
from prepare import crop, fbank
from train_voice_metric import VoiceMetric

CLASSES = ['kick', 'closed', 'open', 'ride', 'crash', 'snare', 'aux']

class PersonalVoice(nn.Module):
    def __init__(self, pretrained):
        super().__init__()
        self.encoder = VoiceMetric()
        self.encoder.load_state_dict(pretrained)
        self.head = nn.Linear(128, 7)

    def forward(self, x):
        return self.head(self.encoder(x)) * 10


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--extra-training', type=Path, action='append', default=[])
    parser.add_argument('--epochs', type=int, default=30)
    args = parser.parse_args()
    torch.set_num_threads(4)
    torch.manual_seed(42)
    device = 'mps' if torch.backends.mps.is_available() else 'cpu'
    root = args.manifest.parent
    rows, banks, used = [], [], set()
    for source in [args.manifest, *args.extra_training]:
        manifest = json.loads(source.read_text())
        for rec in manifest['recordings']:
            if source != args.manifest and rec['split'] != 'training':
                continue
            digest = rec['pcmSha256']
            if digest in used:
                continue
            used.add(digest)
            audio, rate = sf.read(source.parent / rec['file'], dtype='float32')
            segments = segment_calibration(audio, rate)
            for segment in segments:
                sample = audio[round(segment['start']*rate):round(segment['end']*rate)]
                sample = librosa.resample(attack_window(sample, rate), orig_sr=rate, target_sr=16000)
                banks.append(fbank(crop(sample, 0, len(sample)/16000)).astype(np.float32).T)
                rows.append({'file': str(source.parent/rec['file']), 'split':rec['split'],
                             'label':rec['drum'], 'fold':min(2, int(segment['start']/rec['duration']*3)), **segment})
    X = np.array(banks)
    y = np.array([CLASSES.index(r['label']) for r in rows])
    train = np.array([r['split']=='training' for r in rows])
    fold = np.array([r['fold'] for r in rows])
    # Prevent exact reuse of check audio as an additional training take.
    checks = {r['pcmSha256'] for r in json.loads(args.manifest.read_text())['recordings'] if r['split']=='holdout'}
    for source in [args.manifest, *args.extra_training]:
        if any(r['pcmSha256'] in checks for r in json.loads(source.read_text())['recordings'] if r['split']=='training'):
            raise ValueError('Training audio duplicates a separate-check recording.')
    pretrained = torch.load('artifacts/ml-v2/voice-metric.pt', map_location='cpu', weights_only=True)
    tensor = torch.from_numpy(X).to(device)
    labels = torch.from_numpy(y).to(device)
    rng = np.random.default_rng(42)

    def fit_epoch(model, optimizer, indices):
        model.train(); losses=[]
        order = rng.permutation(indices)
        for start in range(0,len(order),32):
            batch = order[start:start+32]
            bank = tensor[batch].clone()
            bank += torch.randn((len(batch),1,1),device=device)*.08
            bank += torch.randn_like(bank)*.02
            logits = model(bank)
            loss = nn.functional.cross_entropy(logits, labels[batch], label_smoothing=.05)
            optimizer.zero_grad(set_to_none=True); loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(),2); optimizer.step()
            losses.append(loss.item())
        return float(np.mean(losses))

    @torch.no_grad()
    def predict(model, indices):
        model.eval()
        return np.concatenate([model(tensor[indices[i:i+64]]).argmax(1).cpu().numpy() for i in range(0,len(indices),64)])

    fit = np.flatnonzero(train & (fold!=2)); validation=np.flatnonzero(train & (fold==2))
    for c in range(7):
        if not np.any(y[fit]==c) or not np.any(y[validation]==c):raise ValueError('Missing class in training temporal split.')
    model=PersonalVoice(pretrained).to(device)
    optimizer=torch.optim.AdamW([{'params':model.encoder.parameters(),'lr':3e-5},{'params':model.head.parameters(),'lr':3e-4}],weight_decay=.01)
    best,epoch_count,history=-1,1,[]
    print(json.dumps({'trainingSegments':int(sum(train)),'separateCheckSegments':int(sum(~train)),'device':device}),flush=True)
    for epoch in range(args.epochs):
        loss=fit_epoch(model,optimizer,fit)
        pred=predict(model,validation); score=float(np.mean(pred==y[validation]))
        history.append({'epoch':epoch+1,'loss':loss,'trainingBlockValidation':score})
        print(json.dumps(history[-1]),flush=True)
        if score>best:best,epoch_count=score,epoch+1
        if epoch+1-epoch_count>=8:break
    # Refit from the same initialization, for the selected number of epochs.
    torch.manual_seed(42);rng=np.random.default_rng(42)
    model=PersonalVoice(pretrained).to(device)
    optimizer=torch.optim.AdamW([{'params':model.encoder.parameters(),'lr':3e-5},{'params':model.head.parameters(),'lr':3e-4}],weight_decay=.01)
    for epoch in range(epoch_count):
        fit_epoch(model,optimizer,np.flatnonzero(train))
    check=np.flatnonzero(~train);prediction=predict(model,check)
    report={'scope':'Agreement with recording labels on librosa silence regions. Not verified event accuracy. Some check audio was previously inspected.',
            'classes':CLASSES,'history':history,'selectedEpochs':epoch_count,'trainingSegments':int(sum(train)),
            'correct':int(sum(prediction==y[check])),'total':len(check),
            'confusion':confusion_matrix(y[check],prediction,labels=range(7)).tolist(),
            'events':[dict(rows[i],prediction=CLASSES[int(pred)]) for i,pred in zip(check,prediction)]}
    (root/'personal-attack-report.json').write_text(json.dumps(report,indent=2))
    torch.save({'state':{k:v.cpu() for k,v in model.state_dict().items()},'classes':CLASSES,'epochCount':epoch_count},root/'personal-attack.pt')
    np.savez_compressed(root/'personal-neural-inputs.npz',X=X,y=y,training=train,fold=fold)
    (root/'personal-neural-segments.json').write_text(json.dumps(rows,indent=2))
    print(json.dumps({k:v for k,v in report.items() if k not in ['history','events']}),flush=True)

if __name__=='__main__':main()
