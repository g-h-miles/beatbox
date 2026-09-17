"""Unlabeled within-recording timbre consistency, selected on validation only.

No class is assumed present. Every detection contributes, including unmatched
ones; evaluation labels are read only after inference. This tests an assumption,
not a claim clustering can resolve ambiguous vocal articulation.
"""
import json,pickle
from pathlib import Path
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics import confusion_matrix
OUT=Path('artifacts/core-model')
m=json.loads(Path('artifacts/ml-v2/events.json').read_text());x=np.load(OUT/'features.npy');model=pickle.load(open(OUT/'baseline.pkl','rb'))
mp={'hhc':0,'hho':0,'kd':1,'sd':2};y=np.array([mp.get(v['label'],-1) for v in m]); tr=[i for i,v in enumerate(m) if v['participant']<=14 and v['kind']=='annotation' and y[i]>=0]
scale=StandardScaler().fit(x[tr]);z=scale.transform(x)
# Continuous scaled acoustic distances, not classifier-leaf distances.
p=model.predict_proba(x)
def infer(lo,hi,nc,blend):
    rows=[i for i,v in enumerate(m) if lo<=v['participant']<=hi and v['kind']=='detection' and v['groove']]
    result=p[rows].copy()
    files=sorted(set(m[i]['file'] for i in rows))
    for f in files:
        local=np.array([j for j,i in enumerate(rows) if m[i]['file']==f]); ix=np.array(rows)[local]
        clusters=AgglomerativeClustering(n_clusters=min(nc,len(ix)),linkage='ward').fit_predict(z[ix])
        for c in set(clusters):
            ids=local[clusters==c];result[ids]=(1-blend)*result[ids]+blend*result[ids].mean(0)
    valid=y[rows]>=0;pred=result.argmax(1)[valid];truth=y[rows][valid]
    return {'correct':int(sum(pred==truth)),'matched':len(truth),'classification':float(np.mean(pred==truth)),'confusion':confusion_matrix(truth,pred).tolist()}
best=None;trials=[]
for nc in [2,3,4,5,6,8,12]:
    for blend in [.25,.5,.75,1]:
        r=infer(15,20,nc,blend);trials.append({'clusters':nc,'blend':blend,**r}); print(nc,blend,r['classification'],flush=True)
        if best is None or r['classification']>best[0]:best=(r['classification'],nc,blend,r)
report={'validationSelected':best[3],'settings':{'clusters':best[1],'blend':best[2]},'trials':trials,'previouslyInspectedTest':infer(21,28,best[1],best[2])};(OUT/'consistency-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2),flush=True)
