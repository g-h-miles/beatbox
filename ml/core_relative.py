"""Unsupervised recording-relative timbre descriptors. No calibration labels.

Statistics use every detection at inference, including unmatched ones. Grooves
only are used to train because single-instrument files destroy relative context.
"""
import json,pickle
from pathlib import Path
import numpy as np
from scipy.fft import dct
from sklearn.ensemble import ExtraTreesClassifier,HistGradientBoostingClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.metrics import confusion_matrix
OUT=Path('artifacts/core-model');m=json.loads(Path('artifacts/ml-v2/events.json').read_text()); bank=np.load('artifacts/ml-v2/fbanks.npy').astype('float32')
mp={'hhc':0,'hho':0,'kd':1,'sd':2};y=np.array([mp.get(v['label'],-1) for v in m]);parts=[]
for lo,hi in [(0,2),(2,10),(10,25),(0,10)]:
 z=bank[:,lo:hi];a=z.mean(1);parts.extend([a-a.mean(1,keepdims=True),z.std(1),dct(a,type=2,norm='ortho')[:,1:21]])
x=np.concatenate(parts,1);rel=np.zeros_like(x);std=np.zeros_like(x)
for f in sorted(set(v['file'] for v in m)):
 for kind in ['annotation','detection']:
  ix=[i for i,v in enumerate(m) if v['file']==f and v['kind']==kind]
  if not ix:continue
  center=np.median(x[ix],0);spread=np.std(x[ix],0)+.1;rel[ix]=x[ix]-center;std[ix]=rel[ix]/spread
tr=np.array([i for i,v in enumerate(m) if v['participant']<=14 and v['kind']=='annotation' and v['groove'] and y[i]>=0]);val=np.array([i for i,v in enumerate(m) if 15<=v['participant']<=20 and v['kind']=='detection' and v['groove'] and y[i]>=0]);test=np.array([i for i,v in enumerate(m) if 21<=v['participant']<=28 and v['kind']=='detection' and v['groove'] and y[i]>=0])
best=None;trials=[]
for view,features in [('relative',rel),('standardized',std),('absolute-relative',np.c_[x,rel])]:
 for name,model in [('svc',make_pipeline(StandardScaler(),SVC(C=3,gamma='scale'))),('extra',ExtraTreesClassifier(n_estimators=500,min_samples_leaf=3,n_jobs=6,random_state=17)),('hist',HistGradientBoostingClassifier(max_iter=150,max_leaf_nodes=9,l2_regularization=10,random_state=17))]:
  model.fit(features[tr],y[tr]);p=model.predict(features[val]);s=float(np.mean(p==y[val]));row={'view':view,'model':name,'validation':s};trials.append(row);print(row,flush=True)
  if best is None or s>best[0]:best=(s,model,features,row)
s,model,features,config=best
p=model.predict(features[test]);report={'trials':trials,'selected':config,'previouslyInspectedTest':{'correct':int(sum(p==y[test])),'matched':len(test),'classification':float(np.mean(p==y[test])),'confusion':confusion_matrix(y[test],p).tolist()}}
(OUT/'relative-report.json').write_text(json.dumps(report,indent=2));pickle.dump(model,open(OUT/'relative.pkl','wb'));print(json.dumps(report,indent=2),flush=True)
