import json,numpy as np,torch
from scipy.io import wavfile
from scipy.signal import resample_poly
from transformers import Wav2Vec2Model
from pathlib import Path
from sklearn.metrics import accuracy_score
from sklearn.neighbors import KNeighborsClassifier
from catboost import CatBoostClassifier
labels=['hhc','hho','kd','sd'];rows=[r for r in json.load(open('artifacts/dataset.json')) if r['label'] in labels];y=np.array([r['label'] for r in rows]);p=np.array([int(r['participant'].split('_')[1]) for r in rows]);improv=np.array(['Improvisation' in r['file'] for r in rows]);torch.set_num_threads(4)
if Path('artifacts/wav2vec-embeddings.npy').exists():Z=np.load('artifacts/wav2vec-embeddings.npy')
else:
 model=Wav2Vec2Model.from_pretrained('facebook/wav2vec2-base-960h').eval().to('mps');cache={};out=[];batch=[];lengths=[]
 for i,r in enumerate(rows):
  path=f"artifacts/avp-full/AVP_Dataset/{r['mode']}/{r['participant']}/{r['file']}"
  if path not in cache:
   sr,a=wavfile.read(path);a=a.astype('float32');a=a.mean(axis=1) if a.ndim>1 else a;cache={path:resample_poly(a,160,441)}
  a=cache[path];start=max(0,int((r['time']-.01)*16000));end=min(len(a),int((r['time']+min(.47,r['duration']+.02))*16000));clip=a[start:end];clip=(clip-clip.mean())/(clip.std()+1e-7);pad=np.zeros(8000,dtype='float32');pad[:len(clip)]=clip;batch.append(pad);lengths.append(max(1,int((len(clip)-400)/320)+1))
  if len(batch)==32 or i==len(rows)-1:
   with torch.no_grad():h=model(torch.tensor(np.stack(batch),device='mps'),output_hidden_states=True).hidden_states
   h6=h[6].cpu().numpy();h12=h[12].cpu().numpy()
   for j,n in enumerate(lengths):out.append(np.concatenate([h6[j,:n].mean(0),h12[j,:n].mean(0)]))
   batch=[];lengths=[]
   if i%320==319:print('embedded',i+1,flush=True)
 Z=np.array(out);np.save('artifacts/wav2vec-embeddings.npy',Z)
train=p<=14;val=(p>=15)&(p<=20);test=p>=21
model=CatBoostClassifier(iterations=600,depth=5,learning_rate=.05,verbose=False,thread_count=4,allow_writing_files=False);model.fit(Z[train],y[train]);q=model.predict(Z).flatten();print('W2V val',accuracy_score(y[val],q[val]),'grooves',accuracy_score(y[val&improv],q[val&improv]),flush=True);print('W2V test',accuracy_score(y[test],q[test]),'grooves',accuracy_score(y[test&improv],q[test&improv]),flush=True)
for count in [3,5,10]:
 truth=[];pred=[]
 for person in range(21,29):
  for mode in ['Fixed','Personal']:
   match=(p==person)&np.array([r['mode']==mode for r in rows]);ref=[]
   for label in labels:ref.extend(np.where(match&~improv&(y==label))[0][:count])
   idx=np.where(match&improv)[0]
   if len(ref)<count*4 or not len(idx):continue
   knn=KNeighborsClassifier(n_neighbors=1).fit(Z[ref],y[ref]);truth.extend(y[idx]);pred.extend(knn.predict(Z[idx]))
 print('W2V profile',count,accuracy_score(truth,pred),len(truth),flush=True)
