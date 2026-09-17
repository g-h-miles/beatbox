#!/usr/bin/env python3
"""Compare frozen SVM and TypeSafe predictions, without fitting or tuned gates."""
from pathlib import Path
import json
from collections import Counter
ROOT=Path(__file__).resolve().parents[1]
CORE=lambda x:'hat' if x in ['open','closed'] else x

def main():
    svm=json.loads((ROOT/'artifacts/neural-crop/relative-report.json').read_text())
    rows=[]
    for path in sorted((ROOT/'artifacts/neural-typesafe').glob('*-neuralActive.json')):
        ts=json.loads(path.read_text())
        if not ts.get('completed'):continue
        sr=next(r for r in svm['recordings'] if r['file']==ts['file'] and r['pipeline']=='neural')
        hits=ts['hits'];events=sr['events'];assert len(hits)==len(events)
        # Align using frozen onset timestamps, never using references or ground truth.
        svmpred=[];tspred=[];combined=[];decisions=[]
        used=set()
        for i,h in enumerate(hits):
            candidates=[j for j,e in enumerate(events) if abs(e['time']-h['time'])<1e-8]
            assert len(candidates)==1 and candidates[0] not in used
            j=candidates[0];used.add(j);s=svm['classes'][events[j]['class']];t=CORE(h['answer']['drum'])
            probs=Counter()
            for label,p in h['answer']['probabilities'].items():probs[CORE(label)]+=p
            ranked=sorted(probs,key=lambda k:(-probs[k],k))
            override=probs[ranked[0]]<.6 and s==ranked[1] and t!=s
            c=s if override else t
            svmpred.append(s);tspred.append(t);combined.append(c)
            decisions.append(dict(hit=i,time=h['time'],typeSafe=t,svm=s,combined=c,typeSafeCoreProbabilities=dict(probs),override=override))
        # First use ground truth here, after decisions are finalized.
        matches=ts['score']['matches'];counts=Counter();disagreements=[]
        for m in matches:
            i=m['hit'];expected=CORE(m['expected']);a=tspred[i]==expected;b=svmpred[i]==expected
            counts['typeSafeCorrect']+=a;counts['svmCorrect']+=b;counts['combinedCorrect']+=combined[i]==expected
            counts['oracleCorrect']+=a or b;counts['bothCorrect']+=a and b;counts['bothWrong']+=not a and not b
            counts['onlyTypeSafeCorrect']+=a and not b;counts['onlySvmCorrect']+=b and not a
            counts['agreementMatched']+=tspred[i]==svmpred[i]
            if tspred[i]!=svmpred[i]:disagreements.append(dict(**decisions[i],expected=expected,typeSafeCorrect=a,svmCorrect=b))
        denom=len(hits)+ts['score']['reference'];n=len(matches)
        metrics={method:dict(correct=counts[method+'Correct'],conditionalAccuracy=counts[method+'Correct']/n,jointCoreF1=2*counts[method+'Correct']/denom) for method in ['typeSafe','svm','combined','oracle']}
        rows.append(dict(file=ts['file'],detected=len(hits),reference=ts['score']['reference'],matched=n,agreementAll=sum(a==b for a,b in zip(tspred,svmpred)),overrideCount=sum(d['override'] for d in decisions),counts=dict(counts),metrics=metrics,disagreements=disagreements,overrides=[d for d in decisions if d['override']]))
    n=sum(r['matched'] for r in rows);denom=sum(r['detected']+r['reference'] for r in rows)
    totals={key:sum(r['counts'].get(key,0) for r in rows) for key in set(k for r in rows for k in r['counts'])}
    metrics={method:dict(correct=totals[method+'Correct'],conditionalAccuracy=totals[method+'Correct']/n,jointCoreF1=2*totals[method+'Correct']/denom) for method in ['typeSafe','svm','combined','oracle']}
    result=dict(protocol='Frozen predictions; exact onset-time alignment (<1e-8s). Collapse open+closed posterior to hat. Override only when top TypeSafe core posterior<0.60 and SVM chooses second-ranked TypeSafe core class. No fitting/threshold tuning.',oracle='Analysis-only upper bound selecting the correct label if either classifier is correct on an existing matched onset. It cannot fix missing/extra onsets and is not an implementable classifier.',cohort='Four preselected P15/P16 AVP Fixed+Personal validation recordings; no new held-out score.',matched=n,detected=sum(r['detected'] for r in rows),reference=sum(r['reference'] for r in rows),overrideCount=sum(r['overrideCount'] for r in rows),counts=totals,metrics=metrics,recordings=rows)
    (ROOT/'artifacts/repetition/ensemble-report.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k!='recordings'},indent=2))
    for r in rows: print(r['file'],r['metrics'],r['overrideCount'])
if __name__=='__main__':main()
