"""Frozen CLAP embeddings, fixed linear/RBF SVM search on validation only.

No fine-tuning or held-out test evaluation. Score every validation detection;
annotation-unmatched hits stay in predictions and count against joint F1.
"""
import json,pickle
from pathlib import Path
import numpy as np
from sklearn.svm import SVC
from sklearn.metrics import confusion_matrix
OUT=Path('artifacts/clap')

def main():
 rows=json.loads((OUT/'events.json').read_text());x=np.load(OUT/'embeddings.npy');y=np.array([r['label'] for r in rows]);train=np.array([i for i,r in enumerate(rows) if r['split']=='train']);val=np.array([i for i,r in enumerate(rows) if r['split']=='validation']);records=[r for r in json.loads(Path('artifacts/core-model/sequence/records.json').read_text()) if r['split']=='validation'];annotated=sum(r['annotated'] for r in records);matched=int(sum(y[val]>=0));valid=y[val]>=0;trials=[];best=None
 for kernel,cs in [('linear',[.1,1,10]),('rbf',[1,10,100])]:
  for c in cs:
   model=SVC(C=c,kernel=kernel,gamma='scale');model.fit(x[train],y[train]);pred=model.predict(x[val]);correct=int(sum(pred[valid]==y[val][valid]));result={'kernel':kernel,'C':c,'detected':len(val),'annotated':annotated,'matched':matched,'correct':correct,'classificationAccuracy':correct/matched,'onsetF1':2*matched/(len(val)+annotated),'endToEndF1':2*correct/(len(val)+annotated),'confusion':confusion_matrix(y[val][valid],pred[valid],labels=[0,1,2]).tolist()};trials.append(result);print(json.dumps(result),flush=True)
   if best is None or result['endToEndF1']>best[0]:best=(result['endToEndF1'],model,result,pred)
 result=best[2];result['recordings']=[]
 for r in records:
  keep=np.array([rows[i]['file']==r['file'] for i in val]);known=keep&valid;correct=int(sum(best[3][known]==y[val][known]));result['recordings'].append({'file':r['file'],'mode':r['mode'],'detected':int(sum(keep)),'matched':int(sum(known)),'annotated':r['annotated'],'correct':correct,'predictions':best[3][keep].tolist()})
 report={'protocol':'TrainAVP1–14annotation hits; select15–20neural-onset validation by joint F1. No21–28/reserved/private evaluation. One fixed clip rendering.','classes':['hat','kick','snare'],'trainingEvents':len(train),'validation':result,'trials':trials,'pretrained':json.loads((OUT/'model-manifest.json').read_text())};(OUT/'report.json').write_text(json.dumps(report,indent=2));pickle.dump(best[1],open(OUT/'head.pkl','wb'));print('Selected',result['kernel'],result['C'],result['endToEndF1'],flush=True)
if __name__=='__main__':main()
