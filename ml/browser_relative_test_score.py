"""Frozen old/new core and subtype combination on identical native test features."""
import hashlib
import json
import pickle
from pathlib import Path
import numpy as np
from browser_relative_combiner import Combined, pooled_margins
from browser_relative_train import evaluate, vote
from four_relative_train import evaluate as evaluate_four, match_labels

OUT=Path('artifacts/browser-relative');TEST=OUT/'existing-test'

class CoreGrouped:
    def __init__(self,model):self.model=model
    def predict(self,x):return vote(pooled_margins(self.model,x),3)

def core_score(model,sequences):
    # Reuse four-class scorer via deterministic closed-hat placeholder;
    # discard all subtype metrics, which have no meaning for this core model.
    class Adapter:
        def predict(self,x):
            p=model.predict(x)
            return np.where(p==0,0,p+1)
    result=evaluate_four(Adapter(),sequences)
    return {k:v for k,v in result.items() if k not in ['correctFour','classificationFour','jointFourF1','confusionFour','recordings']}

def main():
    frozen=json.loads((OUT/'combiner-frozen.json').read_text())
    for k in [3,4]:
        assert hashlib.sha256((OUT/f'browser-relative-{k}.pkl').read_bytes()).hexdigest()==frozen['models'][str(k)]['sha256']
    core,four=[pickle.load((OUT/f'browser-relative-{k}.pkl').open('rb')) for k in [3,4]]
    original=pickle.load(Path('artifacts/core-model/relative.pkl').open('rb'))
    records={r['file']:r for r in json.loads(Path('artifacts/events-v2.json').read_text())}
    sequences=[]
    for row in json.loads((TEST/'native-manifest.json').read_text())['rows']:
        assert 21<=row['participant']<=28
        record=records[row['file']];labels,count=match_labels(record,row['times'])
        sequences.append({'file':row['file'],'mode':row['mode'],'labels':labels,'annotated':count,'reference':count,
                          'features':np.fromfile(TEST/f"{row['stem']}-features.f32",dtype='float32').reshape(-1,1104)})
    reports={}
    for mode in ['all','Fixed','Personal']:
        selected=[r for r in sequences if mode=='all' or r['mode']==mode]
        reports[mode]={'originalRawCore':core_score(original,selected),'originalGroupedCore':core_score(CoreGrouped(original),selected),
                       'browserRawCore':core_score(core,selected),'browserGroupedCore':core_score(CoreGrouped(core),selected),
                       'browserFourGrouped':evaluate(four,selected,4,True),'combiner':evaluate_four(Combined(core,four),selected)}
    report={'protocol':'Frozen C10core/C1four/combiner on explicitly authorized previously inspected AVP21–28 native browser detector/features; no test tuning. Pure model outputs, no TypeSafe noncore retention or gate.', 'frozen':frozen['models'],'scores':reports}
    (OUT/'existing-test-report.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({mode:{name:{k:v for k,v in r.items() if k!='recordings'} for name,r in scores.items()} for mode,scores in reports.items()},indent=2),flush=True)
if __name__=='__main__':main()
