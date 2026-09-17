"""Train core SVM on deployment-like detected crops (training voices only).

Two fixed C=3 candidates: neural-matched training events alone, or equal-weight
annotation+neural matched training events. Normalization includes unmatched
onsets; only their loss labels are excluded. No validation labels enter fitting.
"""
import json,pickle
from pathlib import Path
import numpy as np
from scipy.fft import dct
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.metrics import confusion_matrix
OUT=Path('artifacts/core-model/relative-detected-train');OUT.mkdir(parents=True,exist_ok=True)

def main():
 seq=json.loads(Path('artifacts/core-model/sequence/records.json').read_text());data=np.load('artifacts/core-model/sequence/sequences.npz');train=[r for r in seq if r['split']=='train'];val=[r for r in seq if r['split']=='validation']
 def load(records):return np.concatenate([data[f"x{r['index']}"] for r in records]),np.concatenate([data[f"y{r['index']}"] for r in records])
 tx,ty=load(train);tx=tx[ty>=0];ty=ty[ty>=0];vx,vy=load(val);valid=vy>=0;detected=len(vx);refs=sum(r['annotated'] for r in val)
 meta=json.loads(Path('artifacts/ml-v2/events.json').read_text());mapping={'hhc':0,'hho':0,'kd':1,'sd':2};ix=np.array([i for i,r in enumerate(meta) if r['participant']<=14 and r['kind']=='annotation' and r['groove'] and r['label'] in mapping]);rows=[meta[i] for i in ix];banks=np.load('artifacts/ml-v2/fbanks.npy',mmap_mode='r')[ix].astype('float32');parts=[]
 for lo,hi in [(0,2),(2,10),(10,25),(0,10)]:
  z=banks[:,lo:hi];a=z.mean(1);parts.extend([a-a.mean(1,keepdims=True),z.std(1),dct(a,type=2,norm='ortho')[:,1:21]])
 ax=np.concatenate(parts,axis=1);ay=np.array([mapping[r['label']] for r in rows])
 for file in sorted({r['file'] for r in rows}):
  group=np.array([i for i,r in enumerate(rows) if r['file']==file]);raw=ax[group];ax[group]=(raw-np.median(raw,axis=0))/(raw.std(axis=0)+.1)
 def score(model):
  pred=model.predict(vx);correct=int((pred[valid]==vy[valid]).sum());return {'correct':correct,'matched':int(valid.sum()),'detected':detected,'references':refs,'accuracy':correct/int(valid.sum()),'jointF1':2*correct/(detected+refs),'confusion':confusion_matrix(vy[valid],pred[valid],labels=[0,1,2]).tolist()}
 baseline=pickle.load(open('artifacts/core-model/relative.pkl','rb'));report={'protocol':__doc__,'baseline':score(baseline),'trials':[]};assert report['baseline']['correct']==592
 for name,x,y in [('detected',tx,ty),('both',np.concatenate([ax,tx]),np.concatenate([ay,ty]))]:
  model=make_pipeline(StandardScaler(),SVC(C=3,gamma='scale'));model.fit(x,y);result={'candidate':name,'trainingEvents':len(y),**score(model)};report['trials'].append(result);pickle.dump(model,open(OUT/f'{name}.pkl','wb'));print(result,flush=True)
 (OUT/'report.json').write_text(json.dumps(report,indent=2))
if __name__=='__main__':main()
