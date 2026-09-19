import { drums } from "../src/composer-model";
import { VELOCITIES } from "../src/generator";
import {
  foundations,
  tops,
  feels,
  fills,
  applyFill,
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
  if (record(value) && Array.isArray(value.steps))
    value = {
      ...value,
      steps: value.steps.map((s: unknown) =>
        record(s) ? { tom_low: 0, tom_mid: 0, tom_high: 0, ...s } : s,
      ),
    };
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
      fill: {
        type: "choice",
        instructions:
          "Does the amendment ask to ADD or REPLACE a drum fill? Choose the requested fill pattern; generic tom fills mean a descending tom_run unless a longer build is requested. Choose none for individual note edits, velocity changes, or removing fills. Apply only to the selected bars. If a specific fill cannot be represented choose unsupported.",
        criteria: {
          ...Object.fromEntries(
            Object.entries(fills).filter(
              ([k]) => groove.resolution === 32 || k !== "fine_roll",
            ),
          ),
          none: "Not a request to add/replace a fill; handle as individual cell edits.",
          unsupported:
            "Explicit requested fill cannot be represented by available patterns.",
        },
      },
      supported: {
        type: "choice",
        instructions:
          "Can this request be represented by adding, removing or changing velocities of existing drum-grid cells? Timbre, tempo, swing, off-grid timing, unavailable instruments and ambiguous locations are unsupported. A bar, numbered beat, e/&/a or explicit subdivision are supported. Adding a snare or tom fill on a specified bar IS SUPPORTED even without individual note positions; the fill choice defines those positions.",
        criteria: {
          yes: "A clear drum-cell edit on this grid.",
          no: "Outside drum-cell editing or location too ambiguous.",
        },
      },
      ...Object.fromEntries(
        Array.from({ length: groove.bars! }, (_, i) => [
          `bar_${i + 1}`,
          {
            type: "choice",
            instructions: `Does the requested edit apply to bar ${i + 1}? If a specific bar is named, only that bar is yes. If no bar is specified or all bars are requested, yes.`,
            criteria: {
              yes: "This bar is explicitly in scope.",
              no: "This bar is excluded; keep every note.",
            },
          },
        ]),
      ),
      ...Object.fromEntries(
        drums.map((d) => [
          `alignment_${d.id}`,
          {
            type: "choice",
            instructions: `For edits to ${d.name}, what within-beat alignment is requested? A numbered beat without suffix (such as beat 3) means exactly its START, never the whole beat. If no specific onset is requested (e.g. make hats quieter), or several distinct alignments are requested, choose all.`,
            criteria: {
              start: "Only numbered beat starts (fraction 0).",
              e: "Only e sixteenth (fraction 1/4).",
              and: "Only & offbeat (fraction 1/2).",
              a: "Only a sixteenth (fraction 3/4).",
              all: "Multiple or unspecified alignments; let individual cell questions choose exact targets.",
            },
          },
        ]),
      ),
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
  const targetBars = new Set(
    Array.from({ length: groove.bars! }, (_, i) => i + 1).filter(
      (bar) => choice(scope, `bar_${bar}`, ["yes", "no"]) === "yes",
    ),
  );
  const fill = choice(scope, "fill", [...Object.keys(fills), "unsupported"]);
  if (fill === "unsupported")
    return {
      unsupported: true,
      message:
        "That fill is outside the available patterns. Try a descending tom fill or snare roll on a specific bar.",
      modelCalls,
      inputTokens,
    };
  if (fill !== "none") {
    const resolution = groove.resolution!;
    const steps = groove.steps.map((s) => ({ ...s }));
    const arrangements = groove.arrangements?.map((p) => ({ ...p }));
    const edits: {
      step: number;
      drum: string;
      before: number;
      after: number;
    }[] = [];
    for (const bar of targetBars) {
      const offset = (bar - 1) * resolution;
      const edited = applyFill(
        {
          ...groove,
          bars: 1,
          arrangements: undefined,
          steps: steps.slice(offset, offset + resolution),
        },
        fill as keyof typeof fills,
      );
      for (let i = 0; i < resolution; i++)
        for (const d of drums) {
          const before = steps[offset + i][d.id],
            after = edited.steps[i][d.id];
          if (before !== after)
            edits.push({ step: offset + i, drum: d.id, before, after });
        }
      steps.splice(offset, resolution, ...edited.steps);
      if (arrangements) arrangements[bar - 1].fill = fill as keyof typeof fills;
    }
    return {
      groove: { ...groove, steps, ...(arrangements ? { arrangements } : {}) },
      edits,
      modelCalls,
      inputTokens,
    };
  }
  const targets = drums.filter(
    (d) => choice(scope, d.id, ["yes", "no"]) === "yes",
  );
  const steps = groove.steps.map((s) => ({ ...s }));
  const resolution = groove.resolution!;
  const edits: { step: number; drum: string; before: number; after: number }[] =
    [];
  for (const drum of targets) {
    const alignment = choice(scope, `alignment_${drum.id}`, [
      "start",
      "e",
      "and",
      "a",
      "all",
    ]);
    const fraction = { start: 0, e: 0.25, and: 0.5, a: 0.75 }[
      alignment as "start" | "e" | "and" | "a"
    ];

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
      const scopedPositions = positions.filter(
        (p) =>
          targetBars.has(p.bar) &&
          (alignment === "all" || p.beatFraction === fraction),
      );
      if (!scopedPositions.length) continue;
      const r = await ask(
        {
          amendment: prompt,
          instrument: drum.name,
          positions: scopedPositions,
          targetBars: [...targetBars],
          instructionPriority:
            "The amendment adds NEW hits even where the existing velocity is zero. Original arrangement labels or fill locations do not limit where a new hit may be added.",
          instruction:
            "Edit only explicitly requested positions. All other positions MUST keep their exact original velocity. Beat 2& means beat=2 AND syllable=&, not beat 2 onset. A specified bar excludes every other bar. For add, keep existing hits unless a velocity change is requested. For quieter/softer or louder requests, target EXISTING nonzero hits in the requested instrument and location and choose softer or louder; keep rests. Never add chokes, fills, accompaniment or improve other notes.",
        },
        Object.fromEntries(
          scopedPositions.flatMap((p) => [
            [
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
                  add: "Add a NEW hit at this explicitly targeted cell; keep an existing hit unchanged.",
                  set: "Set the velocity of an explicitly targeted hit, or replace it at the requested intensity.",
                },
              },
            ],
            [
              `v${p.index}`,
              {
                type: "choice",
                instructions: `If the edit adds or sets a ${drum.name} hit at bar ${p.bar} beat ${p.beat}, choose its velocity. Default kick/snare/toms 104, hats 56; explicit requested dynamics take priority.`,
                criteria: {
                  v32: "Ghost 32",
                  v56: "Soft 56",
                  v80: "Medium 80",
                  v104: "Strong 104",
                  v127: "Maximum 127",
                },
              },
            ],
          ]),
        ),
      );
      for (const p of scopedPositions) {
        const action = choice(r, `p${p.index}`, [
          "keep",
          "remove",
          "softer",
          "louder",
          "add",
          "set",
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
                  : action === "add" && p.currentVelocity
                    ? p.currentVelocity
                    : Number(
                        choice(r, `v${p.index}`, [
                          "v32",
                          "v56",
                          "v80",
                          "v104",
                          "v127",
                        ]).slice(1),
                      );
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
