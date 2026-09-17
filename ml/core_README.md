# Zero-calibration core-class experiments

These models classify **hat / kick / snare** without labeled voice setup. They are rejected research candidates, not production models. Both hi-hat labels are merged only for this explicit core-class metric; seven-class accuracy is not established.

All experiments use AVP performers 1–14 for training, 15–20 for validation-based selection, and 21–28 for final reporting. Performers 21–28 were inspected in earlier project experiments, so this is not a fresh blind test. Classifiers are trained on annotated events; evaluation uses the old app detector's actual crop boundaries. Full crops extend until the next detection, at most 500 ms. No test label chooses a crop boundary.

| Candidate | Validation matched classification | Previously inspected test matched classification |
| --- | ---: | ---: |
| Multi-window fbank summaries, selected gradient boosting | 82.38% | 808 / 1,139 = 70.94% |
| Within-recording unlabeled cluster probability averaging | See report | 812 / 1,139 = 71.29% |
| Recording-relative normalized timbre, selected SVM | 86.93% | 834 / 1,139 = 73.22% |
| Small CNN with phonetic onset/coda auxiliary heads | 86.49% | 809 / 1,139 = 71.03% |
| Same CNN without phonetic auxiliary loss | 87.08% | 805 / 1,139 = 70.68% |

The old detector produces 1,331 predictions against 1,163 supported reference events in this test cohort. The best relative model's 834 correct matched labels therefore correspond to **66.88% labeled end-to-end F1**, not 73.22% overall transcription accuracy. These models did not reach the requested quality threshold and must not replace production.

The relative model is transductive: it normalizes each complete recording using all its detections, including unmatched detections. It requires no labels and does not assume each drum class is present. The clustering experiment likewise includes every detection in its clusters and imposes no one-class-per-cluster assignment. Neither yielded a sufficient improvement.

## Phonetic experiment

`core_phonetic.py` consumes the 1,897 training-only enriched annotations produced by `enrich_avp_phonemes.py`. Missing phonetic targets are masked. All training events supervise the three-class drum head. Auxiliary loss is 0.3 times a weighted sum of onset CE (0.6) and coda CE (0.4). The small CNN uses frequency jitter and masks, balanced class sampling, and early stopping based only on validation classification. The ablation uses identical architecture/seed/augmentation and zero auxiliary weight. Both runs stopped after twelve epochs; their best validation epoch was three. This run provides no evidence that the auxiliary phonetic loss improves the deployment decision.

A training annotation audit also finds identical phonetic syllables assigned different intended instruments. For example, `t|i` has 36 hats and 33 snares, while `kg|h` has 29 hats and 37 snares. An oracle syllable recognizer followed by global majority instrument mapping reaches 1,729 / 1,897 = 91.14% on those training labels. **This is not an acoustic upper bound**: timbre and context may disambiguate identical phonetic transcriptions. It is evidence against relying on a syllable lookup alone.

## Crop diagnosis

After model selection, the classical baseline was evaluated with reference boundaries as an oracle segmentation diagnostic:

| Style | Reference-boundary classification | Actual detected-boundary classification |
| --- | ---: | ---: |
| Fixed articulation | 89.90% of 614 | 82.86% of 595 matched |
| Personal/free-choice articulation | 58.83% of 549 | 57.90% of 544 matched |

Better boundary handling should help standardized beatboxing, but arbitrary-voice class generalization remains poor even with reference boundaries. These are distinct populations, not a paired timing test.

## Reproduce

Requires existing `artifacts/ml-v2/fbanks.npy`, `events.json`, and `events-v2-phonemes.json` from the documented AVP preparation/enrichment steps. Run from repo root with the ML Python environment:

```sh
python ml/core_baseline.py
python ml/core_consistency.py
python ml/core_relative.py
python ml/core_phonetic.py --aux .3 --name phonetic
python ml/core_phonetic.py --aux 0 --name acoustic-ablation
python ml/core_diagnostics.py
```

Results/checkpoints are under ignored `artifacts/core-model`. No private voice audio is used in these experiments. Neural checkpoints can be read with `torch.load(..., weights_only=True)`; local sklearn pickle files should only be loaded from trusted local runs.
