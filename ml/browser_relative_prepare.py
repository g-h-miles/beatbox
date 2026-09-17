"""Export only allowlisted AVP1–14 annotated groove audio for browser fitting."""
import json
from pathlib import Path
import numpy as np
import soundfile as sf

OUT = Path('artifacts/browser-relative')
CLASSES = ['hhc', 'hho', 'kd', 'sd']

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    records = {r['file']: r for r in json.loads(Path('artifacts/events-v2.json').read_text())}
    allowlist = [(p, mode, f'P{p}_Improvisation_{mode}.wav')
                 for p in range(1, 15) for mode in ['Fixed', 'Personal']]
    rows = []
    for participant, mode, filename in allowlist:
        if filename not in records:
            continue
        record = records[filename]
        expected = Path('artifacts/avp-full/AVP_Dataset')/mode/f'Participant_{participant}'/filename
        assert Path(record['path']).resolve() == expected.resolve()
        assert record['participant'] == participant and record['mode'] == mode
        audio, rate = sf.read(expected, dtype='float32', always_2d=True)
        annotations = sorted(record['annotations'], key=lambda a: a['time'])
        assert all(a['label'] in CLASSES for a in annotations)
        audio.mean(1).astype('<f4').tofile(OUT/f'{filename[:-4]}-native.f32')
        rows.append({'file': filename, 'stem': filename[:-4], 'participant': participant,
                     'mode': mode, 'sampleRate': rate, 'times': [a['time'] for a in annotations],
                     'labels': [CLASSES.index(a['label']) for a in annotations]})
    assert len(rows) == 27 and sum(len(r['times']) for r in rows) == 1161
    (OUT/'training-manifest.json').write_text(json.dumps({'classes': CLASSES, 'rows': rows}, indent=2))
    print('Exported27allowlisted training recordings /1161annotated events')

if __name__ == '__main__': main()
