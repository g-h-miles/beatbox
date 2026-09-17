"""Read-only AVP source-phoneme alignment and existing error coverage audit.

Only AVP Personal1–28 source annotations are inspected; no LVT, reserved audio,
model fitting, inference, label changes, or onset adjustment.
"""
import csv,json
from pathlib import Path
from collections import Counter,defaultdict
import numpy as np
SOURCE=Path('artifacts/new-public-audio/avp-lvt/AVP-LVT_Dataset/AVP_Dataset/Personal')
OUT=Path('artifacts/core-phonetic-errors');OUT.mkdir(parents=True,exist_ok=True)
LABEL={'hhc':'hat','hho':'hat','kd':'kick','sd':'snare'}
def align(file,participant):
 raw=Path('artifacts/avp-full/AVP_Dataset/Personal')/f'Participant_{participant}'/file.replace('.wav','.csv')
 refs=[dict(time=float(row[0]),label=row[1].strip()) for row in csv.reader(raw.open()) if row[1].strip() in LABEL]
 src=SOURCE/f'Participant_{participant}'/file.replace('.wav','.csv')
 if not src.exists():return refs,dict(file=file,missingFile=True,references=len(refs),aligned=0)
 ann=[dict(time=float(row[0]),label=row[1].strip(),onset=row[2].strip(),coda=row[3].strip()) for row in csv.reader(src.open()) if len(row)>=4]
 pairs=sorted((abs(r['time']-a['time']),i,j) for i,r in enumerate(refs) for j,a in enumerate(ann) if r['label']==a['label'] and abs(r['time']-a['time'])<=.005)
 usedr=set();useda=set();dist=[]
 for error,i,j in pairs:
  if i in usedr or j in useda:continue
  usedr.add(i);useda.add(j);a=ann[j];refs[i].update(sourceTime=a['time'],sourceOnset=a['onset'],sourceCoda=a['coda'],alignmentError=error)
  if a['onset'] and a['coda'] and '?' not in [a['onset'],a['coda']]:refs[i]['syllable']=a['onset']+'|'+a['coda']
  dist.append(error)
 for i,r in enumerate(refs):
  if i not in usedr and ann:
   nearest=min(ann,key=lambda a:abs(a['time']-r['time']));r['nearestSourceAnyLabel']={**nearest,'distanceSeconds':abs(nearest['time']-r['time'])}
 return refs,dict(file=file,missingFile=False,references=len(refs),sourceRows=len(ann),aligned=len(usedr),known=sum('syllable'in r for r in refs),unusedSource=len(ann)-len(useda),maxError=max(dist) if dist else None,unmatched=[r for i,r in enumerate(refs) if i not in usedr])
def main():
 training=[];alignments=[]
 meta=json.load(open('artifacts/events-v2.json'))
 for row in meta:
  if not(1<=row['participant']<=14 and row['mode']=='Personal'):continue
  refs,a=align(row['file'],row['participant']);alignments.append(dict(split='train',**a))
  for i,r in enumerate(refs):
   if 'syllable'in r:training.append(dict(file=row['file'],participant=row['participant'],groove='Improvisation'in row['file'],index=i,**r))
 errors=json.load(open('artifacts/core-error-concentration/report.json'))['reports'];evaluated=[]
 for report in errors:
  split=report['split'];cache='artifacts/typesafe-group-validation' if split=='validation' else 'artifacts/native-hybrid'
  for file in sorted(set(e['file'] for e in report['events'] if e['mode']=='Personal')):
   es=[e for e in report['events'] if e['file']==file];participant=es[0]['participant'];refs,a=align(file,participant);alignments.append(dict(split=split,**a));matches={m['hit']:m for m in json.load(open(f"{cache}/{file[:-4]}.json"))['matches']}
   for e in es:
    ref=refs[matches[e['index']]['reference']];assert LABEL[ref['label']]==e['expected']
    evaluated.append(dict(split=split,**e,reference=ref))
 keys=sorted(set(e['reference']['syllable'] for e in evaluated if 'syllable'in e['reference']))
 coverage=[]
 for syllable in keys:
  tr=[r for r in training if r['syllable']==syllable];evals=[e for e in evaluated if e['reference'].get('syllable')==syllable]
  coverage.append(dict(syllable=syllable,training={kind:dict(total=sum((r['groove'] if kind=='groove' else not r['groove']) for r in tr),byLabel=dict(Counter(r['label'] for r in tr if(r['groove'] if kind=='groove' else not r['groove']))),participants=sorted(set(r['participant'] for r in tr if(r['groove'] if kind=='groove' else not r['groove'])))) for kind in ['groove','isolated']},evaluation=[dict(split=s,reference=c,total=sum(e['split']==s and e['expected']==c for e in evals),errors=sum(e['split']==s and e['expected']==c and not e['correct'] for e in evals),predictions=dict(Counter(e['predicted'] for e in evals if e['split']==s and e['expected']==c))) for s in ['validation','existingTest'] for c in ['hat','kick','snare'] if any(e['split']==s and e['expected']==c for e in evals)]))
 focus=[]
 for p in [23,25,27]:
  es=[e for e in evaluated if e['participant']==p and e['expected']=='snare'];focus.append(dict(participant=p,total=len(es),errors=sum(not e['correct'] for e in es),unmatchedPhonetic=sum('syllable'not in e['reference'] for e in es),variants=[dict(syllable=v,total=sum(e['reference'].get('syllable','UNKNOWN')==v for e in es),predictions=dict(Counter(e['predicted'] for e in es if e['reference'].get('syllable','UNKNOWN')==v))) for v in sorted(set(e['reference'].get('syllable','UNKNOWN') for e in es))]))
 alignmentSummary=[]
 for split in ['train','validation','existingTest']:
  subset=[a for a in alignments if a['split']==split];unmatched=[r for a in subset for r in a.get('unmatched',[])];conflicts=[r for r in unmatched if r.get('nearestSourceAnyLabel',{}).get('distanceSeconds',999)<=.005 and r['label']!=r['nearestSourceAnyLabel']['label']]
  alignmentSummary.append(dict(split=split,files=len(subset),references=sum(a['references'] for a in subset),aligned=sum(a['aligned'] for a in subset),labelConflicts=len(conflicts),otherUnmatched=len(unmatched)-len(conflicts),conflictTransitions=dict(Counter(r['label']+'->'+r['nearestSourceAnyLabel']['label'] for r in conflicts))))
 result=dict(protocol=__doc__,toleranceSeconds=.005,alignmentSummary=alignmentSummary,alignments=alignments,trainingKnown=len(training),coverage=coverage,focus=focus,events=evaluated)
 (OUT/'report.json').write_text(json.dumps(result,indent=2,ensure_ascii=False))
 print('FOCUS',focus)
 for s in ['train','validation','existingTest']:
  a=[r for r in alignments if r['split']==s];es=[e for e in evaluated if e['split']==s];print(s,dict(files=len(a),references=sum(r['references'] for r in a),aligned=sum(r['aligned'] for r in a),known=sum(r.get('known',0) for r in a),evaluated=len(es),evaluatedKnown=sum('syllable'in e['reference'] for e in es)))
 variants={v['syllable'] for p in focus for v in p['variants']}
 for c in coverage:
  if c['syllable'] in variants:print(c)
if __name__=='__main__':main()
