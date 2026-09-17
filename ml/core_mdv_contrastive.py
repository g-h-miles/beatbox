"""Cross-voice supervised contrastive embedding with timbre-normalized channel.

Concrete change from generic CNN: channel 2 subtracts each frequency's temporal
mean, preserving attack/body ratios while suppressing stable voice/mic color.
Supervised contrastive positives must share a drum class but differ in voice;
same-voice/same-class pairs are excluded from the contrastive denominator.
Classifier uses train-only embedding prototypes or cosine kNN, selected on the
same three-domain validation macro recall. Reserved test files remain untouched.
"""
import json
from pathlib import Path
import numpy as np
import torch
from torch import nn
from core_mdv_classical import metrics
OUT=Path('artifacts/core-model/mdv')

class Encoder(nn.Module):
 def __init__(self):
  super().__init__();self.features=nn.Sequential(nn.Conv2d(2,24,5,padding=2),nn.GroupNorm(4,24),nn.GELU(),nn.MaxPool2d((2,2)),nn.Conv2d(24,48,3,padding=1),nn.GroupNorm(8,48),nn.GELU(),nn.MaxPool2d((2,2)),nn.Conv2d(48,64,3,padding=1),nn.GroupNorm(8,64),nn.GELU(),nn.MaxPool2d((2,1)));self.project=nn.Sequential(nn.Flatten(),nn.Linear(64*16*3,256),nn.GELU(),nn.Dropout(.2),nn.Linear(256,128));self.classifier=nn.Linear(128,4)
 def forward(self,x):
  relative=x-x.mean(1,keepdim=True);channels=torch.stack((x,relative),1).transpose(2,3);h=nn.functional.adaptive_avg_pool2d(self.features(channels),(16,3));z=nn.functional.normalize(self.project(h),dim=1);return z,self.classifier(z)*10

def contrastive(z,labels,voices):
 similar=labels[:,None]==labels[None];different=voices[:,None]!=voices[None];positive=similar&different;denominator=(~similar)|different;logits=z@z.T/.1;logits=logits-logits.max(1,keepdim=True).values.detach();logden=torch.logsumexp(logits.masked_fill(~denominator,-1e4),1);positive_count=positive.sum(1);valid=positive_count>0;loss=-((logits-logden[:,None])*positive).sum(1)/positive_count.clamp_min(1);return loss[valid].mean()

def main():
 torch.set_num_threads(4);torch.manual_seed(101);rng=np.random.default_rng(101);device='mps' if torch.backends.mps.is_available() else 'cpu';rows=json.loads((OUT/'events.json').read_text());x=np.load(OUT/'banks.npy').astype('float32');x-=x.mean((1,2),keepdims=True);x/=2;y=np.array([r['label'] for r in rows]);train=np.array([i for i,r in enumerate(rows) if r['split']=='train']);val=np.array([i for i,r in enumerate(rows) if r['split']=='validation']);names=[r['domain']+':'+str(r.get('participant',r['file'])) for r in rows];unique=sorted(set(names));voices=np.array([unique.index(n) for n in names]);weights=np.zeros(len(train))
 for j,i in enumerate(train):weights[j]=1/sum(rows[k]['domain']==rows[i]['domain'] and y[k]==y[i] for k in train)
 weights/=weights.sum();model=Encoder().to(device);opt=torch.optim.AdamW(model.parameters(),lr=.0003,weight_decay=.02);ce=nn.CrossEntropyLoss();best=-1;stale=0;history=[]
 @torch.no_grad()
 def embed(ids):
  model.eval();result=[]
  for offset in range(0,len(ids),128):result.append(model(torch.tensor(x[ids[offset:offset+128]],device=device))[0].cpu().numpy())
  return np.concatenate(result)
 def evaluate():
  reference=embed(train);query=embed(val);similarities=query@reference.T;choices=[]
  for k in [1,5,15]:
   near=np.argpartition(-similarities,k-1,axis=1)[:,:k];votes=np.zeros((len(val),4))
   # Similarity-weighted voting; prototype alternative removes count priors.
   for j,indices in enumerate(near):
    for index in indices:votes[j,y[train[index]]]+=float(np.exp(similarities[j,index]/.1))
   p=votes.argmax(1);result=metrics([rows[i] for i in val],y[val],p);choices.append((result['domainMeanMacroRecall'],{'kind':'knn','neighbors':k},result))
  prototypes=np.stack([reference[y[train]==c].mean(0) for c in range(4)]);prototypes/=np.linalg.norm(prototypes,axis=1,keepdims=True);p=(query@prototypes.T).argmax(1);result=metrics([rows[i] for i in val],y[val],p);choices.append((result['domainMeanMacroRecall'],{'kind':'prototype'},result));return max(choices,key=lambda c:c[0]),reference,query
 for epoch in range(30):
  model.train();losses=[];ces=[];cons=[]
  for step in range(64):
   ids=rng.choice(train,64,p=weights);batch=x[ids].copy()
   for b in batch:
    b[:]=np.roll(b,int(rng.integers(-3,4)),axis=1)
    # Smooth spectral tilt augmentation models channel/voice color explicitly.
    b+=np.linspace(-1,1,128,dtype=np.float32)[None]*rng.normal(0,.15)
    if rng.random()<.4:
     lo=int(rng.integers(0,116));b[:,lo:lo+int(rng.integers(3,13))]=b.mean()
   z,logits=model(torch.tensor(batch,device=device));target=torch.tensor(y[ids],device=device);speaker=torch.tensor(voices[ids],device=device);classification=ce(logits,target);invariance=contrastive(z,target,speaker);loss=classification+.25*invariance;opt.zero_grad();loss.backward();nn.utils.clip_grad_norm_(model.parameters(),3);opt.step();losses.append(loss.item());ces.append(classification.item());cons.append(invariance.item())
  chosen,reference,query=evaluate();score,rule,result=chosen;row={'epoch':epoch+1,'loss':float(np.mean(losses)),'classificationLoss':float(np.mean(ces)),'contrastiveLoss':float(np.mean(cons)),'classifier':rule,**result};history.append(row);print(json.dumps(row),flush=True)
  if score>best:
   best=score;stale=0;torch.save({'state':model.state_dict(),'epoch':epoch+1,'classOrder':['hat','kick','snare','other'],'classifier':rule},OUT/'contrastive.pt');np.savez_compressed(OUT/'contrastive-reference.npz',embeddings=reference,labels=y[train],voices=voices[train]);chosen_result=row
  else:stale+=1
  if stale>=8:break
 report={'selection':'Validation-only domain macro recall; no reserved test evaluation.','method':'Cross-voice supervised contrastive loss + temporal per-frequency centering + spectral tilt augmentation; train-only cosine neighbors/prototypes.','history':history,'selectedValidation':chosen_result};(OUT/'contrastive-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(chosen_result,indent=2),flush=True)
if __name__=='__main__':main()
