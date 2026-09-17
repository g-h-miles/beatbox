"""Export only previously inspected public AVP21–28 grooves after model freeze."""
import json
from pathlib import Path
import soundfile as sf

OUT=Path('artifacts/browser-relative/existing-test')

def main():
    assert Path('artifacts/browser-relative/combiner-frozen.json').exists()
    OUT.mkdir(parents=True,exist_ok=True)
    records={r['file']:r for r in json.loads(Path('artifacts/events-v2.json').read_text())}
    rows=[]
    for participant in range(21,29):
        for mode in ['Fixed','Personal']:
            filename=f'P{participant}_Improvisation_{mode}.wav'
            if filename not in records: continue
            record=records[filename]
            expected=Path('artifacts/avp-full/AVP_Dataset')/mode/f'Participant_{participant}'/filename
            assert Path(record['path']).resolve()==expected.resolve()
            audio,rate=sf.read(expected,dtype='float32',always_2d=True)
            audio.mean(1).astype('<f4').tofile(OUT/f'{filename[:-4]}-native.f32')
            rows.append({'file':filename,'stem':filename[:-4],'participant':participant,'mode':mode,'sampleRate':rate})
    assert len(rows)==14
    (OUT/'audio-manifest.json').write_text(json.dumps({'rows':rows},indent=2))
    print('Exported',len(rows),'previously inspected test grooves; no reserved audio')
if __name__=='__main__':main()
