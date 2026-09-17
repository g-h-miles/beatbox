#!/usr/bin/env python3
"""Download three pinned CC0 human beatbox previews and optional AVP-LVT archive.

No annotation is inferred from titles, and downloads are reserved test inputs except the boots/cats development clip.
Run from the repository root. Requires Python standard library and ffprobe.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'artifacts/new-public-audio'
SOURCES = [
    ('740030', 'itinerantmonk108', 'G Beat Box boots n cats', '740030_2397507', '4aea162754fccae8f049da5b3c37f2ec8044f5d9baee2307f95324013816b090', 'Real performer recorded on iPhone12. Title indicates boots/cats; no event labels or timing assumed.'),
    ('256336', 'Kodack', 'beatbox 100 bpm heavier loop', '256336_2276808', '2a082212ab085ab41d30bde5ac1f8c96d9bc3e7ee0450e1f473215659380d5f8', 'Human beatbox recorded with Sony HDR PJ260V and edited with Audacity.'),
    ('401765', 'TheFlakesMaster', 'Beatbox', '401765_7682129', 'f81b6c739569bc68660c864177c1a1f2eced90df18557c336101d715e9527ca1', 'Short human beatbox loop recorded with Mixcraft8; processing unspecified.'),
]

def fetch(url, path, digest=None, algorithm='sha256'):
    if path.exists() and digest and hashlib.new(algorithm, path.read_bytes()).hexdigest() == digest:
        return
    with urllib.request.urlopen(url, timeout=180) as response:
        data = response.read()
    if digest and hashlib.new(algorithm, data).hexdigest() != digest:
        raise ValueError(f'Checksum mismatch: {path.name}')
    pending = path.with_suffix(path.suffix + '.part')
    pending.write_bytes(data)
    pending.replace(path)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--avp-lvt', action='store_true', help='Also download the 114.7MB official archive; LVT audio is NOT included')
    args = parser.parse_args()
    DEST.mkdir(parents=True, exist_ok=True)
    recordings = []
    for sid, creator, title, asset, digest, notes in SOURCES:
        source = f'https://freesound.org/people/{creator}/sounds/{sid}/'
        page = DEST / f'freesound-{sid}.html'
        fetch(source, page)
        if 'Creative Commons 0' not in page.read_text():
            raise ValueError(f'CC0 license not found on {source}; review source before using')
        download = f'https://cdn.freesound.org/previews/{sid[:3]}/{asset}-hq.mp3'
        audio = DEST / f'freesound-{sid}.mp3'
        fetch(download, audio, digest)
        probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'quiet', '-show_format', '-show_streams', '-of', 'json', str(audio)]))
        recordings.append(dict(id=f'freesound-{sid}', creator=creator, title=title, source=source, download=download, license='CC0-1.0', audio=str(audio.relative_to(ROOT)), sha256=digest, split='development' if sid == '740030' else 'locked-test', annotationStatus='unannotated; no ground truth invented', notes=notes, durationSeconds=float(probe['format']['duration']), sampleRate=int(probe['streams'][0]['sample_rate']), channels=probe['streams'][0]['channels']))
    (DEST / 'public-loops-manifest.json').write_text(json.dumps(dict(policy='No model selection, training, calibration, or threshold tuning for locked-test entries. Ground truth requires manual review. Boots/cats740030 is explicitly released to development. Other entries remain locked-test. These are MP3 previews, not original WAV files.', recordings=recordings), indent=2) + '\n')
    if args.avp_lvt:
        fetch('https://zenodo.org/api/records/5578744', DEST / 'zenodo-5578744-metadata.json')
        fetch('https://zenodo.org/api/records/5578744/files/AVP-LVT_Dataset.zip/content', DEST / 'AVP-LVT_Dataset.zip', '3cc38636623e2861cbda145d889e959a', 'md5')
    print(f'Prepared {len(recordings)} recordings in {DEST}; labels remain unannotated.')

if __name__ == '__main__':
    main()
