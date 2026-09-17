"""Allowlisted public isolated training audio for exact-browser context insertion."""
import hashlib,json
from pathlib import Path
import numpy as np
import soundfile as sf
OUT=Path('artifacts/browser-isolated-context');OUT.mkdir(parents=True,exist_ok=True)
def main():
 classes=['hhc','hho','kd','sd'];training=json.load(open('artifacts/browser-relative/training-manifest.json'))['rows'];contexts={(r['participant'],r['mode']):r for r in training};rows=[]
 for r in json.load(open('artifacts/events-v2.json')):
  if not 1<=r['participant']<=14 or 'Improvisation' in r['file']:continue
  assert (r['participant'],r['mode']) in contexts
  assert all(a['label'] in classes for a in r['annotations'])
  expected=Path('artifacts/avp-full/AVP_Dataset')/r['mode']/f"Participant_{r['participant']}"/r['file'];assert Path(r['path']).resolve()==expected.resolve()
  audio,rate=sf.read(expected,dtype='float32',always_2d=True);stem=Path(r['file']).stem;audio.mean(1).astype('<f4').tofile(OUT/f'{stem}-audio.f32')
  context=contexts[r['participant'],r['mode']];raw=np.fromfile(f"artifacts/browser-absolute-relative/{context['stem']}-features.f32",dtype='float32').reshape(-1,2208)
  original=Path(f"artifacts/browser-relative/{context['stem']}-features.f32").read_bytes();assert np.array_equal(raw[:,1104:],np.frombuffer(original,dtype='float32').reshape(-1,1104))
  raw[:,:1104].copy().tofile(OUT/f"{context['stem']}-context.f32")
  annotations=sorted(r['annotations'],key=lambda a:a['time'])
  rows.append({'file':r['file'],'stem':stem,'participant':r['participant'],'mode':r['mode'],'sampleRate':rate,'times':[a['time'] for a in annotations],'labels':[classes.index(a['label']) for a in annotations],'contextStem':context['stem'],'contextRows':len(raw),'originalContextSha256':hashlib.sha256(original).hexdigest(),'featureFile':f'{stem}-features.f32'})
 assert len(rows)==108 and sum(len(r['times']) for r in rows)==2943
 (OUT/'input-manifest.json').write_text(json.dumps({'rows':rows},indent=2));print('Prepared108files2943isolatedevents')
if __name__=='__main__':main()
