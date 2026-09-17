"""Training-selected threshold control using existing frozen probabilities only."""
import json
from pathlib import Path
import numpy as np
from scipy.signal import find_peaks
from native_timing_audit import match

SOURCE=Path('artifacts/peak-distance');OUT=Path('artifacts/peak-threshold')
CLASSES=['hhc','hho','kd','sd']

def score(records,threshold,dt):
    rows=[]
    for r in records:
        assert 1<=r['participant']<=20
        probabilities=np.load(SOURCE/f"{r['file'][:-4]}-probabilities.npy")
        peaks,_=find_peaks(probabilities,height=threshold,distance=8,prominence=.05)
        times=peaks*dt
        truth=sorted([a for a in r['annotations'] if a['label'] in CLASSES],key=lambda a:a['time'])
        pairs=match(times,truth,.05);matched={j for _,j in pairs}
        later={i for i in range(1,len(truth)) if truth[i]['time']-truth[i-1]['time']<.1};fast=later|{i-1 for i in later}
        rows.append({'file':r['file'],'participant':r['participant'],'mode':r['mode'],'detected':len(times),'reference':len(truth),'matched':len(pairs),
                     'fastReference':len(fast),'fastMatched':len(fast&matched),'fastLaterReference':len(later),'fastLaterMatched':len(later&matched),
                     'missedClasses':{c:sum(a['label']==c and i not in matched for i,a in enumerate(truth)) for c in CLASSES},'times':times.tolist()})
    total={k:sum(r[k] for r in rows) for k in ['detected','reference','matched','fastReference','fastMatched','fastLaterReference','fastLaterMatched']}
    total.update(threshold=threshold,distanceFrames=8,prominence=.05,onsetF1=2*total['matched']/(total['detected']+total['reference']),precision=total['matched']/total['detected'],recall=total['matched']/total['reference'],
                 extras=total['detected']-total['matched'],misses=total['reference']-total['matched'],missedClasses={c:sum(r['missedClasses'][c] for r in rows) for c in CLASSES})
    total['fastRecall']=total['fastMatched']/total['fastReference'] if total['fastReference'] else None
    total['fastLaterRecall']=total['fastLaterMatched']/total['fastLaterReference'] if total['fastLaterReference'] else None
    return {**total,'recordings':rows}

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    source=json.loads((SOURCE/'frozen-selection.json').read_text());dt=source['frameSeconds']
    records=[r for r in json.loads(Path('artifacts/events-v2.json').read_text()) if 1<=r['participant']<=20 and 'Improvisation' in r['file']]
    training=[r for r in records if r['participant']<=14];validation=[r for r in records if r['participant']>=15]
    assert len(training)==27 and len(validation)==12
    trials=[score(training,t,dt) for t in [.2,.3,.4,.5,.6]]
    selected=max(trials,key=lambda r:(r['onsetF1'],-abs(r['threshold']-.4),-r['threshold']))['threshold']
    frozen={'protocol':'ml/peak_threshold_protocol.md','modelSha256':source['modelSha256'],'frameSeconds':dt,'selectedThreshold':selected,'training':trials}
    (OUT/'frozen-selection.json').write_text(json.dumps(frozen,indent=2))
    results=[score(validation,t,dt) for t in sorted({.4,selected})]
    (OUT/'report.json').write_text(json.dumps({**frozen,'validation':results},indent=2))
    for split,scores in [('training',trials),('validation',results)]:
        for r in scores:print(split,json.dumps({k:v for k,v in r.items() if k!='recordings'}),flush=True)
if __name__=='__main__':main()
