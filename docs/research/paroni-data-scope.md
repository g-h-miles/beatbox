# Paroni vocal-drum supplement: scope before evaluation

**Suitable for a small frozen diagnostic, not proof of 95% transcription or a broad training set.** Preserve it outside training if the immediate purpose is a fresh example-level check. No audio was downloaded, listened to, or evaluated in this source audit; the root task handles file integrity inventory separately.

## Primary source facts

The [JASA article, DOI 10.1121/10.0002921, §§II–III](https://pdfs.semanticscholar.org/85fe/55184f18eac98ce90536a7b269ec3ff1bfb6.pdf) describes **one** 28-year-old French male with nine years of amateur beatboxing experience. Recording took place in one hour in a semi-anechoic room. Twelve sound variants were studied; each was repeated at least 15 times at 80 bpm, with 341 realizations analyzed. The paper's 94% cluster purity is not a speaker-independent transcription score.

Crucially, §II.B states that the humming variants were produced **without superimposed melody or voicing**. Their filenames do not establish simultaneous singing or polyphony. The recorded protocol therefore supports treating these as unvoiced percussion-technique examples; it does not verify every file's exact event count.

The paper describes manual Praat segmentation from burst to final visible waveform oscillation and points to online prototypical examples. This distinguishes the larger analyzed corpus from the distributed illustration files. It does not explicitly guarantee that every downloadable WAV contains exactly one annotated hit. Count events from the actual files before making an event-level evaluation claim; do not infer that count from a singular filename.

## What the Zenodo record actually distributes

The [primary record](https://zenodo.org/records/4264747) and its [machine-readable metadata](https://zenodo.org/api/records/4264747) identify the upload as JASA supplementary material, published 2020-11-09 under **CC BY 4.0**. The file listing contains **12 WAVs, 30 MP4s, and 12 JPGs**. There are no CSV, TextGrid, JSON annotation files, or published per-hit timestamp tables in that listing. Videos and images are alternative illustrations of the sound types, not evidence of additional independent speakers or training examples.

The absence of annotation files in this record does not mean the researchers never created annotations. It means the study's described annotations are not available through this particular supplement. Neither onset error nor exact-timing transcription F1 can be computed from filenames alone.

## Conservative application mapping

These are proposed evaluation mappings from source filenames, frozen before any model result. They are not newly inferred auditory labels.

| WAV stems | Defensible target | Restriction |
| --- | --- | --- |
| PowerKick, HummingKick | kick | Two variants, one speaker. |
| PowerSnare, PowerInwardSnare, HummingSnare | snare | Keep technique identity in the report. |
| PowerClosedHiHat | closed | Explicit subtype in filename. |
| PowerOpenHiHat | open | Explicit subtype in filename. |
| HummingHiHat | hat family | Closed/open is unspecified; exclude from strict four-class subtype scoring. |
| PowerRimshot, HummingRimshot | rimshot | Outside the named app taxonomy. An optional snare-family coarsening must be separately declared; do not silently score as snare. |
| ExhaledCymbal, InhaledCymbal | cymbal family | No ride/crash distinction is supplied. Neither breathing direction implies auxiliary/breath intent. |

This yields **eight core-family files** (two kick, three snare, three hat), of which **seven** have an unambiguous closed/open/kick/snare mapping. The remaining four files test taxonomy mismatch, not exact seven-class correctness. Do not convert generic cymbal into ride/crash or infer closed hat from the humming example's duration.

## Relation to the French “boots and cats” study

The [2020 JEP paper, §2](https://aclanthology.org/2020.jeptalnrecital-jep.53.pdf) describes one French-speaking 28-year-old amateur with nine years of experience. It includes “boots and cats” with **16 spoken and 23 beatboxed repetitions**, alongside two French phrases. It reports manually marked burst timestamps saved as Praat TextGrid. The listed Zenodo supplement contains none of those named phrase recordings or TextGrids.

The matching participant description, authors, and instrumentation suggest closely related research, possibly the same participant. That is an inference, not verified subject/session identity. Do not equate the JASA illustration files with the 39 “boots and cats” repetitions or claim this download resolves spoken-phrase validation. No contact request was made.

## Training versus held-out use

For the next diagnostic, freeze the model, mapping, and scoring rule before opening predictions. Record the file identities/hashes and establish whether each clip contains one or several events independently of the classifier. Without onset annotations, report file-level or manually documented event-level classification only, with its limitations. The present audit supplies no timing ground truth.

One speaker and a few prototypical clips cannot establish cross-speaker robustness or cadence recovery. The anonymous profile also does not prove the person is absent from every other corpus; cross-corpus identity remains unverified. If these examples later become training data, stop presenting them as held-out evidence. Augmenting or repeating the same clips does not increase the number of independent speakers. The metadata and paper supply technique coverage worth inspecting, but not enough data to justify a production accuracy claim.
