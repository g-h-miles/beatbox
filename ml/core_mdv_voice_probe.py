"""Descriptive train-only voice leakage probe for selected embeddings.

Within each known drum class, compare nearest-neighbor voice agreement. This
uses training events, so it is not a generalization metric or selection signal.
Candidates sharing the exact event are excluded; same-file neighbors remain.
"""
import json
from pathlib import Path
import numpy as np
import torch
from torch import nn
from core_mdv_neural import Acoustic
OUT=Path('artifacts/core-model/mdv')

def leakage(embeddings,labels,voices):
 scores=[]
 for c in range(4):
  indices=np.flatnonzero(labels==c);z=embeddings[indices];sim=z@z.T;np.fill_diagonal(sim,-np.inf);nearest=sim.argmax(1);v=voices[indices];chance=sum(n*(n-1) for n in np.bincount(v))/(len(v)*(len(v)-1))
  scores.append({'class':c,'events':len(v),'sameVoiceNearestNeighbor':float(np.mean(v==v[nearest])),'sameVoiceRandomNeighbor':float(chance)})
 return scores

def main():
 torch.set_num_threads(4);device='mps' if torch.backends.mps.is_available() else 'cpu';rows=json.loads((OUT/'events.json').read_text());train=np.array([i for i,r in enumerate(rows) if r['split']=='train']);x=np.load(OUT/'banks.npy').astype('float32');x-=x.mean((1,2),keepdims=True);x/=2;saved=np.load(OUT/'contrastive-reference.npz');model=Acoustic().to(device);checkpoint=torch.load(OUT/'neural.pt',map_location=device,weights_only=True);model.load_state_dict(checkpoint['state']);model.eval();parts=[]
 with torch.no_grad():
  for offset in range(0,len(train),128):
   batch=torch.tensor(x[train[offset:offset+128]],device=device);h=model.encoder(batch[:,None].transpose(2,3));h=nn.functional.adaptive_avg_pool2d(h,(16,3));z=model.head[:-1](h);parts.append(nn.functional.normalize(z,dim=1).cpu().numpy())
 generic=np.concatenate(parts);report={'purpose':'Post-selection, descriptive training-set voice-neighbor diagnostic; not a held-out invariance score.','genericCNN':leakage(generic,saved['labels'],saved['voices']),'crossVoiceContrastive':leakage(saved['embeddings'],saved['labels'],saved['voices'])};(OUT/'voice-probe-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
if __name__=='__main__':main()
