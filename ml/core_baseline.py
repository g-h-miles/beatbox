"""Performer-disjoint core-three classifier; select only on performers 15–20.

Inputs use annotations for training and actual detector crop boundaries for tests.
The final cohort has been inspected in earlier experiments, not a fresh test.
"""
import json,pickle
from pathlib import Path
import numpy as np
from scipy.fft import dct
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.ensemble import ExtraTreesClassifier,HistGradientBoostingClassifier
from sklearn.metrics import confusion_matrix

OUT=Path('artifacts/core-model');OUT.mkdir(exist_ok=True,parents=True)
meta=json.loads(Path('artifacts/ml-v2/events.json').read_text())
bank=np.load('artifacts/ml-v2/fbanks.npy').astype(np.float32)
labels=['hat','kick','snare']; mapping={'hhc':0,'hho':0,'kd':1,'sd':2}
y=np.array([mapping.get(m['label'],-1) for m in meta])
# Keep onset evolution separately; padding supplies decay/duration evidence.
parts=[]
for lo,hi in [(0,3),(0,8),(3,12),(8,24),(0,48)]:
    z=bank[:,lo:hi]
    parts += [z.mean(1),z.std(1),dct(z.mean(1),type=2,norm='ortho')[:,:24]]
x=np.concatenate(parts,axis=1)
train=np.array([i for i,m in enumerate(meta) if m['participant']<=14 and m['kind']=='annotation' and y[i]>=0])
val=np.array([i for i,m in enumerate(meta) if 15<=m['participant']<=20 and m['kind']=='detection' and m['groove'] and y[i]>=0])
test=np.array([i for i,m in enumerate(meta) if 21<=m['participant']<=28 and m['kind']=='detection' and m['groove'] and y[i]>=0])
trials=[];best=None
for subset in ['all','grooves']:
    tr=train if subset=='all' else np.array([i for i in train if meta[i]['groove']])
    candidates=[(f'svc-{c}',make_pipeline(StandardScaler(),SVC(C=c,gamma='scale'))) for c in [1,10,100]]
    candidates += [('extra',ExtraTreesClassifier(n_estimators=500,min_samples_leaf=3,n_jobs=6,random_state=17)),('hist',HistGradientBoostingClassifier(max_iter=200,max_leaf_nodes=15,l2_regularization=5,random_state=17))]
    for name,model in candidates:
        model.fit(x[tr],y[tr]);p=model.predict(x[val]);score=float(np.mean(p==y[val]))
        row={'name':name,'trainingSubset':subset,'validation':score};trials.append(row);print(row,flush=True)
        if best is None or score>best[0]:best=(score,model,row)
model=best[1]
def evaluate(ix):
    p=model.predict(x[ix]);return {'correct':int(sum(p==y[ix])),'matchedEvents':len(ix),'classificationAccuracy':float(np.mean(p==y[ix])),'confusion':confusion_matrix(y[ix],p,labels=[0,1,2]).tolist(),'perPerformer':{str(n):float(np.mean(p[[meta[i]['participant']==n for i in ix]]==y[ix][[meta[i]['participant']==n for i in ix]])) for n in sorted(set(meta[i]['participant'] for i in ix))}}
report={'classes':labels,'split':'train1–14; select15–20; previously inspected test21–28','trials':trials,'selected':best[2],'validation':evaluate(val),'previouslyInspectedTest':evaluate(test)}
(OUT/'baseline-report.json').write_text(json.dumps(report,indent=2));pickle.dump(model,open(OUT/'baseline.pkl','wb'));np.save(OUT/'features.npy',x)
print(json.dumps(report,indent=2),flush=True)
