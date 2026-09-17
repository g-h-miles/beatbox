#!/usr/bin/env python3
"""Fetch only percussion human imitations from VIS (CC BY4.0), not 7.6GB whole archive.
All downloaded recordings are locked-test; recording labels do not imply onset labels.
"""
from pathlib import Path
import csv, hashlib, json, urllib.request, urllib.parse, concurrent.futures, subprocess
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'artifacts/new-public-audio/vis'
REV='b77114c43c52f5faa7d0bb69b22e1ebca0632201'
BASE=f'https://raw.githubusercontent.com/interactiveaudiolab/VocalImitationSet/{REV}/'

def fetch(path):
    target=DEST/path;target.parent.mkdir(parents=True,exist_ok=True)
    if not target.exists():
        data=urllib.request.urlopen(BASE+urllib.parse.quote(path),timeout=60).read()
        pending=target.with_suffix(target.suffix+'.part');pending.write_bytes(data);pending.replace(target)
    return target

def row(item):
    path=fetch('vocal_imitations/included/'+item['imitation_filename'])
    info=json.loads(subprocess.check_output(['ffprobe','-v','quiet','-show_format','-show_streams','-of','json',str(path)]))
    native=item['category_d6'] or item['category_d5']
    return dict(id=item['imitation_id'],audio=str(path.relative_to(ROOT)),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),performer=item['participant_id'],nativeClass=native,sourceClass=item['category_d5'],split='locked-test',annotationLevel='recording',onsetAnnotations=None,durationSeconds=float(info['format']['duration']),sampleRate=int(info['streams'][0]['sample_rate']),channels=info['streams'][0]['channels'],license='CC-BY-4.0',source='https://github.com/interactiveaudiolab/VocalImitationSet/tree/'+REV)

def main():
    DEST.mkdir(parents=True,exist_ok=True)
    metadata=fetch('vocal_imitations.txt');fetch('README.md')
    selected=[x for x in csv.DictReader(metadata.open(),delimiter='\t') if x['included']=='True' and x['category_d5'] in ['Crash cymbal','Hi-hat','Bass drum','Snare drum']]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool: recordings=list(pool.map(row,selected))
    manifest=dict(title='Vocal Imitation Set percussion subset',source='https://zenodo.org/records/1340763',license='CC-BY-4.0',revision=REV,citation='Bongjun Kim, Madhav Ghei, Bryan Pardo, Zhiyao Duan. Vocal Imitation Set: a dataset of vocally imitated sound events using the AudioSet ontology. DCASE2018.',policy='Entire subset locked-test. Do not fit or select a model on it. Included means one expert judged it an imitation of the reference, not that each hit is a labeled drum. Hi-hat has no open/closed label. Snare includes drum rolls/rimshots, kept distinct. No onset ground truth. No public survey demographics downloaded.',recordings=recordings)
    (DEST/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    from collections import Counter
    print(len(recordings),'recordings',len(set(x['performer'] for x in recordings)),'performers',Counter(x['nativeClass'] for x in recordings))
if __name__=='__main__':main()
