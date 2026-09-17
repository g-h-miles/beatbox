"""Fixed classifier augmentation using candidate detector boundaries on train voices."""
import hashlib,json,pickle
from pathlib import Path
import numpy as np
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from four_relative_train import CORE,match_labels,evaluate
from onset_only_classify import ProductionCombiner,make_sequences,enrich

OUT=Path('artifacts/onset-adapt');ORIGINAL=Path('artifacts/browser-relative')

def main():
    records={r['file']:r for r in json.loads(Path('artifacts/events-v2.json').read_text())};features=[];labels=[]
    for row in json.loads((ORIGINAL/'training-manifest.json').read_text())['rows']:
        assert 1<=row['participant']<=14
        x=np.fromfile(ORIGINAL/f"{row['stem']}-features.f32",dtype='float32').reshape(-1,1104)
        features.extend(x);labels.extend(row['labels'])
    assert len(features)==len(labels)==1161
    manifest=json.loads((OUT/'native-manifest.json').read_text());details=[]
    for row in manifest['rows']:
        assert 1<=row['participant']<=14
        record=records[row['file']];y,count=match_labels(record,row['times']);keep=y>=0
        x=np.fromfile(OUT/f"{row['stem']}-features.f32",dtype='float32').reshape(-1,1104);assert len(x)==len(y)
        features.extend(x[keep]);labels.extend(y[keep]);details.append({'file':row['file'],'detected':len(x),'reference':count,'matched':int(sum(keep))})
    x,y=np.array(features),np.array(labels);models=[];hashes={}
    for classes,c in [(3,10),(4,1)]:
        target=CORE[y] if classes==3 else y
        model=make_pipeline(StandardScaler(),SVC(C=c,kernel='rbf',gamma='scale',decision_function_shape='ovo'));model.fit(x,target);models.append(model)
        path=OUT/f'classifier-{classes}.pkl';pickle.dump(model,path.open('wb'));hashes[str(classes)]={'C':c,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    frozen={'protocol':'ml/onset_adapt_protocol.md','onsetModelSha256':manifest['modelSha256'],'originalEvents':1161,'addedEvents':len(y)-1161,'totalTraining':len(y),'models':hashes,'trainingRecords':details}
    (OUT/'frozen-training.json').write_text(json.dumps(frozen,indent=2));print('Frozen training',len(y),'events',flush=True)
    combiner=ProductionCombiner(*models)
    validation=make_sequences(json.loads(Path('artifacts/onset-only/native-manifest.json').read_text()),Path('artifacts/onset-only'),records,True)
    result=enrich(evaluate(combiner,validation))
    modes={mode:enrich(evaluate(combiner,[r for r in validation if r['mode']==mode])) for mode in ['Fixed','Personal']}
    prior=json.loads(Path('artifacts/onset-only/classification-report.json').read_text())
    report={'frozen':frozen,'candidate':result,'modes':modes,'oldOnsetOldClassifiers':prior['baseline'],'newOnsetOldClassifiers':prior['candidate']}
    (OUT/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in result.items() if k!='recordings'}),flush=True)
if __name__=='__main__':main()
