# Beatboxset1 scope and split audit

The existing first-eight/next-three split separates the dataset's declared contributors and contains no exact duplicated files or decoded full recordings. It is **not a verified monophonic benchmark**, and acquisition style is confounded with the split. The primary publication also resolves an omission in the local README: **`t` means tom**.

This was a source and integrity audit only. No model inference, API evaluation, training, relabeling, or new score calculation was performed. Audio integrity checks opened only the existing eight training and three validation recordings; reserved audio and annotations were not opened.

## Authoritative evidence

The dataset's local `about_beatboxset1.txt` says clips were self-recorded by humanbeatbox.com contributors under varied conditions, with a different contributor for each clip. Its companion `beatboxset1.csv` supplies contributor handles, acquisition dates, source category, sex, original MD5, and some source URLs. These files are the distributed metadata for [Beatboxset1](https://archive.org/details/beatboxset1).

The author's [2010 thesis, §4.1.1 and Table 4.1, printed pp.78–79](https://theses.eurasip.org/media/theses/documents/stowell-dan-making-music-through-real-time-voice-timbre-analysis-machine-learning-and-timbral-control.pdf#page=78), independently describes 14 recordings by different beatboxers, with heterogeneous equipment and noise conditions. Table 4.1 defines the annotation vocabulary, including tom. The [2010 article, Table 1](https://citeseerx.ist.psu.edu/document?doi=0b20a634feff235785a31fd8a94e70628d245c10&repid=rep1&type=pdf), provides the same tom definition. Direct archive-page access failed during this audit; the distributed local files were inspected directly. The publication's indexed table text was retrievable; PDF screenshot retrieval timed out.

## What is and is not established

| Question | Supported conclusion |
| --- | --- |
| Is monophony guaranteed? | No guarantee was found in the dataset README or primary dataset description. Mark unknown. Mono/stereo in the README describes channel count, not one simultaneous musical event. A solo performer also does not establish nonoverlapping sounds. |
| Are performer identities available? | Forum contributor handles are provided; the dataset states each clip has a different contributor. There are no repeated declared handles in the allowed split. This is documented contributor separation, not independent verification that no person used multiple aliases. |
| Are recording sessions grouped? | No session identifier, shared-room/device grouping, or recording-session date is provided. The CSV's date is when the clip was obtained, not necessarily when it was recorded. One recording per declared contributor prevents a within-contributor multi-session analysis here. |
| Are these newly untouched validation recordings? | No. They have been inspected and evaluated in prior project experiments. Contributor separation does not restore a fresh holdout. |
| Can identity overlap with AVP/MDV be ruled out? | Not from this metadata. There is no cross-corpus identity key. |

## Annotation meanings

The dataset README defines `x`, `m`, `v`, and `br`; the primary publication additionally defines `t`. These are source meanings, not newly inferred labels.

| Label | Meaning | Consequence for this seven-output app |
| --- | --- | --- |
| `br` | Breathing that is not intended as percussion | Candidate broad auxiliary/noncore example. |
| `m` | Humming or a similar pitched vocal note, rather than a drum imitation or speech | Broad other; does not uniquely identify auxiliary/breath. |
| `v` | Speaking or singing | Broad other, with intent potentially outside beatbox-to-drums scope. |
| `x` | An identifiable miscellaneous sound outside the named categories | Broad other with heterogeneous content; do not reinterpret all examples as breath or cymbal. |
| `t` | Tom | Percussive but outside the app's named seven classes. May be explicitly mapped to broad other in a future declared experiment; it is not ride, crash, or breath. |
| `?` | Annotator uncertainty | Exclude or retain as unknown; do not manufacture a target. |

The earlier frozen noncore safety report excluded `t` because its mapping followed the incomplete README. That report must remain unchanged and state the exclusion. Within the allowed 11 recordings, the complete annotations contain 191 `t` entries: 39 in `battleclip_daq`, 113 in `callout_Pneumatic`, 3 in `callout_azeem`, 25 in `callout_luckeymonkey`, 1 in `callout_mcld`, 3 in `callout_mouss`, and 7 in validation `putfile_pepouni`. Counts combine both annotators and are not distinct acoustic events. The seven validation entries are HT annotations; DR supplies no `t` labels for that recording. A new mapping should be declared before training/evaluation and must not retroactively turn the previous experiment into a different one.

## Existing split and integrity

The project uses case-sensitive Python filename sorting, taking the first eight recordings for training and the next three for validation. This matches the current preparation code.

| Split | File stem | Declared contributor | Source |
| --- | --- | --- | --- |
| Train | battleclip_daq | daq | Other online recording |
| Train | callout_Pneumatic | Pneumatic | Requested callout |
| Train | callout_Turn-Table | Turn-Table | Requested callout |
| Train | callout_adiao | Adiao | Requested callout |
| Train | callout_azeem | Azeem | Requested callout |
| Train | callout_luckeymonkey | luckeymonkey | Requested callout |
| Train | callout_mcld | mcld | Requested callout |
| Train | callout_mouss | Mouss | Requested callout |
| Validation | putfile_bui | Bui | Other online recording |
| Validation | putfile_dbztenkaichi | DBZ-tenkaichi | Other online recording |
| Validation | putfile_pepouni | Pepouni | Other online recording |

All 11 local WAV MD5s match their distributed metadata; all 11 MD5s are distinct. SHA-256 fingerprints of the decoded full float32 PCM, together with sample rate and shape, are also distinct. Therefore there are no identical full WAVs or identical full decoded recordings among the allowed files. These checks do not exclude shared excerpts, edits, time shifts, gain changes, or outside-corpus duplicates; no perceptual/partial-duplicate search was performed.

The source distinction matters: callouts requested roughly 30-second demonstrations emphasizing kicks, snares, and hats; other clips had originally been published for different purposes. Training contains **seven callouts and one other-source clip**, while validation contains **three other-source clips and no callouts**. This is an acquisition/style shift as well as contributor separation. It can explain some generalization difficulty, but does not excuse measured errors or establish that all validation difficulty comes from style.

## Constraints for the next training experiment

Keep contributor/recording membership fixed. Describe this as existing contributor-separated validation with unknown monophony and a source-style shift. Declare any `t` mapping before fitting and preserve the prior report's taxonomy. Report performance per recording and separate core versus other behavior; do not treat broad other labels as validated ride/crash subclasses. Retain the reserved recordings for a separately authorized frozen evaluation rather than using them to resolve these metadata unknowns.
