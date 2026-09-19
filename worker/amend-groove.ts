import { drums } from "../src/composer-model";
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
        "This is a surgical edit, not a new composition. Identify the instruments requested by this edit. A tom fill is a composition request covering high, mid and low toms unless particular pitches are specified. Individual positions do NOT need to be explicitly listed for a fill. A hi-hat without open/closed qualification means closed hat. Do not select accompanying instruments or make implicit musical improvements.",
    },
    {
      intent: {
        type: "choice",
        instructions:
          "Interpret the requested edit. Choose fill for composing a new fill, even if its individual notes are not specified. Choose exact for targeted note/dynamic changes or removing notes.",
        criteria: {
          fill: "Compose a musical fill in the selected bars.",
          exact: "Perform the specified note or dynamic edit.",
        },
      },
      span: {
        type: "choice",
        instructions:
          "If composing a fill, choose its extent from the request and musical context. A generic fill usually occupies the last beat or last two beats, not the entire bar. Explicit requests win.",
        criteria: {
          last_beat: "Short fill near the end of the bar.",
          last_two: "Two-beat fill developing into the next bar.",
          whole_bar: "Whole-bar fill explicitly requested.",
          custom: "Other explicitly specified position or not a fill.",
        },
      },
      contour: {
        type: "choice",
        instructions:
          "Choose the musical direction of a requested fill. Honor any explicit ascending/descending request. This guides your later individual note decisions; it is not a preset pattern.",
        criteria: {
          descending: "Move from higher drums towards lower drums.",
          ascending: "Move from lower drums towards higher drums.",
          mixed: "A conversational mixture of pitches and spaces.",
          single: "One requested drum only.",
        },
      },
      supported: {
        type: "choice",
        instructions:
          "Can this request be represented by adding, removing or changing velocities of existing drum-grid cells? Timbre, tempo, swing, off-grid timing, unavailable instruments and ambiguous locations are unsupported. A bar, numbered beat, e/&/a or explicit subdivision are supported. Adding a snare or tom fill on a specified bar IS SUPPORTED even without individual note positions; you will choose its individual hits and intensities in the next step.",
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
            instructions: `For edits to ${d.name}, what within-beat alignment is requested? A numbered beat without suffix (such as beat 3) means exactly its START, never the whole beat. If no specific onset is requested (e.g. make hats quieter), a fill is requested, or several distinct alignments are requested, choose all.`,
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
            instructions: `Does this edit involve ${d.name}? A general tom fill selects all three tom pitches; a snare fill selects snare. For an individual note edit, select only the named instrument. Do not change unrelated accompaniment unless requested.`,
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
  const intent = choice(scope, "intent", ["fill", "exact"]);
  const musicalDirection =
    intent === "fill"
      ? {
          span: choice(scope, "span", [
            "last_beat",
            "last_two",
            "whole_bar",
            "custom",
          ]),
          contour: choice(scope, "contour", [
            "descending",
            "ascending",
            "mixed",
            "single",
          ]),
        }
      : null;
  const targets = drums.filter(
    (d) => choice(scope, d.id, ["yes", "no"]) === "yes",
  );
  const steps = groove.steps.map((s) => ({ ...s }));
  const resolution = groove.resolution!;
  const edits: { step: number; drum: string; before: number; after: number }[] =
    [];
  if (intent === "fill") {
    const voiceOptions = Object.fromEntries(
      targets.map((d) => [
        d.id,
        `Start a NEW ${d.name} strike at this exact position.`,
      ]),
    );
    const decisions: string[] = [];
    for (const bar of targetBars)
      for (let local = 0; local < resolution; local++) {
        const index = (bar - 1) * resolution + local;
        const beat = local / (resolution / 4) + 1;
        const inSpan =
          musicalDirection?.span === "last_beat"
            ? beat >= 4
            : musicalDirection?.span === "last_two"
              ? beat >= 3
              : true;
        const r = await ask(
          {
            amendment: prompt,
            musicalDirection,
            currentPosition: {
              index,
              bar,
              beat,
              numberedBeat: Math.floor(beat),
              fractionOfBeat: (local % (resolution / 4)) / (resolution / 4),
              sixteenthBoundary: local % (resolution / 16) === 0,
              inChosenSpan: inSpan,
            },
            existingNotes: groove.steps[index],
            previousDecisions: decisions,
            instruction:
              "Compose one position of the requested fill. You choose every hit, rest and intensity. KEEP means leave existing notes alone and add nothing. Outside the chosen span choose keep. Inside it, make a rhythmic phrase, not a machine-gun roll: for a normal fill use eighth/sixteenth onsets with spaces, leaving intervening thirty-second positions empty. For descending fills start high and move toward low near the bar end; ascending is the reverse. Read prior decisions to maintain this direction. Do not repeat a ringing note at every subdivision. Preserve unrelated accompaniment.",
          },
          {
            strike: {
              type: "choice",
              instructions:
                "Should a NEW drum strike begin at this exact position? If inChosenSpan is false choose no. Within the chosen span, a normal fill needs a few purposeful strikes on eighth/sixteenth boundaries; choose no on intervening thirty-second subdivisions unless a roll was requested. Do not let previous rests stop the requested fill from starting. Decide occurrence separately from which drum plays.",
              criteria: {
                yes: "A new strike belongs here in the requested fill.",
                no: "This position remains unchanged; no new strike.",
              },
            },
            voice: {
              type: "choice",
              instructions:
                "Assuming a new strike begins here, which ONE drum should play? Follow the requested pitch direction across the span and your previous decisions. Descending means high first, mid next, low at the end; ascending reverses that progression.",
              criteria: voiceOptions,
            },
            velocity: {
              type: "choice",
              instructions:
                "If a hit starts here, choose its intensity to shape a musical fill. Strong anchor hits, softer connecting hits; not maximum throughout.",
              criteria: {
                v32: "Ghost",
                v56: "Soft",
                v80: "Medium",
                v104: "Strong",
                v127: "Maximum accent",
              },
            },
          },
        );
        const voice =
          choice(r, "strike", ["yes", "no"]) === "no"
            ? "keep"
            : choice(
                r,
                "voice",
                targets.map((d) => d.id),
              );
        const velocity =
          voice === "keep"
            ? 0
            : Number(
                choice(r, "velocity", [
                  "v32",
                  "v56",
                  "v80",
                  "v104",
                  "v127",
                ]).slice(1),
              );
        decisions.push(
          `Bar ${bar}, beat ${beat}: ${voice}${velocity ? ` velocity ${velocity}` : ""}`,
        );
        if (voice !== "keep") {
          const drum = voice as (typeof drums)[number]["id"];
          const before = steps[index][drum];
          if (before !== velocity) {
            steps[index][drum] = velocity;
            edits.push({ step: index, drum, before, after: velocity });
          }
        }
      }
    return { groove: { ...groove, steps }, edits, modelCalls, inputTokens };
  }
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
          intent,
          musicalDirection,
          originalNotes: groove.steps,
          previousEditDecisions: edits,
          instrument: drum.name,
          positions: scopedPositions,
          targetBars: [...targetBars],
          instructionPriority:
            "The amendment adds NEW hits even where the existing velocity is zero. Original arrangement labels or fill locations do not limit where a new hit may be added.",
          instruction:
            "For intent=exact, edit only explicitly requested positions; preserve everything else. For intent=fill, COMPOSE individual new onsets to realize musicalDirection within the selected bar: the broad fill request authorizes choosing positions and velocities, so do not return keep merely because each hit was not spelled out. Keep the rest of the bar unchanged. A descending tom fill moves high to mid to low through its selected span, with purposeful spaces; avoid simultaneous tom pitches or rolls at every subdivision unless requested. Consult previousEditDecisions to coordinate with already chosen tom notes. Beat 2& means beat=2 AND syllable=&, not beat 2 onset. A specified bar excludes every other bar. For add, keep existing hits unless a velocity change is requested. For quieter/softer or louder requests, target EXISTING nonzero hits in the requested instrument and location and choose softer or louder; keep rests. Never add chokes, fills, accompaniment or improve other notes.",
        },
        Object.fromEntries(
          scopedPositions.flatMap((p) => [
            [
              `p${p.index}`,
              {
                type: "choice",
                instructions: `At bar ${p.bar}, beat ${p.beat}, subdivision ${p.subdivision}/${p.subdivisionsPerBeat} (${p.syllable}), should this ${drum.name} cell change? Current velocity ${p.currentVelocity}. For an exact edit, KEEP unless this exact cell is targeted. For a fill, choose whether a NEW strike of this drum belongs at this position given the requested fill, span, contour and previous decisions. You are choosing the actual rhythm; no preset will be applied.`,
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
