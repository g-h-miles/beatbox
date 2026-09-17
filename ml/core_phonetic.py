"""Core-three acoustic CNN with optional onset/coda phonetic supervision.

AVP performers1–14 train;15–20 select epochs/model;21–28 previously inspected
held-out evaluation. Labels do not set evaluation crop boundaries. Optional
phonetic heads are trained solely on enriched Personal training annotations.
"""
import argparse,json,copy
from pathlib import Path
import numpy as np
import torch
from torch import nn
from sklearn.metrics import confusion_matrix
OUT=Path('artifacts/core-model'); OUT.mkdir(exist_ok=True,parents=True)

class Acoustic(nn.Module):
 def __init__(self,onsets,codas):
  super().__init__(); self.encoder=nn.Sequential(nn.Conv2d(1,24,5,padding=2),nn.GroupNorm(4,24),nn.GELU(),nn.MaxPool2d((2,2)),nn.Conv2d(24,48,3,padding=1),nn.GroupNorm(8,48),nn.GELU(),nn.MaxPool2d((2,2)),nn.Conv2d(48,64,3,padding=1),nn.GroupNorm(8,64),nn.GELU(),nn.MaxPool2d((2,1)))
  self.body=nn.Sequential(nn.Flatten(),nn.Linear(64*16*3,256),nn.GELU(),nn.Dropout(.35))
  self.onset=nn.Linear(256,onsets);self.coda=nn.Linear(256,codas);self.drum=nn.Linear(256+onsets+codas,3)
 def forward(self,x):
  h=self.encoder(x[:,None].transpose(2,3));h=nn.functional.adaptive_avg_pool2d(h,(16,3));h=self.body(h);o=self.onset(h);c=self.coda(h);d=self.drum(torch.cat((h,o.softmax(1),c.softmax(1)),1));return d,o,c

def main():
 p=argparse.ArgumentParser();p.add_argument('--epochs',type=int,default=35);p.add_argument('--aux',type=float,default=.3);p.add_argument('--name',default='phonetic');a=p.parse_args()
 torch.set_num_threads(4);torch.manual_seed(37);rng=np.random.default_rng(37);device='mps' if torch.backends.mps.is_available() else 'cpu'
 meta=json.loads(Path('artifacts/ml-v2/events.json').read_text());rec=json.loads(Path('artifacts/events-v2-phonemes.json').read_text());lookup={(r['file'],round(v['time'],6)):v['phonemes'] for r in rec for v in r['annotations'] if 'phonemes' in v}
 ons=sorted(set(v['onset'] for v in lookup.values()));cod=sorted(set(v['coda'] for v in lookup.values()));oy=[];cy=[]
 for m in meta:
  v=lookup.get((m['file'],round(m['time'],6))) if m['kind']=='annotation' else None;oy.append(ons.index(v['onset']) if v else -100);cy.append(cod.index(v['coda']) if v else -100)
 mapping={'hhc':0,'hho':0,'kd':1,'sd':2}; y=np.array([mapping.get(m['label'],-1) for m in meta]);oy=np.array(oy);cy=np.array(cy)
 x=np.load('artifacts/ml-v2/fbanks.npy').astype('float32');x-=x.mean((1,2),keepdims=True);x/=2
 train=np.array([i for i,m in enumerate(meta) if m['participant']<=14 and m['kind']=='annotation' and y[i]>=0]);val=np.array([i for i,m in enumerate(meta) if 15<=m['participant']<=20 and m['kind']=='detection' and m['groove'] and y[i]>=0]);test=np.array([i for i,m in enumerate(meta) if 21<=m['participant']<=28 and m['kind']=='detection' and m['groove'] and y[i]>=0])
 model=Acoustic(len(ons),len(cod)).to(device);opt=torch.optim.AdamW(model.parameters(),lr=.00035,weight_decay=.02);ce=nn.CrossEntropyLoss();weights=1/np.bincount(y[train])[y[train]];weights/=weights.sum();best=-1;stale=0;history=[]
 @torch.no_grad()
 def predict(ids):
  model.eval();result=[]
  for j in range(0,len(ids),128):result.append(model(torch.tensor(x[ids[j:j+128]],device=device))[0].softmax(1).cpu().numpy())
  return np.concatenate(result)
 for epoch in range(a.epochs):
  model.train();losses=[]
  for step in range(64):
   ids=rng.choice(train,64,p=weights);batch=x[ids].copy()
   for b in batch:
    # Gain independent centered spectra; frequency shifts and masks model voice variation.
    shift=int(rng.integers(-3,4));b[:]=np.roll(b,shift,axis=1)
    if rng.random()<.5:
     lo=int(rng.integers(0,116));b[:,lo:lo+int(rng.integers(3,13))]=b.mean()
    if rng.random()<.25:
     lo=int(rng.integers(0,43));b[lo:lo+3]=b.mean()
   d,o,c=model(torch.tensor(batch,device=device));loss=ce(d,torch.tensor(y[ids],device=device));valid=oy[ids]>=0
   if a.aux and valid.any():
    keep=torch.tensor(valid,device=device);loss=loss+a.aux*(.6*ce(o[keep],torch.tensor(oy[ids][valid],device=device))+.4*ce(c[keep],torch.tensor(cy[ids][valid],device=device)))
   opt.zero_grad();loss.backward();nn.utils.clip_grad_norm_(model.parameters(),3);opt.step();losses.append(loss.item())
  vp=predict(val);score=float(np.mean(vp.argmax(1)==y[val]));row={'epoch':epoch+1,'loss':float(np.mean(losses)),'validation':score};history.append(row);print(row,flush=True)
  if score>best:
   best=score;stale=0;torch.save({'state':model.state_dict(),'onsets':ons,'codas':cod,'aux':a.aux},OUT/f'{a.name}.pt')
  else:stale+=1
  if stale>=9:break
 saved=torch.load(OUT/f'{a.name}.pt',map_location=device,weights_only=True);model.load_state_dict(saved['state'])
 def score(ids):
  probs=predict(ids);pred=probs.argmax(1);return {'correct':int(sum(pred==y[ids])),'matched':len(ids),'classification':float(np.mean(pred==y[ids])),'confusion':confusion_matrix(y[ids],pred).tolist()}
 report={'selection':'train1–14; validation15–20; previously inspected test21–28','phoneticTrainingEvents':int(sum(oy[train]>=0)),'auxiliaryWeight':a.aux,'history':history,'validation':score(val),'previouslyInspectedTest':score(test)};(OUT/f'{a.name}-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2),flush=True)
if __name__=='__main__':main()
