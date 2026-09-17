"""Binary core-vs-other feasibility, using existing public training/validation.

Fixed RBF SVC C3. Set a conservative threshold using fourfold voice-grouped
training predictions only: no more than5% false-core calls on either training
other domain. Validation never selects the threshold. Not end-to-end scoring.
"""
import json,pickle
from pathlib import Path
import numpy as np
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
OUT=Path('artifacts/core-other-gate');OUT.mkdir(parents=True,exist_ok=True)

def weights(rows,y):
 w=np.array([1/sum(r['domain']==s['domain'] and a==b for s,b in zip(rows,y)) for r,a in zip(rows,y)]);return w*len(w)/w.sum()
def estimator():return make_pipeline(StandardScaler(),SVC(C=3,gamma='scale'))
def metrics(rows,y,scores,threshold):
 result={}
 for domain in sorted({r['domain'] for r in rows}):
  ix=np.array([i for i,r in enumerate(rows) if r['domain']==domain]);actual=y[ix];pred=scores[ix]>threshold;core=actual==1;other=~core
  result[domain]={'events':len(ix),'core':int(core.sum()),'other':int(other.sum()),'coreCorrect':int(pred[core].sum()),'otherCorrect':int((~pred[other]).sum()),'coreRecall':float(pred[core].mean()) if core.any() else None,'otherRecall':float((~pred[other]).mean()) if other.any() else None}
 return result

def main():
 allrows=json.loads(Path('artifacts/core-model/mdv/events.json').read_text());allx=np.load('artifacts/core-model/mdv/features.npy');tr=np.array([i for i,r in enumerate(allrows) if r['split']=='train']);va=np.array([i for i,r in enumerate(allrows) if r['split']=='validation']);rows=[allrows[i] for i in tr];y=np.array([int(r['label']<3) for r in rows]);x=allx[tr];groups=np.array([r['domain']+':'+str(r.get('participant',r['file'])) for r in rows]);scores=np.empty(len(rows))
 for fold,(fit,check) in enumerate(StratifiedGroupKFold(n_splits=4,shuffle=True,random_state=1709).split(x,y,groups)):
  model=estimator();model.fit(x[fit],y[fit],svc__sample_weight=weights([rows[i] for i in fit],y[fit]));scores[check]=model.decision_function(x[check]);print('Training-only fold',fold,len(fit),len(check),flush=True)
 thresholds={}
 for domain in ['beatboxset','mdv']:
  vals=np.sort(scores[[i for i,r in enumerate(rows) if r['domain']==domain and y[i]==0]]);thresholds[domain]=float(vals[min(len(vals)-1,int(np.ceil(.95*len(vals)))-1)])
 threshold=max(thresholds.values());model=estimator();model.fit(x,y,svc__sample_weight=weights(rows,y));vr=[allrows[i] for i in va];vy=np.array([int(r['label']<3) for r in vr]);vs=model.decision_function(allx[va]);report={'protocol':__doc__,'trainingGroups':len(set(groups)),'threshold':threshold,'trainingDomainThresholds':thresholds,'trainingOOF':metrics(rows,y,scores,threshold),'validationDefaultMargin':metrics(vr,vy,vs,0),'validationConservative':metrics(vr,vy,vs,threshold),'limitations':['Existing per-crop validation only; not onset or full-transcription accuracy.','Other means MDV cymbal/tom and Beatboxset breath/misc/vocal; not seven-class semantics.','Old offline descriptors; no browser parity or production integration.','Reserved MDV11–13, VIS, AVP21–28 and private recordings not accessed.']};(OUT/'report.json').write_text(json.dumps(report,indent=2));pickle.dump(model,open(OUT/'gate.pkl','wb'));print(json.dumps(report,indent=2),flush=True)
if __name__=='__main__':main()
