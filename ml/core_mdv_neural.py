"""Domain-balanced four-way CNN; validates across AVP/MDV/Beatboxset1.

No test recordings used. Each training domain/class combination has equal
sampling weight. Unknown/noncore sounds supervise explicit `other` output.
"""
import json
from pathlib import Path
import numpy as np
import torch
from torch import nn
from core_mdv_classical import metrics
OUT=Path('artifacts/core-model/mdv')

class Acoustic(nn.Module):
 def __init__(self):
  super().__init__();self.encoder=nn.Sequential(nn.Conv2d(1,24,5,padding=2),nn.GroupNorm(4,24),nn.GELU(),nn.MaxPool2d((2,2)),nn.Conv2d(24,48,3,padding=1),nn.GroupNorm(8,48),nn.GELU(),nn.MaxPool2d((2,2)),nn.Conv2d(48,64,3,padding=1),nn.GroupNorm(8,64),nn.GELU(),nn.MaxPool2d((2,1)));self.head=nn.Sequential(nn.Flatten(),nn.Linear(64*16*3,256),nn.GELU(),nn.Dropout(.4),nn.Linear(256,4))
 def forward(self,x):
  h=self.encoder(x[:,None].transpose(2,3));return self.head(nn.functional.adaptive_avg_pool2d(h,(16,3)))

def main():
 torch.set_num_threads(4);torch.manual_seed(37);rng=np.random.default_rng(37);device='mps' if torch.backends.mps.is_available() else 'cpu';rows=json.loads((OUT/'events.json').read_text());x=np.load(OUT/'banks.npy').astype('float32');x-=x.mean((1,2),keepdims=True);x/=2;y=np.array([r['label'] for r in rows]);train=np.array([i for i,r in enumerate(rows) if r['split']=='train']);val=np.array([i for i,r in enumerate(rows) if r['split']=='validation']);weights=np.zeros(len(train))
 for j,i in enumerate(train):weights[j]=1/sum(rows[k]['domain']==rows[i]['domain'] and y[k]==y[i] for k in train)
 weights/=weights.sum();model=Acoustic().to(device);opt=torch.optim.AdamW(model.parameters(),lr=.0003,weight_decay=.02);ce=nn.CrossEntropyLoss();best=-1;stale=0;history=[]
 @torch.no_grad()
 def evaluate():
  model.eval();pred=[]
  for j in range(0,len(val),128):pred.extend(model(torch.tensor(x[val[j:j+128]],device=device)).argmax(1).cpu().tolist())
  return metrics([rows[i] for i in val],y[val],np.array(pred))
 for epoch in range(35):
  model.train();losses=[]
  for step in range(64):
   ids=rng.choice(train,64,p=weights);batch=x[ids].copy()
   for b in batch:
    b[:]=np.roll(b,int(rng.integers(-3,4)),axis=1)
    if rng.random()<.5:
     lo=int(rng.integers(0,116));b[:,lo:lo+int(rng.integers(3,13))]=b.mean()
   logits=model(torch.tensor(batch,device=device));loss=ce(logits,torch.tensor(y[ids],device=device));opt.zero_grad();loss.backward();nn.utils.clip_grad_norm_(model.parameters(),3);opt.step();losses.append(loss.item())
  result=evaluate();score=result['domainMeanMacroRecall'];row={'epoch':epoch+1,'loss':float(np.mean(losses)),**result};history.append(row);print(json.dumps(row),flush=True)
  if score>best:
   best=score;stale=0;torch.save({'state':model.state_dict(),'epoch':epoch+1,'classOrder':['hat','kick','snare','other']},OUT/'neural.pt');chosen=result
  else:stale+=1
  if stale>=9:break
 report={'selection':'Validation-only equal-domain macro recall; no locked test evaluation.','history':history,'selectedValidation':chosen};(OUT/'neural-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(chosen,indent=2),flush=True)
if __name__=='__main__':main()
