"""Export frozen old/new native-test margins for exact downstream hybrid checking."""
import json,pickle
from pathlib import Path
import numpy as np
from sklearn.cluster import AgglomerativeClustering
from browser_relative_train import vote

ROOT=Path('artifacts/browser-relative');TEST=ROOT/'existing-test'

def outputs(model,x,classes):
    scaler,svm=model.steps[0][1],model.steps[1][1];svm.decision_function_shape='ovo'
    z=scaler.transform(x);margins=svm.decision_function(z)
    groups=AgglomerativeClustering(n_clusters=min(8,len(z)),linkage='ward').fit_predict(z)
    for group in np.unique(groups):
        keep=groups==group;margins[keep]=margins[keep].mean(0)
    return {'groups':groups.tolist(),'pooledMargins':margins.tolist(),'labels':vote(margins,classes).tolist()}

def main():
    models=[pickle.load(p.open('rb')) for p in [Path('artifacts/core-model/relative.pkl'),ROOT/'browser-relative-3.pkl',ROOT/'browser-relative-4.pkl']]
    rows=[]
    for row in json.loads((TEST/'native-manifest.json').read_text())['rows']:
        assert 21<=row['participant']<=28
        x=np.fromfile(TEST/f"{row['stem']}-features.f32",dtype='float32').reshape(-1,1104)
        old,core,four=[outputs(model,x,count) for model,count in zip(models,[3,3,4])]
        combined=[(0 if four['pooledMargins'][i][0]>0 else 1) if c==0 else c+1 for i,c in enumerate(core['labels'])]
        rows.append({**row,'original':old,'candidateCore':core,'candidateFour':four,'combined':combined})
    (TEST/'predictions.json').write_text(json.dumps({'coreClasses':['hat','kick','snare'],'fourClasses':['closed','open','kick','snare'],'rows':rows},indent=2))
if __name__=='__main__':main()
