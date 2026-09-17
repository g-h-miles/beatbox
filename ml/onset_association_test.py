"""One frozen association rule on all previously inspected AVP21–28 clips."""
import hashlib,json,pickle
from pathlib import Path
import numpy as np
from train_transcriber import DT
from onset_only_classify import ProductionCombiner,enrich
from onset_association import StoredPredictions
from four_relative_train import match_labels,evaluate

OUT=Path('artifacts/onset-association-test');OLD=Path('artifacts/browser-relative/existing-test');MODEL=Path('artifacts/browser-relative')

def sequences(rows,folder,records):
    result=[]
    for row in rows:
        assert 21<=row['participant']<=28
        labels,count=match_labels(records[row['file']],row['times'])
        x=np.fromfile(folder/f"{row['stem']}-features.f32",dtype='float32').reshape(-1,1104);assert len(x)==len(row['times'])
        result.append({'file':row['file'],'mode':row['mode'],'features':x,'labels':labels,'annotated':count})
    assert len(result)==14
    return result

def main():
    frozen=json.loads((MODEL/'combiner-frozen.json').read_text());models=[]
    for k in [3,4]:
        path=MODEL/f'browser-relative-{k}.pkl';assert hashlib.sha256(path.read_bytes()).hexdigest()==frozen['models'][str(k)]['sha256'];models.append(pickle.load(path.open('rb')))
    combiner=ProductionCombiner(*models);records={r['file']:r for r in json.loads(Path('artifacts/events-v2.json').read_text())}
    old_rows=json.loads((OLD/'native-manifest.json').read_text())['rows'];new_manifest=json.loads((OUT/'native-manifest.json').read_text());new_rows=new_manifest['rows']
    assert new_manifest['modelSha256']==json.loads(Path('artifacts/onset-only/export.json').read_text())['onnxSha256']
    old_seq=sequences(old_rows,OLD,records);new_seq=sequences(new_rows,OUT,records)
    old_score=enrich(evaluate(combiner,old_seq));assert tuple(old_score[k] for k in ['detected','annotated','matched','correctCore','correctFour'])==(1179,1163,1141,962,839)
    new_score=enrich(evaluate(combiner,new_seq));old_pred={r['file']:r['predictions'] for r in old_score['recordings']};new_pred={r['file']:r['predictions'] for r in new_score['recordings']};old_times={r['file']:r['times'] for r in old_rows}
    associated=[];mappings=[]
    for row in new_rows:
        times=row['times'];previous=old_times[row['file']];pairs=sorted((abs(t-u),i,j) for i,t in enumerate(times) for j,u in enumerate(previous) if abs(t-u)<=4*DT)
        used_new,used_old=set(),set();predictions=np.array(new_pred[row['file']]);inherited=[]
        for distance,i,j in pairs:
            if i in used_new or j in used_old:continue
            used_new.add(i);used_old.add(j);predictions[i]=old_pred[row['file']][j]
            inherited.append({'candidateIndex':i,'baselineIndex':j,'distanceSeconds':distance})
        labels,count=match_labels(records[row['file']],times)
        associated.append({'file':row['file'],'mode':row['mode'],'features':predictions,'labels':labels,'annotated':count})
        mappings.append({'file':row['file'],'inherited':inherited,'unpairedCandidate':len(times)-len(used_new),'unpairedOld':len(previous)-len(used_old)})
    association=enrich(evaluate(StoredPredictions(),associated))
    modes={mode:{name:enrich(evaluate(predictor,[r for r in seq if r['mode']==mode])) for name,predictor,seq in [('baseline',combiner,old_seq),('candidateCrops',combiner,new_seq),('association',StoredPredictions(),associated)]} for mode in ['Fixed','Personal']}
    report={'protocol':'ml/onset_association_test.md','associationToleranceSeconds':4*DT,'onsetModelSha256':new_manifest['modelSha256'],'classifierModels':frozen['models'],'baseline':old_score,'candidateCrops':new_score,'association':association,'mappings':mappings,'modes':modes}
    (OUT/'report.json').write_text(json.dumps(report,indent=2))
    for name,result in [('baseline',old_score),('candidateCrops',new_score),('association',association)]:print(name,json.dumps({k:v for k,v in result.items() if k!='recordings'}),flush=True)
    print('Inherited',sum(len(r['inherited']) for r in mappings),'new',sum(r['unpairedCandidate'] for r in mappings),'oldunpaired',sum(r['unpairedOld'] for r in mappings),flush=True)
if __name__=='__main__':main()
