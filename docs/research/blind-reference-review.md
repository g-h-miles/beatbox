# Human reference review for the released public clip

This package supports reference annotation without model predictions. It is not a completed reference set, an accuracy improvement, or a new independent test: the recording was already released to development. A human review can establish reference labels for that clip; it cannot undo prior development exposure.

## Build and open

Run `node scripts/build-blind-reference.mjs` from the repository root, then open `artifacts/blind-reference/index.html`. Audio and fonts are embedded, so the review page needs no server or network. An optional localhost server also works:

```sh
python3 -m http.server 8792 --bind 127.0.0.1 --directory artifacts/blind-reference
```

If using the optional server, open `http://127.0.0.1:8792/`. The generated page and audio stay local. No inference service is used. The reviewer page starts with no events or labels, and uses the anonymous recording ID `recording-001`. Source title, license, URL, hash and earlier development status belong in the separate provenance manifest, not alongside the listening controls. Do not open prior predictions during annotation.

## Review procedure

1. Listen to the entire original audio before adding events. Mark audible attacks at their original time positions using the waveform and playback. Slower playback helps inspection; annotations remain in original seconds.
2. Assign the intended percussion class only when supported by listening. Preserve audible speech as optional literal transcription; do not infer a fixed phrase, pattern, number of hits, or drum sequence from the task's title. Use unknown and ambiguity flags where identity or event boundaries cannot be resolved.
3. Check the complete clip for missed attacks, duplicate events, breaths and false events. Do not snap to a tempo grid. Preserve uncertainty instead of deleting hard examples.
4. Enter reviewer attribution and notes. Completion must be explicitly confirmed by the human reviewer. Export JSON; incomplete exports remain drafts.
5. A second qualified reviewer should annotate independently, without the first review or model predictions. Compare their event inventory, onset placement and class judgments. Adjudicate disagreements through listening and retain the original exports plus reasons for changes.

Do not fill this package using model-generated onsets, classifier guesses, a forced transcript, expected beat positions, or copied earlier predictions and then call it independent annotation. Automation checks file integrity and schema only; it cannot verify that someone listened or that their labels are correct.

## Validate an export

```sh
node scripts/check-blind-reference.mjs path/to/reference.json --require-complete
```

The validator binds the export to the known MP3 SHA-256, checks metadata and strictly increasing in-range timestamps, and requires reviewer attribution for completed reviews. It preserves exact numeric times and retains unknown/ambiguous events. It does not score predictions or silently exclude uncertainty from an accuracy denominator. A structurally valid review is not proof of correct labels, independent authorship, or completeness.

Run its checks with `node --test scripts/check-blind-reference.test.mjs`.

## Evaluation boundary

Only after reviewed reference data exists should a frozen system be scored. Report detected, reference, matched, missed, extra and correctly labeled event counts, and timing errors. Keep the existing predeclared matching tolerance and report tighter timing diagnostics separately. Do not widen tolerance or remove ambiguous sounds to manufacture a passing score. Any exclusion policy must be disclosed with its counts and effect on coverage.

This one development-exposed clip cannot prove >95% across unseen speakers or all seven classes. The author data-access request remains unsent pending user authorization. The app's no-training demo flow and production models are unchanged.
