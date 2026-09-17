"""Fixed browser pitch augmentation; freeze fitted models before evaluation."""
import hashlib,json,pickle
from pathlib import Path
import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from browser_relative_combiner import Combined
from four_relative_train import CORE,evaluate,match_labels
OUT=Path('artifacts/browser-pitch')
def main():
 original=json.loads(Path('artifacts/browser-relative/training-manifest.json').read_text())['rows']
 augmented=json.loads((OUT/'training-manifest.json').read_text())['rows']
 assert len(original)==27 and len(augmented)==54
 x=[];y=[]
 for r in original+augmented:
  assert 1<=r['participant']<=14
  path=OUT/r['featureFile'] if 'featureFile' in r else Path('artifacts/browser-relative')/f"{r['stem']}-features.f32"
  values=np.fromfile(path,dtype='float32').reshape(-1,1104);assert len(values)==len(r['labels'])
  x.extend(values);y.extend(r['labels'])
 x=np.array(x);y=np.array(y);assert len(x)==3483;weights=np.full(len(x),1/3)
 models=[];frozen={}
 for count,c in [(3,10),(4,1)]:
  scaler=StandardScaler();z=scaler.fit_transform(x,sample_weight=weights)
  svm=SVC(C=c,gamma='scale',kernel='rbf',decision_function_shape='ovo');svm.fit(z,CORE[y] if count==3 else y,sample_weight=weights)
  model=Pipeline([('standardscaler',scaler),('svc',svm)]);models.append(model)
  path=OUT/f'model-{count}.pkl';pickle.dump(model,path.open('wb'));frozen[str(count)]={'C':c,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
 (OUT/'frozen.json').write_text(json.dumps({'protocol':'ml/browser_pitch_protocol.md','events':len(x),'models':frozen},indent=2))
 print('Models frozen',frozen,flush=True)
 records={r['file']:r for r in json.loads(Path('artifacts/events-v2.json').read_text())}
 baseline=Combined(*[pickle.load(open(f'artifacts/browser-relative/browser-relative-{k}.pkl','rb')) for k in [3,4]])
 result={}
 for cohort,directory,manifest,timefield,featuretail in [('development',Path('artifacts/four-relative'),'native-manifest.json','nativeTimes','native'),('previouslyInspected',Path('artifacts/browser-relative/existing-test'),'native-manifest.json','times','features')]:
  sequences=[]
  for r in json.loads((directory/manifest).read_text())['rows']:
   record=records[r['file']];assert (15<=record['participant']<=20 if cohort=='development' else 21<=record['participant']<=28)
   labels,n=match_labels(record,r[timefield]);features=np.fromfile(directory/f"{r['stem']}-{featuretail}.f32",dtype='float32').reshape(-1,1104)
   sequences.append({'file':r['file'],'mode':record['mode'],'labels':labels,'annotated':n,'features':features})
  result[cohort]={name:evaluate(model,sequences) for name,model in [('baseline',baseline),('augmented',Combined(*models))]}
  print(cohort,{name:{k:v for k,v in score.items() if k not in ['recordings','confusionCore','confusionFour']} for name,score in result[cohort].items()},flush=True)
 (OUT/'report.json').write_text(json.dumps(result,indent=2))
if __name__=='__main__':main()
