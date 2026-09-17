import json,pickle,numpy as np
from sklearn.metrics import accuracy_score
rows=[r for r in json.load(open('artifacts/dataset.json')) if r['label'] in ['kd','sd','hhc','hho']]
keys=['duration','centroid','low','mid','high','flatness','zcr','attack']
X=np.array([r['features']['acoustic']+r['features']['spectrum']+[r['features'][k] for k in keys] for r in rows]);y=np.array([r['label'] for r in rows]);p=np.array([int(r['participant'].split('_')[1]) for r in rows]);val=(p>=15)&(p<=20);improv=np.array(['Improvisation' in r['file'] for r in rows]);files=np.array([r['file'] for r in rows]);S=np.array([r['features']['spectrum'] for r in rows]);D=np.array([r['features']['duration'] for r in rows]);
model=pickle.load(open('artifacts/model-cat.pkl','rb'));prob=model.predict_proba(X);labels=model.classes_
for sigma in [.15,.3,.5,.8]:
 for blend in [.5,1]:
  out=prob.copy()
  for f in set(files[val]):
   idx=np.where(files==f)[0];s=S[idx];d=D[idx];dist=np.mean((s[:,None,:]-s[None,:,:])**2,axis=2)+.1*(np.log(d[:,None]/d[None,:]))**2
   w=np.exp(-dist/sigma**2);w/=w.sum(axis=1,keepdims=True);out[idx]=blend*w@prob[idx]+(1-blend)*prob[idx]
  pred=labels[out.argmax(axis=1)];print(sigma,blend,accuracy_score(y[val],pred[val]),accuracy_score(y[val&improv],pred[val&improv]),flush=True)
