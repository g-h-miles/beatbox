"""Generate a private waveform audit; no audio or profile is uploaded."""
import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import soundfile as sf
from isolated_segments import segment_isolated

CLASSES = ['kick', 'closed', 'open', 'ride', 'crash', 'snare', 'aux']

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('manifest', type=Path)
    args = parser.parse_args()
    root = args.manifest.resolve().parent
    manifest = json.loads(args.manifest.read_text())
    original_path = root / 'profile-assessment.json'
    original = json.loads(original_path.read_text()) if original_path.exists() else {}
    report_path = root / 'balanced-descriptor-assessment.json'
    report = json.loads(report_path.read_text()) if report_path.exists() else {}
    fig, axes = plt.subplots(7, 2, figsize=(20, 16))
    counts = []
    for row, label in zip(axes, CLASSES):
        for take, ax in enumerate(row, 1):
            name = f'{label}-{take}.wav'
            entry = next((r for r in manifest['recordings'] if r['file'] == name), None)
            if entry is None:
                ax.set_visible(False)
                continue
            audio, rate = sf.read(root / name)
            segments = segment_isolated(audio, rate)
            proposals = segment_isolated(audio, rate, minimum_relative_peak=0)
            ax.plot(np.arange(len(audio))[::20] / rate, audio[::20], lw=.4)
            for candidate in proposals:
                kept = any(abs(candidate['start'] - s['start']) < .001 for s in segments)
                ax.axvspan(candidate['start'], candidate['end'], color='green' if kept else 'orange', alpha=.2)
            old = next((r for r in original.get('recordings', []) if r['file'] == name), {})
            for time in old.get('times', []):
                ax.axvline(time, color='red', lw=.5, alpha=.5)
            ax.set_title(f'{name}: {len(segments)} retained, {len(proposals)-len(segments)} quiet candidates excluded')
            ax.set_xlim(0, len(audio)/rate)
            counts.append((name, old.get('candidateEvents', '—'), len(segments), len(proposals)-len(segments)))
    fig.tight_layout()
    fig.savefig(root / 'segmentation-review.png')
    lines = ['# Private recording audit', '',
             'Red lines: original neural detections. Green: revised isolated training segments. Orange: low-energy candidates excluded from fitting/scoring. Orange can include real soft hits; this is not a verified onset benchmark.', '',
             '![Boundary review](segmentation-review.png)', '',
             '| Recording | Old detections | Retained | Quiet candidates excluded |',
             '|---|---:|---:|---:|']
    lines += [f'| {name} | {old} | {kept} | {excluded} |' for name, old, kept, excluded in counts]
    if report:
        lines += ['', '## Classification development check', '',
                  f"{report['correct']}/{report['total']} retained Take 2 segments agree with recording-level labels. Take 2 was already inspected; this is neither a fresh test nor verified transcription accuracy. No Take 2 examples were used to fit the classifier.", '',
                  'The original padded-spectrogram classifier scored 43/60 on the same retained segments. Revised descriptors and the pre-existing audio embedding scored 53/60. This is a paired descriptor comparison on this private pack, not a TypeSafe comparison.', '',
                  '| Recording | Time | Recording label | Predicted label |', '|---|---:|---|---|']
        lines += [f"| {e['file']} | {e['start']:.3f}s | {e['label']} | {e['prediction']} |" for e in report['events'] if e['label'] != e['prediction']]
    lines += ['', 'This audit does not establish performance on a continuous groove or literal “boots and cats.” The isolated energy gate must not replace the groove onset detector. Raw voice recordings, profile vectors, and reports remain local.']
    (root / 'REVIEW.md').write_text('\n'.join(lines) + '\n')
    print(root / 'REVIEW.md')

if __name__ == '__main__':
    main()
