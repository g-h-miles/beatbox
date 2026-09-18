import { composeBar } from "./compose-bar";
import { drums } from "../src/model";
import type { BeatStep, MusicalIntent } from "../src/generator";
import type { AppEnv } from "./index";

const velocities = {
  rest: 0,
  ghost: 32,
  soft: 56,
  medium: 80,
  strong: 104,
  accent: 127,
} as const;
const allowedVelocities = new Set<number>(Object.values(velocities));
const criteria = {
  rest: "Do not play this instrument at this step (velocity 0).",
  ghost: "Play a very quiet ghost note (MIDI velocity 32).",
  soft: "Play softly (MIDI velocity 56).",
  medium: "Play at medium intensity (MIDI velocity 80).",
  strong: "Play strongly (MIDI velocity 104).",
  accent: "Play at maximum intensity as an accent (MIDI velocity 127).",
};
// These are musical vocabulary for TypeSafe to select and interpret, never note templates.
const intentCriteria = {
  foundation: {
    one_drop:
      "Roots reggae one-drop foundation: kick and snare together around the third beat, leaving the first beat open. Offbeat cymbals can supply syncopation.",
    backbeat:
      "Regular backbeat: clear snare on the second and fourth beats with a supporting kick pattern.",
    half_time:
      "Half-time foundation: a broad snare backbeat on the third beat, slower-feeling kick phrase.",
    four_on_floor:
      "Four-on-the-floor: steady quarter-note kicks with appropriate backbeats.",
    broken:
      "Broken kick/snare groove: a recurring kick motif and clear snare accents anchor EVERY bar, with additional displaced notes and meaningful spaces.",
    free: "An unconventional foundation determined by the user's instructions.",
  },
  timekeeping: {
    none: "No timekeeping cymbals: omit hi-hat and ride.",
    eighths:
      "Steady eighth-note timekeeping (numbered beats and their & offbeats).",
    offbeat_eighths:
      "Timekeeping on the & offbeats between the numbered beats, leaving the numbered beats open.",
    sixteenths: "Sixteenth-note timekeeping with suitable dynamic accents.",
    quarters: "Quarter-note timekeeping on the numbered beats.",
    sparse: "Sparse, widely spaced timekeeping accents.",
    free: "An irregular timekeeping pattern, or silence if the user asks for no timekeeping cymbals.",
  },
  voice: {
    closed: "Primarily closed hi-hat timekeeping.",
    open: "Primarily open hi-hat timekeeping.",
    ride: "Primarily ride cymbal timekeeping.",
    mixed: "A deliberate mixture of timekeeping voices.",
  },
  variation: {
    steady:
      "Deliberately rigid repetition; honor an explicit request for no fills or an unchanging pattern.",
    subtle:
      "A natural recurring groove with subtle occasional variations in articulation or phrase details.",
    fills:
      "Maintain the groove and use purposeful fills near phrase boundaries when the musical request calls for them.",
    evolving: "Develop the groove substantially across the phrase.",
  },
  syncopation: {
    straight: "Mainly on the strong grid positions; a grounded, straight feel.",
    offbeats:
      "Emphasize offbeats and anticipations in the groove; do not reduce this to only numbered-beat accents.",
    broken:
      "Strong displacement and unexpected gaps around a grounded, repeatable kick/snare pulse.",
  },
} as const;
const validIntent = (value: unknown): value is MusicalIntent =>
  record(value) &&
  Object.keys(value).length === Object.keys(intentCriteria).length &&
  Object.entries(intentCriteria).every(
    ([key, options]) =>
      typeof value[key] === "string" &&
      Object.hasOwn(options, value[key] as string),
  );
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

async function boundedJson(
  body: ReadableStream<Uint8Array> | null,
  maximum: number,
): Promise<unknown> {
  if (!body) throw Error("input");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum) {
        await reader.cancel();
        throw Error("size");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw Error("input");
  }
}

