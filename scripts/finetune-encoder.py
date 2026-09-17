"""Fine-tune a pretrained acoustic encoder; select only on held-out validation voices."""
import json, numpy as np, torch
from pathlib import Path
from scipy.io import wavfile
from scipy.signal import resample_poly
from transformers import Wav2Vec2Model
from torch import nn
from torch.utils.data import TensorDataset,DataLoader
from sklearn.metrics import accuracy_score,confusion_matrix
labels=['hhc','hho','kd','sd'];rows=[r for r in json.load(open('artifacts/dataset.json')) if r['label'] in labels]
y=np.array([labels.index(r['label']) for r in rows]);p=np.array([int(r['participant'].split('_')[1]) for r in rows]);imp=np.array(['Improvisation' in r['file'] for r in rows]);torch.manual_seed(42);np.random.seed(42);torch.set_num_threads(4)
if Path('artifacts/encoder-inputs.npz').exists():data=np.load('artifacts/encoder-inputs.npz');X=data['X'];L=data['L']
else:
 X=np.zeros((len(rows),8000),dtype='float32');L=np.zeros(len(rows),dtype='int64');cache={}
 for i,r in enumerate(rows):
  path=f"artifacts/avp-full/AVP_Dataset/{r['mode']}/{r['participant']}/{r['file']}"
  if path not in cache:
   sr,a=wavfile.read(path);a=a.astype('float32');a=a.mean(axis=1) if a.ndim>1 else a;cache={path:resample_poly(a,16000,sr)}
  a=cache[path];start=max(0,int((r['time']-.01)*16000));end=min(len(a),int((r['time']+min(.47,r['duration']+.02))*16000));clip=a[start:end];clip=(clip-clip.mean())/(clip.std()+1e-7);X[i,:len(clip)]=clip;L[i]=max(1,int((len(clip)-400)/320)+1)
 np.savez('artifacts/encoder-inputs.npz',X=X,L=L)
class Model(nn.Module):
 def __init__(self):
  super().__init__();self.encoder=Wav2Vec2Model.from_pretrained('facebook/wav2vec2-base-960h', attn_implementation='eager');self.encoder.encoder.layers=nn.ModuleList(list(self.encoder.encoder.layers)[:8]);self.encoder.config.mask_time_prob=0.;self.encoder.config.mask_feature_prob=0.
  for par in self.encoder.parameters():par.requires_grad=False
  for layer in self.encoder.encoder.layers[-2:]:
   for par in layer.parameters():par.requires_grad=True
  self.head=nn.Sequential(nn.Linear(1537,128),nn.ReLU(),nn.Dropout(.3),nn.Linear(128,4))
 def forward(self,x,length):
  h=self.encoder(x).last_hidden_state;mask=(torch.arange(h.shape[1],device=h.device)[None,:]<length[:,None]).unsqueeze(-1);n=mask.sum(1).clamp(min=1);mean=(h*mask).sum(1)/n;std=(((h-mean[:,None])**2*mask).sum(1)/n+1e-6).sqrt();return self.head(torch.cat([mean,std,length[:,None]/24.],1))
device='mps';model=Model().to(device);train=p<=14;val=(p>=15)&(p<=20);test=p>=21;loader=DataLoader(TensorDataset(torch.from_numpy(X[train]),torch.from_numpy(L[train]),torch.from_numpy(y[train])),batch_size=32,shuffle=True)
opt=torch.optim.AdamW([{'params':[v for v in model.encoder.parameters() if v.requires_grad],'lr':2e-5},{'params':model.head.parameters(),'lr':3e-4}],weight_decay=.01);criterion=nn.CrossEntropyLoss();best=0
@torch.no_grad()
def predict(mask):
 model.eval();out=[]
 idx=np.where(mask)[0]
 for at in range(0,len(idx),64):
  i=idx[at:at+64];out.append(model(torch.from_numpy(X[i]).to(device),torch.from_numpy(L[i]).to(device)).cpu().numpy())
 return np.concatenate(out)
for epoch in range(20):
 model.train();model.encoder.feature_extractor.eval();total=0
 for a,l,b in loader:
  a=a.to(device);l=l.to(device);b=b.to(device);a=a+torch.randn_like(a)*.02
  opt.zero_grad();loss=criterion(model(a,l),b);loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1);opt.step();total+=loss.item()
 q=predict(val).argmax(1);score=accuracy_score(y[val],q);print('epoch',epoch,'loss',total/len(loader),'val',score,'grooves',accuracy_score(y[val&imp],q[imp[val]]),flush=True)
 if score>best:best=score;torch.save(model.cpu().state_dict(),'artifacts/finetuned-encoder.pt');model.to(device)
model.load_state_dict(torch.load('artifacts/finetuned-encoder.pt',weights_only=True));q=predict(test).argmax(1);report={'accuracy':accuracy_score(y[test],q),'grooveAccuracy':accuracy_score(y[test&imp],q[imp[test]]),'confusion':confusion_matrix(y[test],q).tolist()};json.dump(report,open('artifacts/finetuned-report.json','w'),indent=2);print('TEST',report,flush=True)
