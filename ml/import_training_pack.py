"""Import a private browser training pack; keep fresh takes out of training.

Recording-level labels come from the performer. Onsets still need annotation or
review before these recordings can become a transcription benchmark.
"""
import argparse
import base64
import hashlib
import json
import re
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

DRUMS = {'kick', 'closed', 'open', 'ride', 'crash', 'snare', 'aux'}


def import_pack(path, voice_id, root=Path('artifacts/voice-data')):
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', voice_id):
        raise ValueError('Use a voice ID containing only letters, numbers, underscores or hyphens.')
    path = Path(path)
    if path.stat().st_size > 60_000_000:
        raise ValueError('Training pack exceeds 60 MB.')
    content = path.read_bytes()
    pack = json.loads(content)
    if pack.get('format') != 'beatbox-training-v1':
        raise ValueError('Unsupported training-pack format.')
    recordings = pack.get('recordings', [])
    if not isinstance(recordings, list) or not 1 <= len(recordings) <= 14:
        raise ValueError('Expected between one and fourteen recordings.')
    folder = Path(root) / voice_id
    folder.mkdir(parents=True, exist_ok=True)
    destination = folder / hashlib.sha256(content).hexdigest()[:12]
    if destination.exists():
        return destination / 'manifest.json'
    seen_ids, seen_audio, entries = set(), {}, []
    with tempfile.TemporaryDirectory(prefix='.import-', dir=folder) as temporary:
        work = Path(temporary)
        for entry in recordings:
            drum, split = entry.get('drum'), entry.get('split')
            if drum not in DRUMS or split not in {'training', 'holdout'}:
                raise ValueError('Invalid drum label or recording split.')
            expected_id = f'{drum}-{1 if split == "training" else 2}'
            if entry.get('id') != expected_id or expected_id in seen_ids:
                raise ValueError('Invalid or duplicate recording ID.')
            seen_ids.add(expected_id)
            data = base64.b64decode(entry.get('audioBase64', ''), validate=True)
            if not 1 <= len(data) <= 4_000_000:
                raise ValueError('A recording is empty or exceeds 4 MB.')
            source = work / f'{expected_id}.source'
            source.write_bytes(data)
            output = work / f'{expected_id}.wav'
            process = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(source),
                                      '-t', '62', '-vn', '-ac', '1', '-ar', '22050',
                                      '-c:a', 'pcm_s16le', str(output)], capture_output=True, timeout=30)
            if process.returncode:
                raise ValueError(f'Could not decode {expected_id}.')
            source.unlink()
            with wave.open(str(output)) as audio:
                seconds = audio.getnframes() / audio.getframerate()
                pcm = audio.readframes(audio.getnframes())
            if not .5 <= seconds <= 61.5:
                raise ValueError(f'{expected_id} must be between 0.5 and 61.5 seconds.')
            if np.max(np.abs(np.frombuffer(pcm, dtype='<i2').astype(np.int32))) < 4:
                raise ValueError(f'{expected_id} contains no usable audio.')
            digest = hashlib.sha256(pcm).hexdigest()
            if digest in seen_audio:
                raise ValueError(f'{expected_id} duplicates {seen_audio[digest]}; record a fresh take.')
            seen_audio[digest] = expected_id
            entries.append({'file': output.name, 'drum': drum, 'split': split,
                            'duration': seconds, 'pcmSha256': digest,
                            'onsetAnnotations': None, 'annotationStatus': 'recording-label-only'})
        manifest = {'format': 'beatbox-voice-data-v1', 'voiceId': voice_id,
                    'sourcePackSha256': hashlib.sha256(content).hexdigest(),
                    'recordings': entries, 'note': 'Do not fit or tune on holdout takes. Onsets are not yet ground truth.'}
        (work / 'manifest.json').write_text(json.dumps(manifest, indent=2))
        work.rename(destination)
    return destination / 'manifest.json'


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('pack')
    parser.add_argument('--voice-id', required=True)
    args = parser.parse_args()
    print(import_pack(args.pack, args.voice_id))
