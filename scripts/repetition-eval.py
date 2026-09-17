#!/usr/bin/env python3
"""Frozen label-blind repetition consistency experiment on saved TypeSafe outputs.
No model/API calls, labels in grouping, or threshold sweep. Original event times stay.
"""
import argparse,json,math
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parents[1]
CONFIG={'pairLimits':{'spectrumLog10Rms':.2,'centroidRatio':1.2,'durationRatio':1.5,'bandShareL1':.18,'zcrAbsolute':.04},'minimumGroupSize':3,'minimumPosterior':.8,'minimumVoteShare':.8}
CLASSES=['kick','snare','closed','open','ride','crash','aux']
def core(x):return 'hat' if x in ['closed','open'] else x

def distance(a,b):
    x,y=a['features'],b['features'];p=CONFIG['pairLimits']
    spectral=math.sqrt(sum((v-w)**2 for v,w in zip(x['spectrum'],y['spectrum']))/len(x['spectrum']))
    if spectral>p['spectrumLog10Rms']:return float('inf')
    for key,limit in [('centroid',p['centroidRatio']),('duration',p['durationRatio'])]:
        if max(x[key],y[key],1e-8)/max(min(x[key],y[key]),1e-8)>limit:return float('inf')
    if sum(abs(x[k]-y[k]) for k in ['low','mid','high'])>p['bandShareL1']:return float('inf')
    if abs(x['zcr']-y['zcr'])>p['zcrAbsolute']:return float('inf')
    return spectral

def cluster(hits):
    groups=[[i] for i in range(len(hits))]
    distances={(i,j):distance(hits[i],hits[j]) for i in range(len(hits)) for j in range(i+1,len(hits))}
    while True:
        best=None
        for i in range(len(groups)):
            for j in range(i+1,len(groups)):
                dist=max(distances[tuple(sorted((a,b)))] for a in groups[i] for b in groups[j])
                candidate=(dist,i,j)
                if math.isfinite(dist) and (best is None or candidate<best):best=candidate
        if best is None:break
        _,i,j=best;groups[i]+=groups[j];del groups[j]
    return groups

def summarize(rows,field):
    s={k:sum(r[k] for r in rows) for k in ['detected','reference','matched']}
    s['correctFour']=sum(r[field+'Four'] for r in rows);s['correctCore']=sum(r[field+'Core'] for r in rows)
    s.update(onsetF1=2*s['matched']/(s['detected']+s['reference']),jointFourF1=2*s['correctFour']/(s['detected']+s['reference']),jointCoreF1=2*s['correctCore']/(s['detected']+s['reference']),conditionalFour=s['correctFour']/s['matched'],conditionalCore=s['correctCore']/s['matched'])
    return s

def run(path):
    d=json.loads(path.read_text());hits=d['hits'];groups=cluster(hits)
    old=[h['answer']['drum'] for h in hits];new=old.copy();audit=[]
    for group in groups:
        if len(group)<2:continue
        probs={k:sum(hits[i]['answer']['probabilities'].get(k,0) for i in group)/len(group) for k in CLASSES}
        label=max(CLASSES,key=lambda k:probs[k]);votes=Counter(old[i] for i in group)
        accepted=len(group)>=CONFIG['minimumGroupSize'] and probs[label]>=CONFIG['minimumPosterior'] and votes[label]/len(group)>=CONFIG['minimumVoteShare']
        if accepted:
            for i in group:new[i]=label
        audit.append(dict(eligible=len(group)>=CONFIG['minimumGroupSize'],hits=group,times=[hits[i]['time'] for i in group],originalVotes=dict(votes),pooledProbabilities=probs,accepted=accepted,changed=[i for i in group if new[i]!=old[i]]))
    # Ground truth is first accessed here, after grouping and predictions have finished.
    s=d['score'];matches=s['matches'];beforeFour=sum(old[m['hit']]==m['expected'] for m in matches);beforeCore=sum(core(old[m['hit']])==core(m['expected']) for m in matches)
    afterFour=sum(new[m['hit']]==m['expected'] for m in matches);afterCore=sum(core(new[m['hit']])==core(m['expected']) for m in matches)
    matchedByHit={m['hit']:m for m in matches}
    changed=[]
    for i in range(len(hits)):
        if old[i]!=new[i]:
            m=matchedByHit.get(i);changed.append(dict(hit=i,time=hits[i]['time'],before=old[i],after=new[i],expected=m['expected'] if m else None))
    return dict(file=d['file'],pipeline=d['pipeline'],detected=len(hits),reference=s['reference'],matched=len(matches),beforeFour=beforeFour,beforeCore=beforeCore,afterFour=afterFour,afterCore=afterCore,changed=changed,groups=audit,totalGroups=len(groups),groupSizeHistogram=dict(Counter(map(len,groups))))

def main():
    p=argparse.ArgumentParser();p.add_argument('directory',nargs='?',default='artifacts/neural-typesafe');p.add_argument('--output',default='artifacts/repetition/report.json');args=p.parse_args()
    rows=[]
    for path in sorted((ROOT/args.directory).glob('*.json')):
        d=json.loads(path.read_text())
        if d.get('completed') and 'hits' in d and 'score' in d:rows.append(run(path))
    for row in rows:
        row['before']=summarize([row],'before');row['after']=summarize([row],'after')
    summaries=[]
    for pipeline in sorted(set(r['pipeline'] for r in rows)):
        group=[r for r in rows if r['pipeline']==pipeline];summaries.append(dict(pipeline=pipeline,before=summarize(group,'before'),after=summarize(group,'after'),changed=sum(len(r['changed']) for r in group),eligibleGroups=sum(g['eligible'] for r in group for g in r['groups']),ambiguousGroups=sum(len(g['originalVotes'])>1 for r in group for g in r['groups'])))
    result=dict(protocol=CONFIG,selection='Existing preselected public validation recordings. No new test cohort.',limitations=['One frozen protocol, no label-guided parameter tuning.','Pooling can propagate a consistent wrong instrument mapping.','Similarity is based on available basic features and may conflate articulations.','No timing or event count changes, so onset F1 is unchanged.'],summaries=summaries,recordings=rows)
    output=ROOT/args.output;output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(summaries,indent=2))
if __name__=='__main__':main()
