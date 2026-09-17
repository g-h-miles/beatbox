"""One fixed speaker-balanced browser-feature classifier experiment."""
import hashlib,json,pickle
from pathlib import Path
import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from four_relative_train import CORE,evaluate,match_labels
from onset_only_classify import ProductionCombiner,enrich

OUT=Path('artifacts/browser-voice-balance');SOURCE=Path('artifacts/browser-relative')

def sequences(manifest,folder,candidate):
    records={r['file']:r for r in json.loads(Path('artifacts/events-v2.json').read_text())};result=[]
    for row in manifest['rows']:
        record=records[row['file']]
        assert (15<=record['participant']<=20) if not candidate else (21<=record['participant']<=28)
        times=row['times'] if candidate else row['nativeTimes'];labels,count=match_labels(record,times)
        suffix='features' if candidate else 'native';x=np.fromfile(folder/f"{row['stem']}-{suffix}.f32",dtype='float32').reshape(-1,1104)
        assert len(x)==len(times)
        result.append({'file':row['file'],'mode':record['mode'],'features':x,'labels':labels,'annotated':count})
    return result

def main():
    OUT.mkdir(parents=True,exist_ok=True);x=[];y=[];participants=[]
    for row in json.loads((SOURCE/'training-manifest.json').read_text())['rows']:
        assert 1<=row['participant']<=14
        features=np.fromfile(SOURCE/f"{row['stem']}-features.f32",dtype='float32').reshape(-1,1104)
        x.extend(features);y.extend(row['labels']);participants.extend([row['participant']]*len(features))
    x,y,participants=np.array(x),np.array(y),np.array(participants);assert len(y)==1161
    models=[];details={}
    for classes,c in [(3,10),(4,1)]:
        target=CORE[y] if classes==3 else y;weights=np.zeros(len(y));counts={}
        for participant in np.unique(participants):
            for label in np.unique(target[participants==participant]):
                keep=(participants==participant)&(target==label);n=int(sum(keep));weights[keep]=1/n;counts[f'{participant}:{label}']=n
        weights*=len(weights)/weights.sum();scaler=StandardScaler();z=scaler.fit_transform(x,sample_weight=weights)
        svm=SVC(C=c,kernel='rbf',gamma='scale',decision_function_shape='ovo');svm.fit(z,target,sample_weight=weights)
        model=Pipeline([('standardscaler',scaler),('svc',svm)]);models.append(model)
        path=OUT/f'classifier-{classes}.pkl';pickle.dump(model,path.open('wb'));details[str(classes)]={'C':c,'counts':counts,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    frozen={'protocol':'ml/browser_voice_balance_protocol.md','trainingEvents':len(y),'models':details}
    (OUT/'frozen-training.json').write_text(json.dumps(frozen,indent=2));print('Models frozen',flush=True)
    old_models=[pickle.load((SOURCE/f'browser-relative-{k}.pkl').open('rb')) for k in [3,4]]
    old=ProductionCombiner(*old_models);new=ProductionCombiner(*models);scores={}
    for split,folder,manifest,test in [('validation',Path('artifacts/four-relative'),'native-manifest.json',False),('previouslyInspectedTest',SOURCE/'existing-test','native-manifest.json',True)]:
        rows=sequences(json.loads((folder/manifest).read_text()),folder,test)
        baseline=enrich(evaluate(old,rows));expected=(962,839) if test else (639,605)
        assert (baseline['correctCore'],baseline['correctFour'])==expected
        candidate=enrich(evaluate(new,rows));scores[split]={'baseline':baseline,'candidate':candidate,'modes':{mode:enrich(evaluate(new,[r for r in rows if r['mode']==mode])) for mode in ['Fixed','Personal']}}
        print(split,json.dumps({k:v for k,v in candidate.items() if k!='recordings'}),flush=True)
    (OUT/'report.json').write_text(json.dumps({'frozen':frozen,'scores':scores,'limitations':'Previously exposed development/test cohorts; pure acoustic combiner, not guarded TypeSafe hybrid.'},indent=2))
if __name__=='__main__':main()
