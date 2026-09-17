"""Frozen eight-Ward-cluster/full-margin pooling check for four-class C3 SVM.

No new hyperparameter selection or fitting. Evaluate original Python validation
and previously cached native browser features, never test/private recordings.
"""
import json,pickle
from pathlib import Path
import numpy as np
from sklearn.cluster import AgglomerativeClustering
from four_relative_train import evaluate,match_labels,OUT
from neural_crop_evaluate import features

class Grouped:
 def __init__(self,pipeline):
  self.scaler,self.svm=pipeline.steps[0][1],pipeline.steps[1][1];self.svm.decision_function_shape='ovo'
 def predict(self,x):
  z=self.scaler.transform(x);margins=self.svm.decision_function(z);groups=AgglomerativeClustering(n_clusters=min(8,len(z)),linkage='ward').fit_predict(z) if len(z)>1 else np.zeros(1,dtype=int)
  for group in np.unique(groups):
   keep=groups==group;margins[keep]=margins[keep].mean(0)
  votes=np.zeros((len(x),4),dtype=int);column=0
  for i in range(4):
   for j in range(i+1,4):
    votes[:,i]+=margins[:,column]>0;votes[:,j]+=margins[:,column]<=0;column+=1
  return votes.argmax(1)

def main():
 base=json.loads((OUT/'report.json').read_text());assert base['selectedC']==3;pipeline=pickle.load(open(OUT/'four-relative.pkl','rb'));records={r['file']:r for r in json.loads(Path('artifacts/events-v2.json').read_text())};fixtures=[f for f in json.loads(Path('artifacts/relative-parity/audio-fixtures.json').read_text()) if f['split']=='validation'];sequences=[]
 for f in fixtures:
  bank=np.fromfile(f"artifacts/relative-parity/{f['stem']}-banks.f32",dtype='float32').reshape(-1,48,128);label,count=match_labels(records[f['file']],f['times']);sequences.append({'file':f['file'],'mode':records[f['file']]['mode'],'features':features(bank,relative=True),'labels':label,'annotated':count})
 plain=evaluate(pipeline,sequences);assert plain['correctFour']==552 and plain['correctCore']==595
 grouped=Grouped(pipeline);python=evaluate(grouped,sequences);native=[]
 for f in json.loads((OUT/'native-manifest.json').read_text())['rows']:
  label,count=match_labels(records[f['file']],f['nativeTimes']);native.append({'file':f['file'],'mode':records[f['file']]['mode'],'features':np.fromfile(OUT/f"{f['stem']}-native.f32",dtype='float32').reshape(-1,1104),'labels':label,'annotated':count})
 native_result=evaluate(grouped,native);report={'protocol':'Frozen selected four-class C3; exactly8Ward clusters (or number of events if smaller), full mean of6OVO margins; no parameter tuning; validation15–20 only. All detections included in clusters.','classOrder':['hhc','hho','kd','sd'],'baselinePython':plain,'groupedPython':python,'baselineNative':base['frozenNativeDiagnostic'],'groupedNative':native_result};(OUT/'consistency-report.json').write_text(json.dumps(report,indent=2))
 for name,r in [('Python',python),('Native',native_result)]:print(name,json.dumps({k:v for k,v in r.items() if k!='recordings'}),flush=True)
if __name__=='__main__':main()
