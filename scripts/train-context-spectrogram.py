"""Experimental audio model; split by performer, never randomly by hit."""
import json, os, numpy as np, torch
from pathlib import Path
from scipy.io import wavfile
from scipy.signal import resample_poly
from sklearn.metrics import accuracy_score,confusion_matrix
from torch import nn
from torch.utils.data import TensorDataset, DataLoader
labels=['hhc','hho','kd','sd'];torch.manual_seed(42);np.random.seed(42);torch.set_num_threads(4)
rows=[r for r in json.load(open('artifacts/dataset.json')) if r['label'] in labels]
y=np.array([labels.index(r['label']) for r in rows]);p=np.array([int(r['participant'].split('_')[1]) for r in rows]);improv=np.array(['Improvisation' in r['file'] for r in rows])
# HTK triangular mel bank, fixed 22.05kHz / 1024 FFT / 176 sample hop.
nfft=1024; sr=22050; hop=176; frames=48; bands=64
mel=lambda h:2595*np.log10(1+h/700);hz=lambda m:700*(10**(m/2595)-1)
points=hz(np.linspace(mel(40),mel(11000),bands+2));freqs=np.arange(513)*sr/nfft
bank=np.maximum(0,np.minimum((freqs[None,:]-points[:-2,None])/(points[1:-1,None]-points[:-2,None]),(points[2:,None]-freqs[None,:])/(points[2:,None]-points[1:-1,None]))).astype('float32')
if Path('artifacts/spectrograms-context.npy').exists():X=np.load('artifacts/spectrograms-context.npy')
else:
 X=np.zeros((len(rows),1,bands,frames),dtype='float32');cache={};window=np.hanning(nfft)
 for i,r in enumerate(rows):
  path=f"artifacts/avp-full/AVP_Dataset/{r['mode']}/{r['participant']}/{r['file']}"
  if path not in cache:
   rate,a=wavfile.read(path);a=a.astype('float32')/(32768 if a.dtype==np.int16 else 1)
   if a.ndim>1:a=a.mean(axis=1)
   cache={path:resample_poly(a,1,2) if rate==44100 else resample_poly(a,sr,rate)}
  a=cache[path];start=int(r['time']*sr);end=min(len(a),int((rows[i+1]['time'] if i+1<len(rows) and rows[i+1]['file']==r['file'] else r['time']+.43)*sr));clip=np.zeros(nfft+hop*(frames-1));length=min(end-start,len(clip));clip[:length]=a[start:start+length]
  stack=np.stack([clip[j*hop:j*hop+nfft]*window for j in range(frames)]);power=np.abs(np.fft.rfft(stack))**2;m=bank@power.T
  m=np.log10(np.maximum(m/max(m.max(),1e-12),1e-6));X[i,0]=m
  if i%1000==0:print('features',i,flush=True)
 np.save('artifacts/spectrograms-context.npy',X)
class Network(nn.Module):
 def __init__(self):
  super().__init__();self.layers=nn.Sequential(nn.Conv2d(1,16,3,padding=1),nn.BatchNorm2d(16),nn.ReLU(),nn.MaxPool2d(2),nn.Conv2d(16,32,3,padding=1),nn.BatchNorm2d(32),nn.ReLU(),nn.MaxPool2d(2),nn.Conv2d(32,64,3,padding=1),nn.BatchNorm2d(64),nn.ReLU(),nn.MaxPool2d(2),nn.Flatten(),nn.Linear(64*8*6,128),nn.ReLU(),nn.Dropout(.4),nn.Linear(128,4))
 def forward(self,x):return self.layers(x)
device='mps' if torch.backends.mps.is_available() else 'cpu';print('device',device,flush=True)
model=Network().to(device);optim=torch.optim.AdamW(model.parameters(),lr=.0005,weight_decay=.02);loss=nn.CrossEntropyLoss();train=p<=14;val=(p>=15)&(p<=20)
loader=DataLoader(TensorDataset(torch.from_numpy(X[train]),torch.from_numpy(y[train])),batch_size=64,shuffle=True)
def predictions(mask):
 model.eval();out=[]
 with torch.no_grad():
  for batch in np.array_split(X[mask],max(1,int(sum(mask)/128))):out.append(model(torch.from_numpy(batch).to(device)).cpu().numpy())
 return np.concatenate(out).argmax(1)
best=0
for epoch in range(50):
 model.train()
 for a,b in loader:
  a=a.to(device);b=b.to(device)
  # Light variation in spectral position and background floor.
  if torch.rand(1).item()<.5:a=torch.roll(a,int(torch.randint(-2,3,(1,)).item()),dims=2)
  a=a+torch.randn_like(a)*.08
  optim.zero_grad();l=loss(model(a),b);l.backward();optim.step()
 pred=predictions(val);score=accuracy_score(y[val],pred)
 print(epoch,round(score,4),round(accuracy_score(y[val&improv],pred[improv[val]]),4),flush=True)
 if score>best:
  best=score;torch.save(model.cpu().state_dict(),'artifacts/spectrogram-context-model.pt');model.to(device)
model.load_state_dict(torch.load('artifacts/spectrogram-context-model.pt',weights_only=True));test=p>=21;pred=predictions(test);print('FINAL TEST',accuracy_score(y[test],pred),'GROOVES',accuracy_score(y[test&improv],pred[improv[test]]),confusion_matrix(y[test],pred).tolist(),flush=True)
