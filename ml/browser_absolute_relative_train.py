"""Fixed2208 absolute+relative browser-feature condition; no validation selection."""
import hashlib,json,pickle
from pathlib import Path
import numpy as np
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from four_relative_train import CORE,match_labels,evaluate
from onset_only_classify import ProductionCombiner,enrich

OUT=Path('artifacts/browser-absolute-relative')

class RawCombiner:
    def __init__(self,core,four):self.core,self.four=core,four
    def predict(self,x):
        core=self.core.predict(x);margin=self.four.decision_function(x)[:,0]
        return np.where(core==0,np.where(margin>0,0,1),core+1)

def main():
    manifest=json.loads((OUT/'manifest.json').read_text());assert manifest['features']==2208 and not manifest['errors']
    train=[r for r in manifest['rows'] if r['split']=='training'];assert len(train)==27
    x=[];y=[]
    for row in train:
        assert 1<=row['participant']<=14 and row['relativeMaxError']==0
        features=np.fromfile(OUT/f"{row['stem']}-features.f32",dtype='float32').reshape(-1,2208)
        assert len(features)==len(row['labels'])==len(row['times'])
        x.extend(features);y.extend(row['labels'])
    x,y=np.array(x),np.array(y);assert len(y)==1161
    models=[];hashes={}
    for count,c in [(3,10),(4,1)]:
        model=make_pipeline(StandardScaler(),SVC(C=c,kernel='rbf',gamma='scale',decision_function_shape='ovo'))
        model.fit(x,CORE[y] if count==3 else y);models.append(model)
        path=OUT/f'classifier-{count}.pkl';pickle.dump(model,path.open('wb'));hashes[str(count)]={'C':c,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    frozen={'protocol':'ml/browser_absolute_relative_protocol.md','features':2208,'trainingEvents':len(y),'models':hashes}
    (OUT/'frozen-training.json').write_text(json.dumps(frozen,indent=2));print('Models frozen before validation features',flush=True)
    records={r['file']:r for r in json.loads(Path('artifacts/events-v2.json').read_text())};sequences=[]
    for row in manifest['rows']:
        if row['split']!='validation':continue
        assert 15<=row['participant']<=20 and row['relativeMaxError']==0
        labels,count=match_labels(records[row['file']],row['times'])
        features=np.fromfile(OUT/f"{row['stem']}-features.f32",dtype='float32').reshape(-1,2208)
        assert len(features)==len(row['times'])
        sequences.append({'file':row['file'],'mode':row['mode'],'features':features,'labels':labels,'annotated':count})
    assert len(sequences)==12
    baseline=json.loads(Path('artifacts/browser-relative/combiner-frozen.json').read_text())['validation']
    assert tuple(baseline[k] for k in ['detected','annotated','matched','correctCore','correctFour'])==(707,694,672,639,605)
    scores={}
    for name,predictor in [('raw',RawCombiner(*models)),('pooled',ProductionCombiner(*models))]:
        result=enrich(evaluate(predictor,sequences));assert (result['detected'],result['annotated'],result['matched'])==(707,694,672)
        scores[name]=result;print(name,json.dumps({k:v for k,v in result.items() if k!='recordings'}),flush=True)
    (OUT/'report.json').write_text(json.dumps({'frozen':frozen,'baseline':baseline,'scores':scores},indent=2))
if __name__=='__main__':main()
