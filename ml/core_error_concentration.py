"""Read-only existing native cohort audit; no fitting or new inference."""
import json
from pathlib import Path
import numpy as np
NAMES=['hat','kick','snare']
def core(s):return 'hat' if s in ['closed','open'] else s
def main():
 reports=[]
 for split,source,key,cache in [('validation','artifacts/typesafe-group-validation/predictions.json','core','artifacts/typesafe-group-validation'),('existingTest','artifacts/browser-relative/existing-test/predictions.json','candidateCore','artifacts/native-hybrid')]:
  rows=json.load(open(source))['rows'];groups=[];events=[];records=[]
  for row in rows:
   assert (15<=row['participant']<=20) if split=='validation' else (21<=row['participant']<=28)
   saved=json.load(open(f"{cache}/{row['stem']}.json"));matches={m['hit']:m for m in saved['matches']};model=row[key];local=[]
   for i,time in enumerate(row['times']):
    if i not in matches:continue
    expected=core(matches[i]['expected']);p=int(model['labels'][i]);margins=model['pooledMargins'][i];votes=[0,0,0];winnerMargins=[];col=0
    for a in range(3):
     for b in range(a+1,3):
      score=margins[col];votes[a if score>0 else b]+=1
      if p==a:winnerMargins.append(score)
      elif p==b:winnerMargins.append(-score)
      col+=1
    e=dict(file=row['file'],participant=row['participant'],mode=row['mode'],index=i,time=time,group=model['groups'][i],expected=expected,predicted=NAMES[p],correct=NAMES[p]==expected,votes=votes,winningVotes=votes[p],winningMinMargin=min(winnerMargins),winningMeanMargin=float(np.mean(winnerMargins)),pooledMargins=margins)
    local.append(e);events.append(e)
   for g in sorted(set(model['groups'])):
    subset=[e for e in local if e['group']==g]
    if not subset:continue
    counts={n:sum(e['expected']==n for e in subset) for n in NAMES};wrong=sum(not e['correct'] for e in subset);major=max(counts,key=counts.get)
    groups.append(dict(file=row['file'],participant=row['participant'],mode=row['mode'],group=int(g),allDetectedMembers=model['groups'].count(g),matched=len(subset),errors=wrong,errorFraction=wrong/len(subset),referenceCounts=counts,referencePurity=counts[major]/len(subset),predicted=subset[0]['predicted'],winningVotes=subset[0]['winningVotes'],winningMinMargin=subset[0]['winningMinMargin'],winningMeanMargin=subset[0]['winningMeanMargin'],firstTime=min(e['time'] for e in subset),lastTime=max(e['time'] for e in subset)))
   records.append(dict(file=row['file'],participant=row['participant'],mode=row['mode'],matched=len(local),errors=sum(not e['correct'] for e in local),byReference={n:dict(total=sum(e['expected']==n for e in local),errors=sum(e['expected']==n and not e['correct'] for e in local)) for n in NAMES}))
  wrong=[e for e in events if not e['correct']];correct=[e for e in events if e['correct']];ranked=sorted(groups,key=lambda g:g['errors'],reverse=True);cum=0;n80=0
  for g in ranked:
   if cum>=.8*len(wrong):break
   cum+=g['errors'];n80+=1
  margin=lambda subset:dict(count=len(subset),twoWinningVotes=sum(e['winningVotes']==2 for e in subset),minMarginQuantiles=np.quantile([e['winningMinMargin'] for e in subset],[0,.25,.5,.75,1]).tolist(),meanMarginQuantiles=np.quantile([e['winningMeanMargin'] for e in subset],[0,.25,.5,.75,1]).tolist())
  report=dict(split=split,matched=len(events),correct=len(correct),errors=len(wrong),groups=len(groups),errorGroups=sum(g['errors']>0 for g in groups),entirelyWrongGroups=sum(g['errors']==g['matched'] for g in groups),errorsInEntirelyWrongGroups=sum(g['errors'] for g in groups if g['errors']==g['matched']),errorsInGroupsAtLeast5WrongAnd80PercentWrong=sum(g['errors'] for g in groups if g['errors']>=5 and g['errorFraction']>=.8),groupsCovering80PercentErrors=n80,top5GroupErrors=sum(g['errors'] for g in ranked[:5]),correctMargins=margin(correct),errorMargins=margin(wrong),confusions={f'{a}->{b}':sum(e['expected']==a and e['predicted']==b for e in events) for a in NAMES for b in NAMES if a!=b},records=sorted(records,key=lambda r:r['errors'],reverse=True),groupsRanked=ranked,events=events)
  expected=(672,639) if split=='validation' else(1141,962);assert(report['matched'],report['correct'])==expected
  reports.append(report)
 Path('artifacts/core-error-concentration/report.json').write_text(json.dumps(dict(protocol=__doc__,reports=reports),indent=2))
 for r in reports:
  print({k:v for k,v in r.items() if k not in ['records','groupsRanked','events']});print('TOPGROUPS',r['groupsRanked'][:6]);print('TOPRECORDS',r['records'][:6])
if __name__=='__main__':main()
