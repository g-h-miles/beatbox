"""Frozen native validation export only; no fitting or test audio access."""
import json,pickle
from pathlib import Path
import numpy as np
import soundfile as sf
from browser_relative_event_export import outputs
OUT=Path('artifacts/typesafe-group-validation');OUT.mkdir(parents=True,exist_ok=True)
models=[pickle.load(open(f'artifacts/browser-relative/browser-relative-{k}.pkl','rb')) for k in [3,4]]
rows=[]
for source in json.load(open('artifacts/four-relative/native-manifest.json'))['rows']:
 stem=source['stem'];participant=int(stem.split('_')[0][1:]);mode=stem.split('_')[-1]
 assert 15<=participant<=20
 samples,rate=sf.read(f'artifacts/avp-full/AVP_Dataset/{mode}/Participant_{participant}/{stem}.wav',dtype='float32',always_2d=True)
 samples.mean(1).astype('<f4').tofile(OUT/f'{stem}-audio.f32')
 x=np.fromfile(f'artifacts/four-relative/{stem}-native.f32',dtype='float32').reshape(-1,1104)
 core,four=[outputs(m,x,k) for m,k in zip(models,[3,4])]
 combined=[(0 if four['pooledMargins'][i][0]>0 else 1) if c==0 else c+1 for i,c in enumerate(core['labels'])]
 assert len(combined)==len(source['nativeTimes'])
 rows.append(dict(file=source['file'],stem=stem,participant=participant,mode=mode,sampleRate=rate,times=source['nativeTimes'],core=core,four=four,combined=combined))
assert len(rows)==12 and sum(len(r['times']) for r in rows)==707
(OUT/'predictions.json').write_text(json.dumps({'rows':rows},indent=2))
print('Exported frozen 707 native validation events, no test audio.')
