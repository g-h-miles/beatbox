import { drums } from "../src/model";
import { VELOCITIES } from "../src/generator";
import {
  foundations,
  tops,
  feels,
  fills,
  type BarGroove,
} from "../src/bar-groove";
import { drumKits } from "../src/drum-kits";
type Infer = (
  state: unknown,
  questions: unknown,
) => Promise<Record<string, unknown>>;
const record = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function validateGroove(
  value: unknown,
  bars: number,
  resolution: number,
): BarGroove {
  if (
    !record(value) ||
    value.bars !== bars ||
    value.resolution !== resolution ||
    !Object.hasOwn(foundations, value.foundation) ||
    !Object.hasOwn(tops, value.top) ||
    !Object.hasOwn(feels, value.feel) ||
    (value.kit !== undefined && !Object.hasOwn(drumKits, value.kit)) ||
    !Array.isArray(value.steps) ||
    value.steps.length !== bars * resolution ||
    value.steps.some(
      (s: unknown) =>
        !record(s) ||
        Object.keys(s).length !== drums.length ||
        drums.some(
          (d) => !(VELOCITIES as readonly unknown[]).includes(s[d.id]),
        ),
    )
  )
    throw Error("input");
  if (
    value.arrangements !== undefined &&
    (!Array.isArray(value.arrangements) ||
      value.arrangements.length !== bars ||
      value.arrangements.some(
        (p: unknown) =>
          !record(p) ||
          !Object.hasOwn(foundations, p.foundation) ||
          !Object.hasOwn(tops, p.top) ||
          !Object.hasOwn(feels, p.feel) ||
          !Object.hasOwn(fills, p.fill),
      ))
  )
    throw Error("input");
  return value as BarGroove;
}
function choice(
  result: Record<string, unknown>,
  key: string,
  allowed: string[],
) {
  const a = record(result.answers) ? result.answers[key] : null;
  if (!record(a) || a.type !== "choice" || !allowed.includes(a.choice))
    throw Error("upstream");
  return a.choice as string;
}
export async function amendGroove(
  prompt: string,
  groove: BarGroove,
  infer: Infer,
) {
  let modelCalls = 0;
  let inputTokens: number | null = 0;
  const ask: Infer = async (state, questions) => {
    const r = await infer(state, questions);
    modelCalls++;
    const n = record(r.usage) ? r.usage.input_tokens : null;
    inputTokens =
      typeof n === "number" &&
      Number.isSafeInteger(n) &&
      n >= 0 &&
      inputTokens !== null
        ? inputTokens + n
        : null;
    return r;
  };
  const scope = await ask(
    {
      amendment: prompt,
      existingPattern: groove,
      instruction:
        "This is a surgical edit, not a new composition. Identify ONLY instruments explicitly changed by this request. A hi-hat without open/closed qualification means closed hat. Do not select accompanying instruments or make implicit musical improvements.",
    },
    {
      supported: {
        type: "choice",
        instructions:
          "Can this request be represented by adding, removing or changing velocities of existing drum-grid cells? Timbre, tempo, swing, off-grid timing, unavailable instruments and ambiguous locations are unsupported. A bar, numbered beat, e/&/a or explicit subdivision are supported.",
        criteria: {
          yes: "A clear drum-cell edit on this grid.",
          no: "Outside drum-cell editing or location too ambiguous.",
        },
      },
      ...Object.fromEntries(
        drums.map((d) => [
          d.id,
          {
            type: "choice",
            instructions: `Does the amendment explicitly request changing ${d.name} notes? Select no for every instrument not requested.`,
            criteria: {
              yes: "Explicitly requested target instrument.",
              no: "Leave every note of this instrument unchanged.",
            },
          },
        ]),
      ),
    },
  );
  if (choice(scope, "supported", ["yes", "no"]) === "no")
    return {
      unsupported: true,
      message:
        "Specify a drum and location, such as “add a closed hat on bar 3, beat 2&”. Your beat is unchanged.",
      modelCalls,
      inputTokens,
    };
  const targets = drums.filter(
    (d) => choice(scope, d.id, ["yes", "no"]) === "yes",
  );
  const steps = groove.steps.map((s) => ({ ...s }));
  const resolution = groove.resolution!;
  const edits: { step: number; drum: string; before: number; after: number }[] =
    [];
  for (const drum of targets) {
    for (let start = 0; start < steps.length; start += 32) {
      const positions = steps.slice(start, start + 32).map((s, j) => {
        const i = start + j;
        const local = i % resolution;
        const sub = local % (resolution / 4);
        return {
          index: i,
          bar: Math.floor(i / resolution) + 1,
          beat: Math.floor(local / (resolution / 4)) + 1,
          subdivision: sub,
          subdivisionsPerBeat: resolution / 4,
          beatFraction: sub / (resolution / 4),
          syllable:
            sub === 0
              ? "numbered beat"
              : sub === resolution / 8
                ? "&"
                : sub === resolution / 16
                  ? "e"
                  : sub === (3 * resolution) / 16
                    ? "a"
                    : "between sixteenths",
          currentVelocity: s[drum.id],
        };
      });
      const r = await ask(
        {
          amendment: prompt,
          instrument: drum.name,
          positions,
          existingPattern: groove.steps,
          instruction:
            "Edit only explicitly requested positions. All other positions MUST keep their exact original velocity. Beat 2& means beat=2 AND syllable=&, not beat 2 onset. A specified bar excludes every other bar. For add, keep existing hits unless a velocity change is requested. For quieter/softer or louder requests, target EXISTING nonzero hits in the requested instrument and location and choose softer or louder; keep rests. Never add chokes, fills, accompaniment or improve other notes.",
        },
        Object.fromEntries(
          positions.map((p) => [
            `p${p.index}`,
            {
              type: "choice",
              instructions: `At bar ${p.bar}, beat ${p.beat}, subdivision ${p.subdivision}/${p.subdivisionsPerBeat} (${p.syllable}), should this ${drum.name} cell change? Current velocity ${p.currentVelocity}. KEEP unless this exact cell is targeted by the amendment.`,
              criteria: {
                keep: "Preserve the original cell exactly. Default outside explicit targets.",
                remove: "Remove the explicitly targeted hit.",
                softer:
                  "Make this existing targeted hit quieter by one dynamic level. Use for quieter/softer requests; keep rests.",
                louder:
                  "Make this existing targeted hit louder by one dynamic level. Use for louder requests; keep rests.",
                v32: "Set explicitly targeted cell to ghost velocity 32.",
                v56: "Set explicitly targeted cell to soft velocity 56; default added hi-hat.",
                v80: "Set explicitly targeted cell to medium velocity 80.",
                v104: "Set explicitly targeted cell to strong velocity 104; default added kick/snare.",
                v127: "Set explicitly targeted cell to maximum accent 127.",
              },
            },
          ]),
        ),
      );
      for (const p of positions) {
        const action = choice(r, `p${p.index}`, [
          "keep",
          "remove",
          "softer",
          "louder",
          "v32",
          "v56",
          "v80",
          "v104",
          "v127",
        ]);
        const after =
          action === "keep"
            ? p.currentVelocity
            : action === "remove"
              ? 0
              : action === "softer"
                ? p.currentVelocity
                  ? VELOCITIES[
                      Math.max(
                        1,
                        (VELOCITIES as readonly number[]).indexOf(
                          p.currentVelocity,
                        ) - 1,
                      )
                    ]
                  : 0
                : action === "louder"
                  ? p.currentVelocity
                    ? VELOCITIES[
                        Math.min(
                          VELOCITIES.length - 1,
                          (VELOCITIES as readonly number[]).indexOf(
                            p.currentVelocity,
                          ) + 1,
                        )
                      ]
                    : 0
                  : Number(action.slice(1));
        if (after !== p.currentVelocity) {
          steps[p.index][drum.id] = after;
          edits.push({
            step: p.index,
            drum: drum.id,
            before: p.currentVelocity,
            after,
          });
        }
      }
    }
  }
  return { groove: { ...groove, steps }, edits, modelCalls, inputTokens };
}
