import {
  arrangeBar,
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
  const options = Object.fromEntries(
    Object.entries(foundations).map(([key, v]) => [key, v.description]),
  );
  const foundationResult = await infer(
    {
      prompt,
      bpm,
      phrase: `${bars} bars repeating the chosen groove, 1/${resolution} editing grid.`,
      meter: "One bar of 4/4, looped without fills.",
      purpose:
        "Select a complete kick/snare relationship from the authored vocabulary. This is a bounded arrangement task. Do not approximate explicitly requested unavailable rhythms as if they were exact. Genre-only requests can use the closest conventional foundation.",
    },
    {
      foundation: {
        type: "choice",
        instructions:
          "Which complete one-bar kick AND snare phrase fits the musical request? Compare the whole rhythm, including spaces. Explicit note positions and exclusions take priority over genre. Choose unsupported when an explicit requirement cannot be represented by any option.",
        criteria: {
          ...options,
          unsupported:
            "No available foundation can satisfy an explicit required rhythm, instrument, meter or multi-bar structure.",
        },
      },
    },
  );
  const foundation = selected(foundationResult, "foundation", {
    ...options,
    unsupported: "",
  });
  if (foundation === "unsupported")
    return {
      unsupported: true,
      message:
        "That rhythm is outside this one-bar vocabulary. Try a pocket, funk, reggae, house, or half-time groove.",
      modelCalls: 1,
      inputTokens: tokens(foundationResult),
    };
  const selectedFoundation =
    foundations[foundation as keyof typeof foundations];
  // This dependency is musical: cymbals are arranged against the chosen full foundation.
  const topResult = await infer(
    {
      prompt,
      bpm,
      phrase: `${bars} bars repeating the chosen groove, 1/${resolution} editing grid.`,
      meter: "One repeating bar in 4/4.",
      foundation: selectedFoundation,
      purpose:
        "Finish this whole-bar arrangement. The kick/snare phrase is already fixed. Choose a compatible cymbal phrase and performance feel. No fills, random new notes, crashes or constant regeneration. Reggae normally retains an eighth-note pulse with offbeat accents; four offbeat-only hats are a distinct sparse choice.",
    },
    {
      top: {
        type: "choice",
        instructions:
          "Choose the complete cymbal phrase that supports the selected kick/snare foundation and matches the request. Honor explicit cymbal exclusions. If the required cymbal pattern is unavailable choose unsupported.",
        criteria: {
          ...Object.fromEntries(
            Object.entries(tops)
              .filter(([key]) => resolution === 32 || key !== "thirty_seconds")
              .map(([key, v]) => [key, v.description]),
          ),
          unsupported:
            "Explicitly requested cymbal phrase cannot be expressed by any option.",
        },
      },
      feel: {
        type: "choice",
        instructions:
          "Choose the timing feel for this whole bar. Use straight unless relaxed or swing timing is requested. Do not infer swing merely from syncopation.",
        criteria: feels,
      },
    },
  );
  const top = selected(topResult, "top", { ...tops, unsupported: "" });
  const n1 = tokens(foundationResult),
    n2 = tokens(topResult);
  const usage = {
    modelCalls: 2,
    inputTokens: n1 === null || n2 === null ? null : n1 + n2,
  };
  if (top === "unsupported")
    return {
      unsupported: true,
      message:
        "That cymbal pattern is outside this one-bar vocabulary. Try eighth-note hats, offbeats, sixteenths, or ride.",
      ...usage,
    };
  const feel = selected(topResult, "feel", feels) as BarGroove["feel"];
  return {
    groove: arrangeBar(
      foundation as BarGroove["foundation"],
      top as BarGroove["top"],
      feel,
      bars,
      resolution,
    ),
    ...usage,
  };
}
