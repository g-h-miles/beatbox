"""Validation-only domain-broadened four-way classifiers; locked tests untouched."""
import json,pickle
from pathlib import Path
import numpy as np
from scipy.fft import dct
from sklearn.ensemble import ExtraTreesClassifier,HistGradientBoostingClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.svm import SVC
from sklearn.metrics import confusion_matrix
OUT=Path('artifacts/core-model/mdv')

def describe(bank):
 parts=[]
 for lo,hi in [(0,3),(2,10),(8,24),(0,48)]:
  z=bank[:,lo:hi];a=z.mean(1);parts.extend([a-a.mean(1,keepdims=True),z.std(1),dct(a,type=2,norm='ortho')[:,1:25]])
 return np.concatenate(parts,1)

def metrics(rows,truth,pred):
 result={}
 for domain in sorted(set(r['domain'] for r in rows)):
  keep=np.array([r['domain']==domain for r in rows]);y=truth[keep];p=pred[keep];core=y<3
  classes=sorted(set(y));recall=[float(np.mean(p[y==c]==c)) for c in classes]
  result[domain]={'events':int(sum(keep)),'correct':int(sum(p==y)),'accuracy':float(np.mean(p==y)),'macroRecall':float(np.mean(recall)),'coreAccuracy':float(np.mean(p[core]==y[core])),'coreEvents':int(sum(core)),'otherRecall':float(np.mean(p[y==3]==3)) if np.any(y==3) else None,'confusion':confusion_matrix(y,p,labels=[0,1,2,3]).tolist()}
 return {'domainMeanMacroRecall':float(np.mean([v['macroRecall'] for v in result.values()])),'domains':result}

def main():
 rows=json.loads((OUT/'events.json').read_text());bank=np.load(OUT/'banks.npy').astype('float32');x=describe(bank);np.save(OUT/'features.npy',x);y=np.array([r['label'] for r in rows]);tr=np.array([i for i,r in enumerate(rows) if r['split']=='train']);val=np.array([i for i,r in enumerate(rows) if r['split']=='validation']);weights=np.zeros(len(tr))
 for j,i in enumerate(tr):weights[j]=1/sum(rows[k]['domain']==rows[i]['domain'] and y[k]==y[i] for k in tr)
 weights*=len(weights)/weights.sum();trials=[];best=None
 candidates=[('extra',ExtraTreesClassifier(n_estimators=700,min_samples_leaf=2,n_jobs=6,random_state=17)),('hist',HistGradientBoostingClassifier(max_iter=250,max_leaf_nodes=15,l2_regularization=10,random_state=17)),('svc',make_pipeline(StandardScaler(),SVC(C=3,gamma='scale')))]
 for name,model in candidates:
  model.fit(x[tr],y[tr],**({'svc__sample_weight':weights} if name=='svc' else {'sample_weight':weights}));p=model.predict(x[val]);result=metrics([rows[i] for i in val],y[val],p);trials.append({'name':name,**result});print(name,json.dumps(result),flush=True)
  if best is None or result['domainMeanMacroRecall']>best[0]:best=(result['domainMeanMacroRecall'],name,model,result)
 pickle.dump(best[2],open(OUT/'classical.pkl','wb'));report={'selection':'Mean of per-domain macro recall, validation only. MDV11–13 and AVP21–28 never evaluated.','classOrder':['hat','kick','snare','other'],'selected':best[1],'validation':best[3],'trials':trials};(OUT/'classical-report.json').write_text(json.dumps(report,indent=2))
if __name__=='__main__':main()
