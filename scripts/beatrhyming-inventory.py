"""Inventory a publisher supplement without evaluating or training any model.

Downloads only the authors' CC BY 4.0 supplement. No audio, model prediction,
metrical-to-time conversion, or inferred drum labels are produced.
"""
import collections
import hashlib
import io
import json
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path('artifacts/new-public-audio/beatrhyming')
API = 'https://api.figshare.com/v2/articles/24803988'
EXPECTED_MD5 = '6b630a2349d2f723c236d1afba9538b1'
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    metadata = json.loads(urllib.request.urlopen(API, timeout=30).read())
    source = next(f for f in metadata['files'] if f['id'] == 43629978)
    assert source['computed_md5'] == EXPECTED_MD5
    archive = ROOT/'supplement.zip'
    if not archive.exists():
        archive.write_bytes(urllib.request.urlopen(source['download_url'], timeout=30).read())
    payload = archive.read_bytes()
    assert hashlib.md5(payload).hexdigest() == EXPECTED_MD5
    (ROOT/'source.json').write_text(json.dumps(metadata, indent=2))
    with zipfile.ZipFile(io.BytesIO(payload)) as outer:
        inventory = [{'name': f.filename, 'bytes': f.file_size} for f in outer.infolist()]
        workbook = outer.read('supplementary_materials_v7/replacements_and_spectral_descriptors.xlsx')
    with zipfile.ZipFile(io.BytesIO(workbook)) as inner:
        strings = [''.join(e.itertext()) for e in ET.fromstring(inner.read('xl/sharedStrings.xml')).findall('s:si', NS)]
        rows = []
        for row in ET.fromstring(inner.read('xl/worksheets/sheet2.xml')).findall('s:sheetData/s:row', NS):
            values = []
            for cell in row.findall('s:c', NS):
                value = cell.find('s:v', NS)
                if value is not None:
                    values.append(strings[int(value.text)] if cell.attrib.get('t') == 's' else value.text)
            rows.append(values)
    assert rows[0][:3] == ['id', 'beatboxing_sound', 'time_of_release']
    entries = [dict(zip(rows[0], row)) for row in rows[1:]]
    times = [float(e['time_of_release']) for e in entries]
    report = {
        'source': metadata['url_public_html'], 'license': metadata['license'],
        'md5': EXPECTED_MD5, 'sha256': hashlib.sha256(payload).hexdigest(),
        'files': inventory, 'releaseTimeRows': len(entries),
        'sourceSymbols': dict(collections.Counter(e['beatboxing_sound'] for e in entries)),
        'timeRangeSeconds': [min(times), max(times)],
        'status': 'Partial reference inventory only; not used for training, selection, or evaluation.',
        'limits': ['No audio or TextGrid is present in the supplement.',
                   'The text transcription is metrical; it must not be converted to exact onset times by imposing a grid.',
                   'Release-time rows are spectral measurement tokens; completeness as a full performance transcription is not established.',
                   'Audio alignment, complete reference coverage, and literal boots-and-cats coverage are not established.'],
    }
    (ROOT/'inventory.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))

if __name__ == '__main__':
    main()
