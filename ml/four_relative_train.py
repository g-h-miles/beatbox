"""Four-class frozen-feature SVM: closed/open/kick/snare, train1–14 grooves only.

Predeclared C={1,3,10}; select on validation15–20 four-class joint F1, ties
retain smaller C. Original706 neural detections/672 matches are primary so
comparison with the frozen TypeSafe hybrid is exact. No21–28/private/test use.
"""
import json,pickle
from pathlib import Path
import numpy as np
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.metrics import confusion_matrix
from neural_crop_evaluate import features
OUT=Path('artifacts/four-relative');OUT.mkdir(exist_ok=True,parents=True)
CLASSES=['hhc','hho','kd','sd'];CORE=np.array([0,0,1,2])

def match_labels(record,times):
 truth=[a for a in record['annotations'] if a['label'] in CLASSES];pairs=sorted((abs(t-a['time']),i,j) for i,t in enumerate(times) for j,a in enumerate(truth) if abs(t-a['time'])<.05);y=np.full(len(times),-100,dtype='int64');used=set()
 for _,i,j in pairs:
  if y[i]!=-100 or j in used:continue
  used.add(j);y[i]=CLASSES.index(truth[j]['label'])
 return y,len(truth)

def evaluate(model,sequences):
 totals={'detected':0,'annotated':0,'matched':0,'correctFour':0,'correctCore':0};actual=[];guessed=[];details=[]
 for r in sequences:
  p=model.predict(r['features']);keep=r['labels']>=0;y=r['labels'][keep];q=p[keep];four=int(sum(y==q));core=int(sum(CORE[y]==CORE[q]));totals['detected']+=len(p);totals['annotated']+=r['annotated'];totals['matched']+=len(y);totals['correctFour']+=four;totals['correctCore']+=core;actual.extend(y);guessed.extend(q);details.append({'file':r['file'],'mode':r['mode'],'detected':len(p),'annotated':r['annotated'],'matched':len(y),'correctFour':four,'correctCore':core,'predictions':p.tolist()})
 totals.update(classificationFour=totals['correctFour']/totals['matched'],classificationCore=totals['correctCore']/totals['matched'],jointFourF1=2*totals['correctFour']/(totals['detected']+totals['annotated']),jointCoreF1=2*totals['correctCore']/(totals['detected']+totals['annotated']),onsetF1=2*totals['matched']/(totals['detected']+totals['annotated']),confusionFour=confusion_matrix(actual,guessed,labels=[0,1,2,3]).tolist(),confusionCore=confusion_matrix(CORE[actual],CORE[guessed],labels=[0,1,2]).tolist());return {**totals,'recordings':details}

def main():
 rows=json.loads(Path('artifacts/ml-v2/events.json').read_text());cached=np.memmap('artifacts/relative-parity/cached-relative-features.f32',dtype='float32',mode='r',shape=(len(rows),1104));indices=[i for i,r in enumerate(rows) if r['participant']<=14 and r['kind']=='annotation' and r['groove'] and r['label'] in CLASSES];x=np.array(cached[indices]);y=np.array([CLASSES.index(rows[i]['label']) for i in indices]);records={r['file']:r for r in json.loads(Path('artifacts/events-v2.json').read_text())};fixtures=[f for f in json.loads(Path('artifacts/relative-parity/audio-fixtures.json').read_text()) if f['split']=='validation'];sequences=[]
 for f in fixtures:
  bank=np.fromfile(f"artifacts/relative-parity/{f['stem']}-banks.f32",dtype='float32').reshape(-1,48,128);label,count=match_labels(records[f['file']],f['times']);sequences.append({'file':f['file'],'mode':records[f['file']]['mode'],'features':features(bank,relative=True),'labels':label,'annotated':count})
 # Sanity check this is the exact previously reported baseline cohort.
 original=pickle.load(open('artifacts/core-model/relative.pkl','rb'));original_core=0
 for r in sequences:
  valid=r['labels']>=0;original_core+=int(sum(original.predict(r['features'])[valid]==CORE[r['labels'][valid]]))
 assert original_core==592, f'Baseline cohort mismatch: {original_core}'
 best=None;trials=[]
 for c in [1,3,10]:
  model=make_pipeline(StandardScaler(),SVC(C=c,kernel='rbf',gamma='scale'));model.fit(x,y);result=evaluate(model,sequences);print('C',c,json.dumps({k:v for k,v in result.items() if k!='recordings'}),flush=True);trials.append({'C':c,**result})
  if best is None or result['jointFourF1']>best[0]:best=(result['jointFourF1'],c,model,result)
 baseline=json.loads(Path('artifacts/typesafe-validation/report.json').read_text())['summaries'][0];report={'protocol':'Original1104relativefeatures; public AVP1–14 annotated grooves only; C1,3,10; select validation15–20 four-class jointF1; no21–28/private/locked tests. SmallerC wins ties.','trainingEvents':len(y),'classes':CLASSES,'coreClasses':['hat','kick','snare'],'selectedC':best[1],'baselineSource':'artifacts/typesafe-validation/report.json','baseline':baseline,'trials':trials,'selectedValidation':best[3]};pickle.dump(best[2],open(OUT/'four-relative.pkl','wb'));(OUT/'report.json').write_text(json.dumps(report,indent=2));print('Selected',best[1],best[3]['correctFour'],best[3]['correctCore'],flush=True)
 if best[3]['correctFour']>baseline['hybridFour'] and best[3]['correctCore']>=baseline['hybridCore'] and (OUT/'native-manifest.json').exists():
  native=[]
  for f in json.loads((OUT/'native-manifest.json').read_text())['rows']:
   label,count=match_labels(records[f['file']],f['nativeTimes']);native.append({'file':f['file'],'mode':records[f['file']]['mode'],'features':np.fromfile(OUT/f"{f['stem']}-native.f32",dtype='float32').reshape(-1,1104),'labels':label,'annotated':count})
  report['frozenNativeDiagnostic']=evaluate(best[2],native);(OUT/'report.json').write_text(json.dumps(report,indent=2));print('Native',json.dumps({k:v for k,v in report['frozenNativeDiagnostic'].items() if k!='recordings'}),flush=True)
if __name__=='__main__':main()
