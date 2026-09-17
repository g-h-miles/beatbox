# Additional public human beatbox recordings

Fetched on 2026-09-17. Audio remains under ignored `artifacts/new-public-audio/`.
No private Graham recordings are in these manifests. No invented event timings,
synthetic speech, stitched loops, or test-voice calibration is used here.

## MDV: labeled human imitations

Run `python3 scripts/data-prepare-mdv.py`.

- Source: [Zenodo804262](https://zenodo.org/records/804262), DOI10.5281/zenodo.804262.
- Authors: Adib Mehrabi, Simon Dixon, Mark Sandler.
- [Primary paper](https://doi.org/10.1371/journal.pone.0219955): *Vocal imitation of percussion sounds: On the perceptual similarity between imitations and imitated sounds* (2019).
- Archive:47,593,482 bytes; published MD5`002819e45ec5178eeffa0a2b80ebf588`verified.
- 420 voice clips,14 performers,30 reference drum sounds:84 cymbal,84 hat,84 kick,84 snare,84 tom.
- Numeric performer IDs0–7training(240 clips),8–10validation(90),11–13lockedtest(90), set before any classifier evaluation.
- Manifest:`artifacts/new-public-audio/mdv/manifest.json`.
- The paper's Table 1 orders six samples each of cymbal/hat/kick/snare/tom. The durations of all30 reference WAVs corroborate that ordering. More specific reference articulations (ride/crash/closed/open) are preserved separately.
- Labels describe which drum the speaker was asked to imitate; they are not independently verified labels for every temporal event. No onset ground truth is present. Report recording classification separately from groove transcription.
- Zenodo lists CC BY4.0 for the dataset. **Actual BFD reference drum samples carry separate academic-research-only permission.** The fetch/prep script extracts only human imitations; do not use reference drum audio as a commercial sample pack or ship it with the app.

## VIS: reserved independent test imitations

Run `python3 scripts/data-fetch-vocal-imitations.py`.

- Source:[Vocal Imitation Set](https://github.com/interactiveaudiolab/VocalImitationSet), pinned commit`b77114c43c52f5faa7d0bb69b22e1ebca0632201`.
- License:CC BY4.0, [Zenodo1340763](https://zenodo.org/records/1340763).
- Citation:Bongjun Kim, Madhav Ghei, Bryan Pardo, Zhiyao Duan. *Vocal Imitation Set: a dataset of vocally imitated sound events using the AudioSet ontology.* DCASE2018.
- 97 expert-included recordings,68 performers:19 bass drum,21 hi-hat,18 crash,22 snare roll,17 rimshot.
- All are **locked-test**. No training, threshold tuning, calibration or model selection.
- Manifest:`artifacts/new-public-audio/vis/manifest.json`.
- Hi-hats have no open/closed label. Snare recordings here are explicitly rolls/rimshots, not generic isolated snares. Recording labels only, no onset annotations. One expert's inclusion judgment is not a perfect transcription label.
- Only needed percussion files were downloaded, avoiding the7.6 GB archive. Participant surveys/demographics were not downloaded.

## Three CC0 real human loops

Run `python3 scripts/data-fetch-public-audio.py` (Python+ffprobe).

Manifest:`artifacts/new-public-audio/public-loops-manifest.json`.

|Creator|Source|MP3 duration|Status|
|---|---|---:|---|
|itinerantmonk108|[G Beat Box boots n cats](https://freesound.org/people/itinerantmonk108/sounds/740030/)|8.352s|Released to development for boots/cats work|
|Kodack|[beatbox100bpm heavier loop](https://freesound.org/people/Kodack/sounds/256336/)|2.482s|Locked-test, unannotated|
|TheFlakesMaster|[Beatbox](https://freesound.org/people/TheFlakesMaster/sounds/401765/)|2.325s|Locked-test, unannotated|

Public HQ MP3 previews were downloaded, not original WAVs. Source descriptions identify actual human recording; no claim of untouched studio masters. The titles do not provide ground-truth event labels or timestamps. Boots/cats was initially reserved but deliberately released to development before model work; it must never be described as an independent test later.

## AVP-LVT annotation enrichment and blocked audio

Run `python3 scripts/data-fetch-public-audio.py --avp-lvt` to fetch official archive.

- [Zenodo5578744](https://zenodo.org/records/5578744), Alejandro Delgado Luezas, *AVP-LVT Vocal Percussion Dataset* (2021), CC BY4.0.
- 114,710,027 bytes; published MD5`3cc38636623e2861cbda145d889e959a`verified.
- Existing AVP personal recordings plus new onset/coda phoneme annotations are available at `artifacts/new-public-audio/avp-lvt/AVP-LVT_Dataset/AVP_Dataset/Personal`. These are previously seen AVP voices, **not fresh independent test audio**.
- 40 LVT annotation CSVs are included but **LVT audio is not in this archive**. The build instructions refer to [the original Google Drive archive](https://drive.google.com/file/d/0BxZsTXp2zMDIR3hzTkNvSU1LYkE/view), currently access-restricted. Confirmed through logged-in Chrome; no access request was sent.
- All 20 LVT voices are reserved for locked testing if public audio becomes accessible. No model selection has used their annotations.
- Full metadata/license snapshots, manifests, and exact source HTML are saved under ignored artifacts.

## Sources examined but not used

The [beatrhyming supplement inventory](../docs/research/beatrhyming-reference-inventory.md)
adds 88 author-provided release-time measurements, but no audio or complete
onset reference. It has not been used for model training or evaluation and does
not fill the literal boots-and-cats benchmark gap. Its CC BY 4.0 archive is
retained with verified hashes in ignored artifacts.

The [Beatboxset source audit](../docs/research/beatboxset-scope-audit.md) verifies
allowed-file integrity and contributor metadata, documents the recording-source
shift between the existing training and validation splits, and clarifies that
monophony is not established. The source publications define `t` as tom; prior
frozen experiments that excluded that label remain unchanged.

jaCappella offers isolated vocal percussion plus scores, but currently requires sharing contact details and accepting dataset access conditions. No acceptance/request was submitted. Freesound sample-stitched loops, multitracked drums, and VST outputs were excluded from real monophonic performance testing. Existing AVP and Beatboxset1 are already development-exposed and cannot restore a fresh test simply by renaming a split.
