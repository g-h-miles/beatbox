"""Only the three pre-existing Beatboxset validation recordings; no fitting."""
import json,pickle
from pathlib import Path
import soundfile as sf
import numpy as np
from browser_relative_event_export import outputs
OUT=Path('artifacts/typesafe-noncore');OUT.mkdir(parents=True,exist_ok=True)
ALLOWED=['putfile_bui','putfile_dbztenkaichi','putfile_pepouni']
if __name__=='__main__':
 import sys
 if '--models' not in sys.argv:
  rows=[]
  for stem in ALLOWED:
   audio,rate=sf.read(f'artifacts/beatboxset1/{stem}.wav',dtype='float32',always_2d=True)
   originalDuration=len(audio)/rate;audio=audio[:90*rate]
   audio.mean(1).astype('<f4').tofile(OUT/f'{stem}-audio.f32')
   rows.append(dict(file=stem+'.wav',stem=stem,sampleRate=rate,duration=len(audio)/rate,originalDuration=originalDuration))
  (OUT/'audio-manifest.json').write_text(json.dumps({'rows':rows},indent=2))
 else:
  models=[pickle.load(open(f'artifacts/browser-relative/browser-relative-{k}.pkl','rb')) for k in [3,4]];rows=[]
  for row in json.loads((OUT/'native-manifest.json').read_text())['rows']:
   assert row['stem'] in ALLOWED
   x=np.fromfile(OUT/f"{row['stem']}-features.f32",dtype='float32').reshape(-1,1104)
   core,four=[outputs(m,x,k) for m,k in zip(models,[3,4])]
   combined=[(0 if four['pooledMargins'][i][0]>0 else 1) if c==0 else c+1 for i,c in enumerate(core['labels'])]
   annotations={}
   for a in ['DR','HT']:
    annotations[a]=[dict(time=float(line.split(',')[0]),label=line.split(',')[-1].strip()) for line in Path(f"artifacts/beatboxset1/Annotations_{a}/{row['stem']}.csv").read_text().splitlines() if float(line.split(',')[0])<row['duration']]
   rows.append({**row,'core':core,'four':four,'combined':combined,'annotations':annotations})
  (OUT/'predictions.json').write_text(json.dumps({'rows':rows},indent=2))
