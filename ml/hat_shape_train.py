"""Preregistered binary shape SVM, conditioned on frozen predicted core hats."""
import json,pickle
from pathlib import Path
import numpy as np
from sklearn.cluster import AgglomerativeClustering
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from browser_relative_train import vote
from four_relative_train import evaluate,match_labels

OUT=Path('artifacts/hat-shape')

class Predictor:
    def __init__(self,model,cache):self.model,self.cache=model,cache
    def predict(self,shape):
        core,groups=self.cache[id(shape)]
        margin=self.model.decision_function(shape)
        for group in np.unique(groups):
            keep=groups==group;margin[keep]=margin[keep].mean()
        return np.where(core==0,np.where(margin>0,1,0),core+1)

def main():
    manifest=json.loads((OUT/'manifest.json').read_text())['rows']
    x=[];y=[]
    for row in manifest:
        if row['split']!='train':continue
        assert 1<=row['participant']<=14
        features=np.fromfile(OUT/f"{row['stem']}-shape.f32",dtype='float32').reshape(-1,42)
        labels=np.array(row['labels']);keep=labels<2;x.extend(features[keep]);y.extend(labels[keep])
    x,y=np.array(x),np.array(y)
    core_model=pickle.load(Path('artifacts/browser-relative/browser-relative-3.pkl').open('rb'))
    scaler,svm=core_model.steps[0][1],core_model.steps[1][1];svm.decision_function_shape='ovo'
    records={r['file']:r for r in json.loads(Path('artifacts/events-v2.json').read_text())}
    sequences=[];cache={}
    for row in manifest:
        if row['split']!='validation':continue
        assert 15<=row['participant']<=20
        record=records[row['file']];labels,count=match_labels(record,row['times'])
        shape=np.fromfile(OUT/f"{row['stem']}-shape.f32",dtype='float32').reshape(-1,42)
        relative=np.fromfile(Path('artifacts/four-relative')/f"{row['stem']}-native.f32",dtype='float32').reshape(-1,1104)
        z=scaler.transform(relative);groups=AgglomerativeClustering(n_clusters=min(8,len(z)),linkage='ward').fit_predict(z);margins=svm.decision_function(z)
        for group in np.unique(groups):
            keep=groups==group;margins[keep]=margins[keep].mean(0)
        core=vote(margins,3);cache[id(shape)]=(core,groups)
        sequences.append({'file':row['file'],'mode':record['mode'],'features':shape,'labels':labels,'annotated':count})
    trials=[];best=None
    for c in [.1,1,10]:
        model=make_pipeline(StandardScaler(),SVC(C=c,kernel='rbf',gamma='scale'));model.fit(x,y)
        result=evaluate(Predictor(model,cache),sequences)
        assert result['correctCore']==639
        trials.append({'C':c,**result})
        print('C',c,json.dumps({k:v for k,v in result.items() if k!='recordings'}),flush=True)
        if best is None or result['jointFourF1']>best[0]:best=(result['jointFourF1'],c,model)
    pickle.dump(best[2],(OUT/'hat-shape.pkl').open('wb'))
    report={'protocol':'ml/hat_shape_protocol.md','trainingEvents':len(y),'trainingCounts':np.bincount(y,minlength=2).tolist(),'featureCount':42,'selectedC':best[1],'baselineFour':605,'fixedCore':639,'trials':trials}
    (OUT/'report.json').write_text(json.dumps(report,indent=2))
if __name__=='__main__':main()
