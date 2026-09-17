"""Training-only detector boundaries for identifying homogeneous recordings.

No validation files are read and no class labels influence onset inference.
"""
import json,sys
from pathlib import Path
import librosa,numpy as np,soundfile as sf,torch
from neural_crop_evaluate import onsets
from train_transcriber import Transcriber,RATE
out=Path('artifacts/diversity');out.mkdir(parents=True,exist_ok=True)
checkpoint=torch.load('artifacts/ml-v2/transcriber.pt',map_location='cpu',weights_only=True)
model=Transcriber().to('mps').eval();model.load_state_dict(checkpoint['state']);torch.set_num_threads(4)
validation='--validation' in sys.argv
records=[r for r in json.loads(Path('artifacts/events-v2.json').read_text()) if (15<=r['participant']<=20 if validation else r['participant']<=14)]
lookup={'hhc':'hat','hho':'hat','kd':'kick','sd':'snare'};rows=[]
for i,r in enumerate(records):
 audio,sr=sf.read(r['path'],dtype='float32',always_2d=True);audio=audio.mean(1)
 times=onsets(librosa.resample(audio,orig_sr=sr,target_sr=RATE),model,checkpoint['threshold'])
 classes={lookup[a['label']] for a in r['annotations'] if a['label'] in lookup}
 rows.append({'path':r['path'],'file':r['file'],'participant':r['participant'],'varied':len(classes)>1,'times':times.tolist()})
 if (i+1)%10==0:print(f'{i+1}/{len(records)}',flush=True)
(out/('validation.json' if validation else 'training.json')).write_text(json.dumps(rows));print('Complete',len(rows),flush=True)
