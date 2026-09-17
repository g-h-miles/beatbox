"""Paired independent-MLP vs event-sequence Transformer validation experiment.

Protocol: train AVP1–14 groove sequences; validation15–20; no21–28 evaluation.
Actual neural detections and their times are retained, including unmatched hits.
PCA and scaler fit training events only. Selection uses labeled end-to-end F1,
counting all extra/missing detections. No tempo, grid or downbeat label supplied.
"""
import argparse,json,pickle,math
from pathlib import Path
import numpy as np
import torch
from torch import nn
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import confusion_matrix
OUT=Path('artifacts/core-model/sequence')

class Model(nn.Module):
 def __init__(self,kind,dimensions):
  super().__init__();self.kind=kind;self.input=nn.Sequential(nn.Linear(dimensions,128),nn.LayerNorm(128),nn.GELU(),nn.Dropout(.15))
  if kind=='transformer':
   layer=nn.TransformerEncoderLayer(128,4,256,dropout=.15,activation='gelu',batch_first=True,norm_first=True);self.context=nn.TransformerEncoder(layer,2,enable_nested_tensor=False)
  else:self.context=nn.Sequential(nn.Linear(128,256),nn.GELU(),nn.Dropout(.15),nn.Linear(256,128),nn.LayerNorm(128),nn.GELU())
  self.output=nn.Linear(128,3)
 def forward(self,x,padding):
  h=self.input(x)
  if self.kind=='transformer':
   # Generic order encoding; it does not assert musical meter or a downbeat.
   positions=torch.arange(x.shape[1],device=x.device,dtype=x.dtype)[:,None];frequency=torch.exp(torch.arange(0,128,2,device=x.device,dtype=x.dtype)*(-math.log(10000)/128));encoding=torch.zeros((x.shape[1],128),device=x.device,dtype=x.dtype);encoding[:,0::2]=torch.sin(positions*frequency);encoding[:,1::2]=torch.cos(positions*frequency);h=self.context(h+encoding[None]*.1,src_key_padding_mask=padding)
  else:h=self.context(h)
  return self.output(h)

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--kind',choices=['mlp','transformer'],required=True);args=parser.parse_args();torch.set_num_threads(4);torch.manual_seed(113);rng=np.random.default_rng(113);device='mps' if torch.backends.mps.is_available() else 'cpu';records=json.loads((OUT/'records.json').read_text());cache=np.load(OUT/'sequences.npz');train=[r['index'] for r in records if r['split']=='train'];val=[r['index'] for r in records if r['split']=='validation'];pca=PCA(n_components=64,whiten=True,random_state=113).fit(np.concatenate([cache[f'x{i}'] for i in train]));raw=[np.c_[pca.transform(cache[f'x{i}']),cache[f'r{i}']] for i in range(len(records))];scaler=StandardScaler().fit(np.concatenate([raw[i] for i in train]));x=[scaler.transform(a).astype('float32') for a in raw];y=[cache[f'y{i}'] for i in range(len(records))];model=Model(args.kind,x[0].shape[1]).to(device);opt=torch.optim.AdamW(model.parameters(),lr=.0003,weight_decay=.03);ce=nn.CrossEntropyLoss(ignore_index=-100);best=-1;stale=0;history=[]
 def batch(ids,augment):
  xx=[];yy=[]
  for i in ids:
   a=x[i].copy();b=y[i].copy()
   if augment:
    # Random subsequences prevent identifying a drum from a fixed song position.
    if len(a)>24 and rng.random()<.5:
     size=int(rng.integers(24,len(a)+1));start=int(rng.integers(0,len(a)-size+1));a=a[start:start+size];b=b[start:start+size]
    a[:,:64]+=rng.normal(0,.04,a[:,:64].shape).astype('float32')
   xx.append(a);yy.append(b)
  n=max(map(len,xx));features=np.zeros((len(ids),n,x[0].shape[1]),dtype='float32');labels=np.full((len(ids),n),-100,dtype='int64');padding=np.ones((len(ids),n),dtype=bool)
  for j,(a,b) in enumerate(zip(xx,yy)):features[j,:len(a)]=a;labels[j,:len(b)]=b;padding[j,:len(a)]=False
  return torch.tensor(features,device=device),torch.tensor(labels,device=device),torch.tensor(padding,device=device)
 @torch.no_grad()
 def evaluate():
  model.eval();truth=[];predicted=[];details=[];detected=annotated=matched=correct=0
  for i in val:
   a,b,pad=batch([i],False);p=model(a,pad)[0].argmax(1).cpu().numpy();valid=y[i]>=0;target=y[i][valid];guess=p[valid];ncorrect=int(np.sum(target==guess));truth.extend(target);predicted.extend(guess);r=records[i];detected+=r['detected'];annotated+=r['annotated'];matched+=r['matched'];correct+=ncorrect;details.append({'file':r['file'],'mode':r['mode'],'detected':r['detected'],'annotated':r['annotated'],'matched':r['matched'],'correct':ncorrect,'predictions':p.tolist()})
  return {'detected':detected,'annotated':annotated,'matched':matched,'correct':correct,'classificationAccuracy':correct/matched,'onsetF1':2*matched/(detected+annotated),'endToEndF1':2*correct/(detected+annotated),'confusion':confusion_matrix(truth,predicted,labels=[0,1,2]).tolist(),'recordings':details}
 for epoch in range(40):
  model.train();losses=[]
  for step in range(24):
   ids=rng.choice(train,8);a,b,pad=batch(ids,True);logits=model(a,pad);loss=ce(logits.reshape(-1,3),b.reshape(-1));opt.zero_grad();loss.backward();nn.utils.clip_grad_norm_(model.parameters(),3);opt.step();losses.append(loss.item())
  result=evaluate();row={'epoch':epoch+1,'loss':float(np.mean(losses)),**{k:v for k,v in result.items() if k!='recordings'}};history.append(row);print(json.dumps(row),flush=True);score=result['endToEndF1']
  if score>best:
   best=score;stale=0;torch.save({'state':model.state_dict(),'kind':args.kind,'dimensions':x[0].shape[1],'epoch':epoch+1},OUT/f'{args.kind}.pt');chosen=result;selected_epoch=epoch+1
  else:stale+=1
  if stale>=8:break
 pickle.dump({'pca':pca,'scaler':scaler},open(OUT/f'{args.kind}-preprocessing.pkl','wb'));report={'kind':args.kind,'selection':'Train1–14; validation15–20 only; no21–28 evaluation. 40epoch cap/patience8. Same input features, onsets, supervision, optimizer and batch schedule for both models.','classes':['hat','kick','snare'],'parameters':sum(p.numel() for p in model.parameters()),'selectedEpoch':selected_epoch,'history':history,'validation':chosen};(OUT/f'{args.kind}-report.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='history'},indent=2),flush=True)
if __name__=='__main__':main()
