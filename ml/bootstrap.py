"""Download pinned BEATs assets; validate hashes before loading model code/weights."""
import hashlib
import json
import urllib.request
from pathlib import Path

root = Path('artifacts/beats')
root.mkdir(parents=True, exist_ok=True)
for item in json.loads(Path('ml/pretrained-manifest.json').read_text()):
    path = root / item['name']
    if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == item['sha256']:
        print('Verified', item['name']); continue
    partial = path.with_suffix(path.suffix + '.part')
    with urllib.request.urlopen(item['url'], timeout=120) as response, partial.open('wb') as destination:
        while chunk := response.read(1024 * 1024): destination.write(chunk)
    if hashlib.sha256(partial.read_bytes()).hexdigest() != item['sha256']:
        raise ValueError(f'Checksum mismatch: {item["name"]}')
    partial.replace(path)
    print('Downloaded and verified', item['name'])
