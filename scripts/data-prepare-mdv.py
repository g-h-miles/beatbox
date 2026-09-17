#!/usr/bin/env python3
"""Prepare real MDV human percussion imitations with a locked performer split.

No onset times are invented. Reference drum sample audio is not redistributed or used
for training: its separate permission is academic-research only (Zenodo description).
"""
import hashlib,json,urllib.request,zipfile,wave
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'artifacts/new-public-audio'
URL='https://zenodo.org/api/records/804262/files/vocal_imitation_percussion_sounds_dataset.zip/content'
MD5='002819e45ec5178eeffa0a2b80ebf588'
NATIVE=['ride_bow','ride_edge','china_edge','splash_bell','crash_bell','ride_edge','hat_closed','hat_closed','hat_half_open','hat_open','hat_open','hat_half_open']+['kick']*6+['snare']*6+['tom']*6
CORE=['cymbal']*6+['hat']*6+['kick']*6+['snare']*6+['tom']*6

def main():
    DEST.mkdir(parents=True,exist_ok=True)
    archive=DEST/'mdv.zip'
    if not archive.exists():
        with urllib.request.urlopen(URL,timeout=180) as response: data=response.read()
        if hashlib.md5(data).hexdigest()!=MD5:raise ValueError('MDV archive checksum mismatch')
        archive.write_bytes(data)
    if hashlib.md5(archive.read_bytes()).hexdigest()!=MD5:raise ValueError('MDV archive checksum mismatch')
    with zipfile.ZipFile(archive) as z:
        for entry in z.infolist():
            if not entry.filename.startswith('data/imitations/') or not entry.filename.endswith('.wav'):continue
            target=DEST/'mdv'/entry.filename
            if not target.resolve().is_relative_to((DEST/'mdv').resolve()):raise ValueError('unsafe zip entry')
            target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(z.read(entry))
    recordings=[]
    for path in sorted((DEST/'mdv/data/imitations').glob('imitator_*/*.wav')):
        performer=int(path.parent.name.split('_')[-1]);sample=int(path.stem)
        split='train' if performer<8 else 'validation' if performer<11 else 'locked-test'
        with wave.open(str(path)) as f:duration=f.getnframes()/f.getframerate();sr=f.getframerate();channels=f.getnchannels()
        recordings.append(dict(id=f'mdv-{performer}-{sample}',performer=performer,referenceSample=sample,sourceClass=CORE[sample],nativeClass=NATIVE[sample],audio=str(path.relative_to(ROOT)),split=split,annotationLevel='recording',onsetAnnotations=None,durationSeconds=duration,sampleRate=sr,channels=channels,sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
    assert len(recordings)==420
    m=dict(title='Vocal imitation of percussion sounds dataset',source='https://zenodo.org/records/804262',license='CC-BY-4.0 for dataset; reference BFD sample audio has separate academic-research-only permission',citation='Adib Mehrabi, Simon Dixon, Mark Sandler (2019). Vocal imitation of percussion sounds: On the perceptual similarity between imitations and imitated sounds. PLoS ONE14(7):e0219955. https://doi.org/10.1371/journal.pone.0219955',archiveMD5=MD5,policy='Numeric performer order:0–7training,8–10validation,11–13locked-test. No calibration or model selection using testvoices. Rawvoiceaudio stays artifacts. Recordingclassaccuracy only; onset accuracy needs independent temporal annotation. Reference drum audio excluded from training and shipping.',mappingEvidence='PaperTable1 lists ordered groups cymbals,hats,kicks,snares,toms,6each. All30referenceWAVdurations match Table1 ordering withinrounding, verifying0–29 mapping. Articulation labels describe the intended reference, not independently verified voice articulation.',classMapping={str(i):dict(sourceClass=CORE[i],nativeClass=NATIVE[i]) for i in range(30)},recordings=recordings)
    (DEST/'mdv/manifest.json').write_text(json.dumps(m,indent=2)+'\n')
    print(len(recordings),Counter(x['split'] for x in recordings),Counter(x['sourceClass'] for x in recordings))
if __name__=='__main__':main()
