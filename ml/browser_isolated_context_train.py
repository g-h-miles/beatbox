"""Fixed isolated-hit insertion-context augmentation; one validation comparison."""
import hashlib,json,pickle
from pathlib import Path
import numpy as np
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from four_relative_train import CORE,evaluate,match_labels
from onset_only_classify import ProductionCombiner,enrich
from browser_absolute_relative_train import RawCombiner

OUT=Path('artifacts/browser-isolated-context');ORIGINAL=Path('artifacts/browser-relative')
CLASS=['hhc','hho','kd','sd']

def main():
    original_manifest=json.loads((ORIGINAL/'training-manifest.json').read_text())['rows'];assert len(original_manifest)==27
    x=[];y=[];weights=[];original_hashes={}
    for row in original_manifest:
        assert 1<=row['participant']<=14
        path=ORIGINAL/f"{row['stem']}-features.f32";original_hashes[str(path)]=hashlib.sha256(path.read_bytes()).hexdigest()
        features=np.fromfile(path,dtype='float32').reshape(-1,1104);assert len(features)==len(row['labels'])
        x.extend(features);y.extend(row['labels']);weights.extend([1.]*len(features))
    assert len(y)==1161
    manifest=json.loads((OUT/'manifest.json').read_text());assert len(manifest['rows'])==108 and not manifest['errors'] and manifest['originalParity']
    isolated_counts=np.zeros(4,dtype=int);details=[]
    for row in manifest['rows']:
        assert 1<=row['participant']<=14
        path=Path(row['featureFile'])
        if not path.is_absolute() and len(path.parts)==1:path=OUT/path
        assert path.resolve().is_relative_to(OUT.resolve())
        features=np.fromfile(path,dtype='float32').reshape(-1,1104)
        labels=[CLASS.index(v) if isinstance(v,str) else int(v) for v in row['labels']]
        assert len(features)==len(labels)==len(row['times']) and all(v in range(4) for v in labels)
        x.extend(features);y.extend(labels);weights.extend([.5]*len(features));isolated_counts+=np.bincount(labels,minlength=4)
        details.append({'file':row['file'],'participant':row['participant'],'mode':row['mode'],'events':len(features)})
    assert isolated_counts.tolist()==[729,734,743,737]
    x,y,weights=np.array(x),np.array(y),np.array(weights);assert len(y)==4104 and weights.sum()==2632.5
    models=[];hashes={}
    for count,c in [(3,10),(4,1)]:
        model=make_pipeline(StandardScaler(),SVC(C=c,kernel='rbf',gamma='scale',decision_function_shape='ovo'))
        model.fit(x,CORE[y] if count==3 else y,svc__sample_weight=weights);models.append(model)
        path=OUT/f'classifier-{count}.pkl';pickle.dump(model,path.open('wb'));hashes[str(count)]={'C':c,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    for path,digest in original_hashes.items():assert hashlib.sha256(Path(path).read_bytes()).hexdigest()==digest
    frozen={'protocol':'docs/research/browser-isolated-context-plan.md','trainingEvents':len(y),'originalEvents':1161,'isolatedEvents':2943,'isolatedCounts':isolated_counts.tolist(),'effectiveSVCWeight':float(weights.sum()),'originalHashes':original_hashes,'models':hashes,'isolatedRecords':details}
    (OUT/'frozen-training.json').write_text(json.dumps(frozen,indent=2));print('Models frozen before validation features',flush=True)
    score(models,frozen)

def score(models,frozen):
    records={r['file']:r for r in json.loads(Path('artifacts/events-v2.json').read_text())};sequences=[]
    for row in json.loads(Path('artifacts/four-relative/native-manifest.json').read_text())['rows']:
        record=records[row['file']];assert 15<=record['participant']<=20
        features=np.fromfile(Path('artifacts/four-relative')/f"{row['stem']}-native.f32",dtype='float32').reshape(-1,1104)
        labels,count=match_labels(record,row['nativeTimes']);sequences.append({'file':row['file'],'mode':record['mode'],'features':features,'labels':labels,'annotated':count})
    oldmodels=[pickle.load((ORIGINAL/f'browser-relative-{k}.pkl').open('rb')) for k in [3,4]]
    baseline=enrich(evaluate(ProductionCombiner(*oldmodels),sequences));assert tuple(baseline[k] for k in ['detected','annotated','matched','correctCore','correctFour'])==(707,694,672,639,605)
    scores={}
    for name,predictor in [('raw',RawCombiner(*models)),('pooled',ProductionCombiner(*models))]:
        result=enrich(evaluate(predictor,sequences));scores[name]=result;print(name,json.dumps({k:v for k,v in result.items() if k!='recordings'}),flush=True)
    modes={mode:{name:enrich(evaluate(predictor,[r for r in sequences if r['mode']==mode])) for name,predictor in [('baseline',ProductionCombiner(*oldmodels)),('candidate',ProductionCombiner(*models))]} for mode in ['Fixed','Personal']}
    (OUT/'report.json').write_text(json.dumps({'frozen':frozen,'baseline':baseline,'scores':scores,'modes':modes},indent=2))
if __name__=='__main__':
    import sys
    if '--score-only' in sys.argv:
        frozen=json.loads((OUT/'frozen-training.json').read_text());models=[]
        for k in [3,4]:
            path=OUT/f'classifier-{k}.pkl';assert hashlib.sha256(path.read_bytes()).hexdigest()==frozen['models'][str(k)]['sha256'];models.append(pickle.load(path.open('rb')))
        score(models,frozen)
    else:main()