export async function generateStep(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Use POST" }, 405);
  if (request.headers.get("Origin") !== new URL(request.url).origin)
    return json({ error: "Use the app to make a beat." }, 403);
  if (!env.TYPESAFE_API_KEY)
    return json(
      { error: "TypeSafe is not connected yet.", retryable: false },
      503,
    );
  const limit = await env.GENERATE_LIMITER.limit({
    key: request.headers.get("CF-Connecting-IP") || "local",
  });
  if (!limit.success)
    return json({ error: "Take a breather. Try again in a minute." }, 429);
  let upstream = false;
  try {
    const body = await boundedJson(request.body, 131072);
    if (
      !record(body) ||
      typeof body.prompt !== "string" ||
      !body.prompt.trim() ||
      body.prompt.length > 1000 ||
      typeof body.bpm !== "number" ||
      !Number.isInteger(body.bpm) ||
      body.bpm < 40 ||
      body.bpm > 240 ||
      ![1, 2, 4].includes(body.bars as number) ||
      ![8, 16, 32, 64].includes(body.resolution as number) ||
      !Array.isArray(body.history) ||
      body.history.length >= (body.bars as number) * (body.resolution as number)
    )
      throw Error("input");
    if (
      body.oneBar !== undefined &&
      (body.oneBar !== true ||
        ![1, 4].includes(body.bars as number) ||
        ![16, 32].includes(body.resolution as number) ||
        body.history.length ||
        body.intent ||
        body.batchStart !== undefined ||
        body.planOnly)
    )
      throw Error("input");
    const history: BeatStep[] = body.history.map((step: unknown) => {
      if (
        !record(step) ||
        Object.keys(step).length !== drums.length ||
        drums.some(
          ({ id }) =>
            !Object.hasOwn(step, id) ||
            typeof step[id] !== "number" ||
            !allowedVelocities.has(step[id]),
        )
      )
        throw Error("input");
      return step as BeatStep;
    });
    if (body.intent !== undefined && !validIntent(body.intent))
      throw Error("input");
    if (history.length && !validIntent(body.intent)) throw Error("input");
    const batch = body.batchStart !== undefined;
    if (body.planOnly !== undefined && typeof body.planOnly !== "boolean")
      throw Error("input");
    if (
      batch &&
      (!Number.isInteger(body.batchStart) ||
        !Number.isInteger(body.batchSize) ||
        (body.batchStart as number) < 0 ||
        (body.batchSize as number) < 1 ||
        (body.batchSize as number) > 8 ||
        (body.batchStart as number) + (body.batchSize as number) >
          (body.bars as number) * (body.resolution as number) ||
        history.length ||
        !validIntent(body.intent) ||
        body.planOnly)
    )
      throw Error("input");
    if (body.planOnly && (history.length || body.intent)) throw Error("input");
    const index = history.length;
    const resolution = body.resolution as number;
    const bars = body.bars as number;
    const perBeat = resolution / 4;
    const position = (i: number) => {
      const withinBeat = i % perBeat;
      const beat = Math.floor((i % resolution) / perBeat) + 1;
      const count =
        withinBeat === 0
          ? String(beat)
          : withinBeat === perBeat / 2
            ? `${beat}&`
            : withinBeat === perBeat / 4
              ? `${beat}e`
              : withinBeat === (perBeat * 3) / 4
                ? `${beat}a`
                : `${beat}+${withinBeat}/${perBeat}`;
      return `step ${i + 1}, bar ${Math.floor(i / resolution) + 1}, beat ${beat}, subdivision ${withinBeat + 1}/${perBeat} (count ${count})`;
    };
    const previousDecisions = history
      .map(
        (step, i) =>
          `${position(i)}: ${
            drums
              .filter(({ id }) => step[id] > 0)
              .map(({ id, name }) => `${name} velocity ${step[id]}`)
              .join(" + ") || "rest"
          }`,
      )
      .join("\n");
    upstream = true;
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(25000),
    ]);
    const infer = async (state: unknown, questions: unknown) => {
      signal.throwIfAborted();
      const response = await fetch("https://api.typesafe.ai/v1/systemone", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.TYPESAFE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "jev-latest", state, questions }),
        signal,
      });
      if (!response.ok) {
        console.error(
          JSON.stringify({
            event: "generator_upstream_error",
            status: response.status,
            phase:
              record(state) && "currentPosition" in state ? "step" : "intent",
          }),
        );
        if (response.status === 400 || response.status === 422) {
          const detail = await boundedJson(response.body, 8000);
          console.error(
            JSON.stringify({
              event: "generator_validation_error",
              errorType:
                record(detail) && record(detail.detail)
                  ? detail.detail.error_type
                  : "invalid_request",
            }),
          );
        } else await response.body?.cancel();
        if ([429, 502, 503, 504, 529].includes(response.status)) {
          const retry = json(
            {
              error:
                "TypeSafe is busy. Your completed steps are saved; try continuing shortly.",
            },
            503,
          );
          retry.headers.set("Retry-After", "2");
          throw retry;
        }
        throw Error("upstream");
      }
      const result = await boundedJson(response.body, 64000);
      if (!record(result) || !record(result.answers)) throw Error("upstream");
      return result;
    };
    const reportedTokens = (result: Record<string, unknown>) => {
      const value = record(result.usage) ? result.usage.input_tokens : null;
      return typeof value === "number" &&
        Number.isSafeInteger(value) &&
        value >= 0
        ? value
        : null;
    };
    if (body.oneBar === true)
      return json(
        await composeBar(
          body.prompt.trim(),
          body.bpm,
          infer,
          body.bars as number,
          body.resolution as number,
        ),
      );
    let intent = body.intent as MusicalIntent | undefined;
    let planningTokens: number | null = 0;
    let modelCalls = 1;
    if (!intent) {
      const plan = await infer(
        {
          prompt: body.prompt.trim(),
          bpm: body.bpm,
          bars,
          resolution,
          task: "Translate the requested drum groove into a concrete musical intent for the drummer. Infer the characteristic rhythm of the requested style. Explicit user instructions take precedence. Honor the available 1/resolution note grid: never choose a density that requires unavailable finer positions. These decisions will guide an entire phrase; each note will be selected separately.",
        },
        Object.fromEntries(
          Object.entries(intentCriteria).map(([id, options]) => [
            id,
            {
              type: "choice",
              instructions: `Choose the ${id} that best realizes the user's requested drum groove in prompt. Infer a musically recognizable interpretation; honor explicit instructions.`,
              criteria: options,
            },
          ]),
        ),
      );
      intent = Object.fromEntries(
        Object.keys(intentCriteria).map((key) => {
          const answer = (plan.answers as Record<string, unknown>)[key];
          if (!record(answer) || answer.type !== "choice")
            throw Error("upstream");
          return [key, answer.choice];
        }),
      ) as MusicalIntent;
      if (!validIntent(intent)) throw Error("upstream");
      planningTokens = reportedTokens(plan);
      modelCalls = 2;
    }
    if (body.planOnly)
      return json({ intent, inputTokens: planningTokens, modelCalls: 1 });
    const musicalIntent = Object.fromEntries(
      Object.entries(intent).map(([key, value]) => [
        key,
        (
          intentCriteria[key as keyof typeof intentCriteria] as Record<
            string,
            string
          >
        )[value],
      ]),
    );
    const prompt = body.prompt.trim();
    const stateAt = (index: number) => ({
      prompt,
      bpm: body.bpm,
      musicalIntent,
      task: "Write the next instant of an actual drum performance, not a description of music. The user wants an intentional, recognizable groove across the whole phrase. You are the drummer: choose the next action using the style and the metrical position.",
      grid: `4/4 time. ${bars} bars total. Each bar contains ${resolution} positions at 1/${resolution}-note resolution, ${perBeat} positions per quarter-note beat. The finished phrase loops. Resolution provides available positions, not an instruction to hit every position.`,
      currentPosition: position(index),
      currentBar: Math.floor(index / resolution) + 1,
      currentBeat: Math.floor((index % resolution) / perBeat) + 1,
      fractionAfterBeat: `${index % perBeat}/${perBeat}`,
      metricalAlignment: {
        quarterNoteBoundary: index % perBeat === 0,
        eighthNoteBoundary: index % (resolution / 8) === 0,
        sixteenthNoteBoundary: index % (resolution / 16) === 0,
        thirtySecondNoteBoundary: index % (resolution / 32) === 0,
        sixtyFourthNoteBoundary: index % (resolution / 64) === 0,
      },
      numberedBeatOnset:
        index % perBeat === 0
          ? `EXACT onset of numbered beat ${Math.floor((index % resolution) / perBeat) + 1}`
          : "NONE: this instant is BETWEEN numbered beat onsets, not on the numbered beat",
      onsetSemantics:
        "Every PLAY creates a NEW drum strike at this exact instant. A previous note ringing out is NOT a new strike. Grid positions between the requested note boundaries require REST, even while the previous sound is still audible. metricalAlignment describes timing only: true means the instant lies exactly on that note-value boundary, false means between its boundaries. These boundaries OVERLAP: every numbered quarter-note beat is ALSO an eighth-note boundary (and a sixteenth-note boundary). Eighth-note timekeeping plays on BOTH the numbered beats AND the & offbeats, not only the offbeats. For example, eighth-note strikes only occur on eighthNoteBoundary=true positions; finer intervening grid positions are gaps, not extra eighth-note strikes. History is observation, not permission to repeat an earlier mistake. Follow the requested pattern over history when they conflict.",
      isQuarterNoteBeat: index % perBeat === 0,
      isEighthNoteOffbeat: index % perBeat === perBeat / 2,
      samePositionPreviousBar:
        index >= resolution
          ? `${position(index - resolution)}: ${JSON.stringify(history[index - resolution])}`
          : "First bar: establish the motif.",
      previousDecisions:
        previousDecisions ||
        "No previous decisions. Begin the requested groove.",
      composition:
        "Follow the user's explicit musical instructions first, then realize musicalIntent (chosen by TypeSafe for this phrase). Interpret the intent fields as compatible roles: foundation describes kick/snare, timekeeping describes cymbals. Syncopation adds offbeat character where those roles permit; it does not erase their anchor beats or override explicit user instructions. Establish a coherent rhythmic motif, then develop it through repetition and purposeful variation. Recurring kicks and snares form a groove rather than isolated sound effects. A previously played instrument can and usually should recur at the corresponding musical position in later bars. Judge this exact beat/subdivision, not whether an instrument has already appeared. Sustain the requested groove across the phrase; use fills and accents intentionally and resolve naturally into the loop. A fine resolution should leave space between the groove's meaningful hits. History is a record of past actions, not evidence that silence is the goal.",
      velocityMeaning:
        "Each previous line lists simultaneous instruments and MIDI velocities. Unlisted instruments were silent. A rest line means all instruments were silent.",
    });
    const state = stateAt(index);
    const questions = {
      ...Object.fromEntries(
        ["kick", "snare"].map((instrument) => [
          instrument,
          {
            type: "choice",
            instructions: `Does a NEW ${instrument} strike start at this EXACT instant? Read numberedBeatOnset and metricalAlignment first. A request for a numbered beat means its exact quarterNoteBoundary, NOT every position inside that beat interval. Realize prompt and musicalIntent.foundation; between its specified onsets choose REST. Add offbeat or subdivision strikes only when the requested groove calls for them. Another instrument may strike simultaneously. Do not replay a ringing note or copy previous timing mistakes.`,
            criteria: {
              play: `Strike the ${instrument} at this instant in its repeating groove.`,
              rest: `This instant falls between the ${instrument}'s strikes; leave it silent now.`,
            },
          },
        ]),
      ),
      cymbal: {
        type: "choice",
        instructions:
          "Does a NEW timekeeping cymbal strike start at this EXACT instant? Read `metricalAlignment` and `onsetSemantics` first. Match the note spacing in `prompt` and `musicalIntent.timekeeping`: eighth-note timekeeping requires eighthNoteBoundary=true, quarter notes require quarterNoteBoundary=true, sixteenths require sixteenthNoteBoundary=true. False means this instant falls BETWEEN those strikes: choose REST, not a new hit while the previous note rings. For ordinary eighth-note timekeeping, BOTH the numbered quarter beats and the & offbeats are strikes: quarterNoteBoundary=true does NOT disqualify an eighth-note strike. Only specifically OFFBEAT eighths additionally require isEighthNoteOffbeat=true. A cymbal may and often does strike simultaneously with kick or snare; this is not an exclusive choice between instruments. A finer editing grid does not increase the requested hit density. Explicit user instructions take precedence; history is not permission to repeat a timing mistake.",
        criteria: {
          play: "A NEW hi-hat or ride onset belongs at this exact time according to the requested note spacing.",
          rest: "This instant is BETWEEN the requested cymbal onsets. Do not trigger a new strike; a previous cymbal may still be ringing.",
        },
      },
      cymbal_voice: {
        type: "choice",
        instructions:
          "Assuming a timekeeping cymbal note plays at currentPosition, which cymbal best expresses musicalIntent.voice and prompt, and fits previousDecisions?",
        criteria: {
          closed: "Closed hi-hat.",
          open: "Open hi-hat.",
          ride: "Ride cymbal.",
        },
      },
      ...Object.fromEntries(
        ["crash", "aux"].map((id) => [
          id,
          {
            type: "choice",
            instructions: `Should the drummer add ${id === "crash" ? "a crash cymbal accent" : "an auxiliary percussion / breath sound"} at currentPosition, given the requested groove, phrase position, and previous decisions?`,
            criteria: {
              play: "Play it at this instant.",
              rest: "Leave it silent at this instant.",
            },
          },
        ]),
      ),
      ...Object.fromEntries(
        drums.map(({ id, name }) => [
          `${id}_velocity`,
          {
            type: "choice",
            instructions: `Assuming ${name} plays at currentPosition, choose its MIDI dynamic for a balanced drum performance. Follow any explicit dynamic instruction in prompt first. ${["closed", "open", "ride"].includes(id) ? "Timekeeping cymbals normally support the kick/snare rather than hitting every note as hard as the foundation. Shape recurring subdivisions with musical accents and quieter supporting notes, while retaining the requested feel." : ["kick", "snare"].includes(id) ? "Give foundational accents weight, and use quieter dynamics for connective or ghost notes. A main backbeat and a ghost note should not have the same intensity." : "Reserve hard accents for musical emphasis; supporting percussion should sit behind the foundation."} Use musicalIntent, exact metrical position and previousDecisions. Strong and maximum accents are purposeful emphases, not a default for every strike.`,
            criteria: Object.fromEntries(
              Object.entries(criteria).filter(([key]) => key !== "rest"),
            ),
          },
        ]),
      ),
    };
    // Each question carries its full position: API question IDs are NOT model input.
    const batchStart = batch ? (body.batchStart as number) : 0;
    const batchSize = batch ? (body.batchSize as number) : 1;
    const batchQuestions = Object.fromEntries(
      Array.from({ length: batchSize }, (_, offset) => {
        const i = batchStart + offset;
        const at = stateAt(i);
        const cadence = {
          none: false,
          quarters: i % perBeat === 0,
          eighths: i % (resolution / 8) === 0,
          offbeat_eighths: i % perBeat === perBeat / 2,
          sixteenths: resolution >= 16 && i % (resolution / 16) === 0,
          sparse: null,
          free: null,
        }[intent!.timekeeping];
        const timing = JSON.stringify({
          currentPosition: at.currentPosition,
          numberedBeatOnset: at.numberedBeatOnset,
          metricalAlignment: at.metricalAlignment,
          isEighthNoteOffbeat: at.isEighthNoteOffbeat,
        });
        const ask = (
          id: string,
          instructions: string,
          options: Record<string, string>,
        ) => [
          `${offset}_${id}`,
          {
            type: "choice",
            instructions: `${timing} ${instructions}`,
            criteria: options,
          },
        ];
        const onset = (instrument: string, role: string) =>
          ask(
            instrument,
            `Should a NEW ${instrument} strike start HERE? Follow the user's groove and ${role}. A ringing earlier note is not a new strike.`,
            {
              play: `A ${instrument} onset belongs at this exact position.`,
              rest: `No ${instrument} onset here.`,
            },
          );
        return [
          onset("kick", "the kick/snare foundation"),
          onset("snare", "the kick/snare foundation"),
          ask(
            "cymbal",
            `Inferred timekeeping = ${intent!.timekeeping}. This exact instant lies ${cadence === null ? "on an unspecified rhythmic grid" : cadence ? "ON the selected timekeeping onset grid" : "BETWEEN the selected timekeeping onsets"}. ${questions.cymbal.instructions}`,
            questions.cymbal.criteria,
          ),
          ask(
            "cymbal_voice",
            "If a timekeeping cymbal strikes here, choose its voice.",
            {
              closed: "Closed hi-hat",
              open: "Open hi-hat",
              ride: "Ride cymbal",
            },
          ),
          ...["crash", "aux"].map((id) =>
            ask(
              id,
              `Add a NEW ${id === "aux" ? "auxiliary percussion or breath" : "crash cymbal"} strike here? Honor exclusions in the prompt. Ordinary kick/snare/hat grooves do not imply this extra instrument.`,
              {
                play: `The requested arrangement calls for this additional ${id} strike here.`,
                rest: `No additional ${id} strike is called for here.`,
              },
            ),
          ),
          ...drums.map(({ id, name }) =>
            ask(
              `${id}_velocity`,
              `If ${name} strikes here, select its intensity. Hats normally support the kick/snare at soft or medium intensity; main kick/snare accents are strong. Ghost notes are quiet. Follow explicit requested dynamics.`,
              Object.fromEntries(
                Object.entries(criteria).filter(([key]) => key !== "rest"),
              ),
            ),
          ),
        ];
      }).flat(),
    );
    const result = await infer(
      batch
        ? {
            prompt: state.prompt,
            musicalIntent,
            meter: `4/4, ${bars} bars, 1/${resolution} note grid. Repeat a coherent groove; use variation only as requested.`,
            rule: "The explicit user prompt overrides inferred direction. Every question is a separate exact onset. Finer resolution does not increase requested note density. Kick/snare and cymbals may strike together. No instrument is required to play on every position.",
          }
        : state,
      batch ? batchQuestions : questions,
    );
    const decode = (prefix: string) => {
      const answers = result.answers as Record<string, unknown>;
      const choice = (id: string, allowed: string[]) => {
        const answer = answers[prefix + id];
        if (
          !record(answer) ||
          answer.type !== "choice" ||
          typeof answer.choice !== "string" ||
          !allowed.includes(answer.choice)
        )
          throw Error("upstream");
        return answer.choice;
      };
      const cymbalPlay = choice("cymbal", ["play", "rest"]) === "play";
      const cymbalVoice = choice("cymbal_voice", ["closed", "open", "ride"]);
      const cymbal = cymbalPlay ? cymbalVoice : "rest";
      const plays: Record<string, boolean> = {
        kick: choice("kick", ["play", "rest"]) === "play",
        snare: choice("snare", ["play", "rest"]) === "play",
        closed: cymbal === "closed",
        open: cymbal === "open",
        ride: cymbal === "ride",
        crash: choice("crash", ["play", "rest"]) === "play",
        aux: choice("aux", ["play", "rest"]) === "play",
      };
      const step = Object.fromEntries(
        drums.map(({ id }) => {
          const dynamic = choice(`${id}_velocity`, [
            "ghost",
            "soft",
            "medium",
            "strong",
            "accent",
          ]);
          return [
            id,
            plays[id] ? velocities[dynamic as keyof typeof velocities] : 0,
          ];
        }),
      ) as BeatStep;
      return step;
    };
    const stepTokens = reportedTokens(result);
    const inputTokens =
      planningTokens === null || stepTokens === null
        ? null
        : planningTokens + stepTokens;
    return json(
      batch
        ? {
            start: batchStart,
            steps: Array.from({ length: batchSize }, (_, i) => decode(`${i}_`)),
            intent,
            inputTokens,
            modelCalls,
          }
        : { step: decode(""), intent, inputTokens, modelCalls },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    if (!upstream)
      return json(
        {
          error:
            error instanceof Error && error.message === "size"
              ? "Request too large."
              : "Invalid beat settings or history.",
        },
        error instanceof Error && error.message === "size" ? 413 : 400,
      );
    return json(
      {
        error:
          "TypeSafe could not finish this step. Your completed steps are saved; try continuing.",
      },
      502,
    );
  }
}
