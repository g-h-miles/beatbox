"""Attach published phoneme labels to AVP training annotations without moving onsets.

Only explicitly selected AVP Personal performers are read. Fixed labels are not
guessed, and LVT files are never opened. Output keeps the input event manifest's
paths, drum labels, onset times, detections, and split information unchanged.
"""
import argparse
import csv
import json
from collections import Counter
from pathlib import Path


def enrich(records, annotation_root, participants, tolerance=0.005):
    counts = Counter()
    syllables = Counter()
    result = json.loads(json.dumps(records))
    for recording in result:
        if recording.get('mode') != 'Personal' or recording['participant'] not in participants:
            continue
        source = annotation_root / f"Participant_{recording['participant']}" / Path(recording['file']).with_suffix('.csv').name
        if not source.exists():
            counts['missingFiles'] += 1
            continue
        with source.open(encoding='utf-8-sig', newline='') as handle:
            rows = [row for row in csv.reader(handle) if len(row) >= 4]
        used = set()
        counts['filesRead'] += 1
        for event in recording['annotations']:
            options = [(abs(float(row[0]) - event['time']), i) for i, row in enumerate(rows)
                       if i not in used and row[1].strip() == event['label']]
            if not options or min(options)[0] > tolerance:
                counts['unmatchedAnnotations'] += 1
                continue
            error, index = min(options)
            used.add(index)
            onset, coda = (value.strip() for value in rows[index][2:4])
            if not onset or not coda or '?' in (onset, coda):
                counts['unknownPhonemes'] += 1
                continue
            # A delimiter preserves boundaries between multi-character phonemes.
            event['phonemes'] = {'onset': onset, 'coda': coda, 'syllable': onset + '|' + coda,
                                 'source': 'zenodo:5578744', 'matchingErrorSeconds': error}
            syllables[onset + '|' + coda] += 1
            counts['enrichedAnnotations'] += 1
        counts['unusedSourceAnnotations'] += len(rows) - len(used)
    return result, {'counts': dict(counts), 'syllables': dict(syllables),
                    'participants': sorted(participants), 'matchingToleranceSeconds': tolerance,
                    'source': 'https://zenodo.org/records/5578744',
                    'scope': 'AVP Personal training annotations only; original timestamps preserved'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, default=Path('artifacts/events-v2.json'))
    parser.add_argument('--annotations', type=Path, default=Path('artifacts/new-public-audio/avp-lvt/AVP-LVT_Dataset/AVP_Dataset/Personal'))
    parser.add_argument('--participants', default=','.join(map(str, range(1, 15))),
                        help='Explicit training performer IDs only, comma separated; default1–14')
    parser.add_argument('--output', type=Path, default=Path('artifacts/events-v2-phonemes.json'))
    args = parser.parse_args()
    participants = {int(value) for value in args.participants.split(',')}
    if not participants or not participants <= set(range(1, 29)):
        parser.error('AVP performer IDs must be within1–28.')
    if args.output.resolve() == args.manifest.resolve():
        parser.error('Output must not replace the source manifest.')
    result, report = enrich(json.loads(args.manifest.read_text()), args.annotations, participants)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False))
    args.output.with_suffix('.report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
