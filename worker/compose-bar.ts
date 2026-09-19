import { drumKits, type DrumKit } from "../src/drum-kits";
import {
  arrangeBar,
  variations,
  applyVariation,
  applyFill,
  fills,
  type BarPlan,
  foundations,
  tops,
  feels,
  type BarGroove,
} from "../src/bar-groove";
type Infer = (
  state: unknown,
  questions: unknown,
) => Promise<Record<string, unknown>>;
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
function selected(
  result: Record<string, unknown>,
  key: string,
  options: object,
) {
  const answer = record(result.answers) ? result.answers[key] : null;
  if (
    !record(answer) ||
    answer.type !== "choice" ||
    typeof answer.choice !== "string" ||
    !Object.hasOwn(options, answer.choice)
  )
    throw Error("upstream");
  return answer.choice;
}
function tokens(result: Record<string, unknown>) {
  const n = record(result.usage) ? result.usage.input_tokens : null;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
}
export async function composeBar(
  prompt: string,
  bpm: number,
  infer: Infer,
  bars = 1,
  resolution = 16,
) {
  let kit: DrumKit = "electronic";
  const arrangements: BarPlan[] = [];
  const steps: BarGroove["steps"] = [];
  let modelCalls = 0;
  let inputTokens: number | null = 0;
  const ask: Infer = async (state, questions) => {
    const result = await infer(state, questions);
    modelCalls++;
    const n = tokens(result);
    inputTokens = inputTokens === null || n === null ? null : inputTokens + n;
    return result;
  };
  const fail = () => ({
    unsupported: true,
    message:
      "That request needs a rhythm outside the available drum phrases. Your previous groove has not changed.",
    modelCalls,
    inputTokens,
  });
  for (let index = 0; index < bars; index++) {
    const context = {
      prompt,
      bpm,
      currentBar: index + 1,
      totalBars: bars,
      resolution,
      phraseRole: [
        "Establish the main motif",
        "Answer the motif with a small change",
        "Develop the groove while retaining the pulse",
        "Create a restrained turnaround into bar 1",
      ][index],
      previousDecisions: arrangements.map(
        (plan, i) => `Bar ${i + 1}: ${JSON.stringify(plan)}`,
      ),
      previousNotes: steps.map((s) => ({ ...s })),
      instruction:
        "Arrange ONLY currentBar within this complete phrase. Read bar-specific requests carefully. A fill on bar 3 applies ONLY when currentBar is 3. By default compose a coherent developing four-bar phrase, not four identical copies: establish the motif, answer it subtly, develop it, and lead back into the loop. Keep the foundational groove recognizable. Exact note instructions, repeat-exactly requests and instrument exclusions override development. Variation is chosen separately; do not switch genres to create variety. Fills are chosen separately after the foundation: do not reject a fill request because foundation options do not contain fills. Return to the underlying groove after a fill. Do not copy a previous fill into later bars. Use small non-fill variations on ordinary bars; no-fills still permits small variations unless identical repetition is requested.",
    };
    const foundationOptions = Object.fromEntries(
      Object.entries(foundations).map(([key, v]) => [key, v.description]),
    );
    const first = await ask(context, {
      foundation: {
        type: "choice",
        instructions:
          "Choose the underlying kick/snare relationship for CURRENT BAR, before adding any requested fill. Honor explicit exclusions and positions. Multi-bar structure and snare fills are supported separately. Choose unsupported only for unavailable underlying rhythms or meter.",
        criteria: {
          ...foundationOptions,
          unsupported:
            "The underlying required rhythm or meter cannot be expressed.",
        },
      },
    });
    const foundation = selected(first, "foundation", {
      ...foundations,
      unsupported: "",
    });
    if (foundation === "unsupported") return fail();
    const topOptions = Object.fromEntries(
      Object.entries(tops)
        .filter(([key]) => resolution === 32 || key !== "thirty_seconds")
        .map(([key, v]) => [key, v.description]),
    );
    const fillOptions = Object.fromEntries(
      Object.entries(fills).filter(
        ([key]) => resolution === 32 || key !== "fine_roll",
      ),
    );
    const second = await ask(
      {
        ...context,
        foundation: foundations[foundation as keyof typeof foundations],
      },
      {
        ...(index === 0
          ? {
              kit: {
                type: "choice",
                instructions:
                  "Choose the drum sound palette that best matches the user description. This changes timbre only, not the rhythm. Use electronic for techno or house, acoustic for a natural band, dusty for lo-fi hip-hop, funk for tight syncopation, reggae for roots/dub.",
                criteria: Object.fromEntries(
                  Object.entries(drumKits).map(([key, v]) => [
                    key,
                    v.description,
                  ]),
                ),
              },
            }
          : {}),
        top: {
          type: "choice",
          instructions:
            "Choose the cymbal phrase for CURRENT BAR supporting the selected foundation. Fills will be applied separately. Respect exclusions and requested changes. Otherwise preserve the established cymbal pulse.",
          criteria: {
            ...topOptions,
            unsupported:
              "The explicitly required cymbal phrase is unavailable.",
          },
        },
        variation: {
          type: "choice",
          instructions:
            "Choose the small variation for CURRENT BAR according to phraseRole. Establish the motif unchanged on bar 1. By default later bars should develop it using distinct compatible variations, not all unchanged. Explicit identical repetition or exact position constraints take priority: use unchanged when required. No fills means no rolls; subtle variations are still permitted. Check that the selected variation actually changes the existing foundation/cymbals and respects exclusions. Avoid repeating the same variation in adjacent bars.",
          criteria: variations,
        },
        feel: {
          type: "choice",
          instructions:
            "Choose the timing feel. Maintain the established feel through the phrase. Straight unless relaxed or swing timing is requested.",
          criteria: feels,
        },
        fill: {
          type: "choice",
          instructions:
            "Which fill, if any, belongs in CURRENT BAR? An explicit bar number is binding. Choose none for every bar not designated for a fill. If fills are generally requested without a location, use the last bar. A restrained last-bar fill is allowed for a general groove request; choose none when the user says no fills or gives exact positions. A generic fill can be a short snare roll; unavailable instruments or explicitly unsupported fill patterns require unsupported.",
          criteria: {
            ...fillOptions,
            unsupported:
              "The specifically required fill cannot be represented, e.g. toms that are not available.",
          },
        },
      },
    );
    if (index === 0) kit = selected(second, "kit", drumKits) as DrumKit;
    const top = selected(second, "top", { ...topOptions, unsupported: "" });
    const fill = selected(second, "fill", { ...fillOptions, unsupported: "" });
    if (top === "unsupported" || fill === "unsupported") return fail();
    const feel = selected(second, "feel", feels) as BarPlan["feel"];
    const variation = selected(
      second,
      "variation",
      variations,
    ) as keyof typeof variations;
    const plan: BarPlan = {
      variation,
      foundation: foundation as BarPlan["foundation"],
      top: top as BarPlan["top"],
      feel,
      fill: fill as BarPlan["fill"],
    };
    arrangements.push(plan);
    steps.push(
      ...applyFill(
        applyVariation(
          arrangeBar(plan.foundation, plan.top, plan.feel, 1, resolution),
          variation,
        ),
        plan.fill,
      ).steps,
    );
  }
  return {
    groove: { ...arrangements[0], kit, bars, resolution, arrangements, steps },
    modelCalls,
    inputTokens,
  };
}
