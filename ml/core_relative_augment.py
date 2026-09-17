"""Training-only relative-context augmentation from isolated public AVP hits.

Combine isolated examples from the same training participant and articulation
mode into unlabeled normalization contexts. No audio is synthesized and no
validation events enter fitting. Evaluate only P15–20 frozen neural detections.
Two predeclared candidates, C=3, isolated-example sample weight0.5.
"""
import json, pickle
from pathlib import Path
import numpy as np
from scipy.fft import dct
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.metrics import confusion_matrix
OUT=Path('artifacts/core-model/relative-augment');OUT.mkdir(parents=True,exist_ok=True)
MAP={'hhc':0,'hho':0,'kd':1,'sd':2}

def normalize(x):return (x-np.median(x,axis=0))/(x.std(axis=0)+.1)

def main():
 meta=json.loads(Path('artifacts/ml-v2/events.json').read_text())
 # Index before materializing banks; evaluation/test banks never enter this view.
 ix=np.array([i for i,r in enumerate(meta) if r['participant']<=14 and r['kind']=='annotation' and r['label'] in MAP])
 rows=[meta[i] for i in ix];banks=np.load('artifacts/ml-v2/fbanks.npy',mmap_mode='r')[ix].astype('float32');parts=[]
 for lo,hi in [(0,2),(2,10),(10,25),(0,10)]:
  z=banks[:,lo:hi];a=z.mean(1);parts.extend([a-a.mean(1,keepdims=True),z.std(1),dct(a,type=2,norm='ortho')[:,1:21]])
 x=np.concatenate(parts,axis=1);y=np.array([MAP[r['label']] for r in rows]);origx=[];origy=[]
 for file in sorted({r['file'] for r in rows if r['groove']}):
  take=np.array([i for i,r in enumerate(rows) if r['file']==file]);origx.append(normalize(x[take]));origy.append(y[take])
 origx=np.concatenate(origx);origy=np.concatenate(origy)
 seq=json.loads(Path('artifacts/core-model/sequence/records.json').read_text());data=np.load('artifacts/core-model/sequence/sequences.npz');val=[r for r in seq if r['split']=='validation'];vx=np.concatenate([data[f"x{r['index']}"] for r in val]);vy=np.concatenate([data[f"y{r['index']}"] for r in val]);valid=vy>=0;detected=len(vx);refs=sum(r['annotated'] for r in val)
 def score(model):
  predicted=model.predict(vx);correct=int((predicted[valid]==vy[valid]).sum());return {'correct':correct,'matched':int(valid.sum()),'detected':detected,'references':refs,'coreAccuracy':correct/int(valid.sum()),'coreJointF1':2*correct/(detected+refs),'confusion':confusion_matrix(vy[valid],predicted[valid],labels=[0,1,2]).tolist()}
 baseline=pickle.load(open('artifacts/core-model/relative.pkl','rb'));report={'protocol':__doc__,'baseline':score(baseline),'trials':[]};assert report['baseline']['correct']==592,report['baseline']
 for strategy in ['pooled','shuffled32']:
  ax=[];ay=[];rng=np.random.default_rng(20260917)
  for participant,mode in sorted({(r['participant'],r['mode']) for r in rows if not r['groove']}):
   group=np.array([i for i,r in enumerate(rows) if not r['groove'] and r['participant']==participant and r['mode']==mode]);contexts=[group] if strategy=='pooled' else [chunk for _ in range(3) for chunk in np.array_split(rng.permutation(group),max(1,len(group)//32))]
   for context in contexts:ax.append(normalize(x[context]));ay.append(y[context])
  ax=np.concatenate(ax);ay=np.concatenate(ay);trainx=np.concatenate([origx,ax]);trainy=np.concatenate([origy,ay]);weights=np.r_[np.ones(len(origy)),np.full(len(ay),.5)]
  model=make_pipeline(StandardScaler(),SVC(C=3,gamma='scale'));model.fit(trainx,trainy,svc__sample_weight=weights);result={'strategy':strategy,'originalEvents':len(origy),'augmentedEvents':len(ay),**score(model)};report['trials'].append(result);pickle.dump(model,open(OUT/f'{strategy}.pkl','wb'));print(json.dumps(result),flush=True)
 report['selection']='Validation development comparison only; no test or private audio accessed.';report['selected']=max(report['trials'],key=lambda r:r['coreJointF1']);(OUT/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
if __name__=='__main__':main()
