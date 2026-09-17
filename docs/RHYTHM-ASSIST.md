# TypeSafe groove hints

The shipped acoustic TypeSafe path remains in use. Its full Choice probability distribution is now retained in the browser. A bounded local musical prior can resolve close kick/snare ties in 4/4: kicks on beats 1/3, snares on 2/4. It does not send raw audio, run the experimental acoustic models, or change note timing, duration, velocity, count or quantization.

Set tempo, select a known downbeat in the hit list and use **Selected hit is beat 1**. Alternatively, clear phase is inferred only with four or more strong kick/snare anchors, including both instruments. **Estimate tempo** proposes a pulse, not a guaranteed meter or downbeat. Half/double tempo, swing, variable tempo, pickups and other meters may require manual settings or disabling the hints.

Only a kick/snare pair with combined acoustic probability at least .7, each at least .2, and neither at least .75 is eligible. Near a quarter-note beat, the expected label receives at most 2.2× weight. These are conservative product heuristics, not fitted or calibrated probabilities. Manual drum labels and other instruments are protected. Jev confidence remains the original acoustic confidence; groove changes are separately identified. Turning hints off restores the original acoustic choices without another API call.

## Validation and limits

Unit tests cover ambiguous ties, strong evidence, hats, manual locks, offbeat hits, malformed distributions, phase inference, microtiming, reversibility, and byte-identical MIDI after restoring note numbers. Browser checks cover controls, manual labels, export and responsive layouts. Existing Inter/sage/neutral styling in `src/style.css` is the brand source.

Live TypeSafe calls on two public AVP recordings were compared with the same outputs plus automatic groove hints. P8 scored 29/47 matched labels and P9 29/49 in that run; neither had a sufficiently stable estimated pulse, so both were unchanged. This confirms abstention on those cases, **not an accuracy improvement**. Synthetic aligned cases verify the proposed tie-break behavior. A broader labeled rhythm-aware evaluation remains necessary before claiming better real-world classification.

TypeSafe references: https://docs.typesafe.ai/confidence.md and https://docs.typesafe.ai/api.md. Choice confidence is a distribution-concentration statistic, not the selected label's probability; the tie-break uses the probability entries.
