"""Compare frozen production acoustic combiner on old/new native onset crops.

No classifier fitting or parameter selection. Candidate manifest must be produced
by the independent browser extraction after onset-only model training.
"""
import hashlib,json,pickle
from pathlib import Path
import numpy as np
from browser_relative_event_export import outputs
from four_relative_train import evaluate,match_labels

OUT=Path('artifacts/onset-only');MODEL=Path('artifacts/browser-relative')

class ProductionCombiner:
    def __init__(self,core,four):self.core,self.four=core,four
    def predict(self,x):
        core=outputs(self.core,x,3);four=outputs(self.four,x,4)
        return np.array([(0 if four['pooledMargins'][i][0]>0 else 1) if c==0 else c+1 for i,c in enumerate(core['labels'])])

def make_sequences(manifest,folder,records,candidate):
    result=[]
    for row in manifest['rows']:
        record=records[row['file']];assert 15<=record['participant']<=20
        times=row['times'] if candidate else row['nativeTimes']
        labels,count=match_labels(record,times)
        suffix='features' if candidate else 'native'
        x=np.fromfile(folder/f"{row['stem']}-{suffix}.f32",dtype='float32').reshape(-1,1104)
        assert len(x)==len(times)
        result.append({'file':row['file'],'mode':record['mode'],'features':x,'labels':labels,'annotated':count})
    assert len(result)==12
    return result

def enrich(report):
    report['misses']=report['annotated']-report['matched'];report['extras']=report['detected']-report['matched']
    for row in report['recordings']:
        row['misses']=row['annotated']-row['matched'];row['extras']=row['detected']-row['matched']
    return report

def main():
    frozen=json.loads((MODEL/'combiner-frozen.json').read_text())
    for k in [3,4]:
        assert hashlib.sha256((MODEL/f'browser-relative-{k}.pkl').read_bytes()).hexdigest()==frozen['models'][str(k)]['sha256']
    models=[pickle.load((MODEL/f'browser-relative-{k}.pkl').open('rb')) for k in [3,4]]
    combiner=ProductionCombiner(*models)
    records={r['file']:r for r in json.loads(Path('artifacts/events-v2.json').read_text())}
    baseline=make_sequences(json.loads(Path('artifacts/four-relative/native-manifest.json').read_text()),Path('artifacts/four-relative'),records,False)
    baseline_score=enrich(evaluate(combiner,baseline))
    assert (baseline_score['detected'],baseline_score['annotated'],baseline_score['matched'],baseline_score['correctCore'],baseline_score['correctFour'])==(707,694,672,639,605)
    candidate=make_sequences(json.loads((OUT/'native-manifest.json').read_text()),OUT,records,True)
    candidate_score=enrich(evaluate(combiner,candidate))
    modes={mode:{name:enrich(evaluate(combiner,[r for r in seq if r['mode']==mode])) for name,seq in [('baseline',baseline),('candidate',candidate)]} for mode in ['Fixed','Personal']}
    report={'protocol':'Frozen production browserC10core/C1subtype; fixed8groups each; exact old/new native detections/crops; no classifier fitting or threshold tuning; AVP15–20 only.',
            'models':frozen['models'],'classes':['closed','open','kick','snare'],'baseline':baseline_score,'candidate':candidate_score,'modes':modes,
            'limitations':'Pure acoustic combiner, not guarded TypeSafe/noncore hybrid; development validation previously exposed.'}
    (OUT/'classification-report.json').write_text(json.dumps(report,indent=2))
    for name,r in [('baseline',baseline_score),('candidate',candidate_score)]:print(name,json.dumps({k:v for k,v in r.items() if k!='recordings'}),flush=True)
if __name__=='__main__':main()
