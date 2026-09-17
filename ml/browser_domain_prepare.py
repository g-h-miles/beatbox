"""Allowlisted first8 Beatboxset training recordings, first90seconds only."""
import json
from pathlib import Path
import soundfile as sf
OUT=Path('artifacts/browser-domain')

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    records=sorted(json.loads(Path('artifacts/external-events-v2.json').read_text()),key=lambda r:r['file'])[:8]
    allowed=[r['file'] for r in records];rows=[]
    for r in records:
        expected=Path('artifacts/beatboxset1')/r['file'];assert Path(r['path']).resolve()==expected.resolve()
        info=sf.info(expected);limit=min(info.frames,int(info.samplerate*90))
        audio,rate=sf.read(expected,frames=limit,dtype='float32',always_2d=True)
        stem=r['file'][:-4];audio.mean(1).astype('<f4').tofile(OUT/f'{stem}-native.f32')
        rows.append({'file':r['file'],'stem':stem,'sampleRate':rate,'duration':len(audio)/rate})
    (OUT/'training-audio-manifest.json').write_text(json.dumps({'allowed':allowed,'rows':rows},indent=2));print(allowed,flush=True)
if __name__=='__main__':main()
