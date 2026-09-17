import { drums } from "../src/model";
import type { BeatStep } from "../src/generator";
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
    return json({ error: "TypeSafe is not connected yet." }, 503);
  const limit = await env.GENERATE_LIMITER.limit({
    key: request.headers.get("CF-Connecting-IP") || "local",
  });
  if (!limit.success)
    return json({ error: "Take a breather. Try again in a minute." }, 429);
  let upstream = false;
  try {
    const body = await boundedJson(request.body, 16000);
    if (
      !record(body) ||
      typeof body.prompt !== "string" ||
      !body.prompt.trim() ||
      body.prompt.length > 1000 ||
      typeof body.bpm !== "number" ||
      !Number.isInteger(body.bpm) ||
      body.bpm < 40 ||
      body.bpm > 240 ||
      ![8, 16, 32, 64].includes(body.steps as number) ||
      !Array.isArray(body.history) ||
      body.history.length >= (body.steps as number)
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
    const index = history.length;
    const position = (i: number) =>
      `step ${i + 1}, bar ${Math.floor(i / 16) + 1}, beat ${Math.floor((i % 16) / 4) + 1}, sixteenth ${(i % 4) + 1} (count ${Math.floor((i % 16) / 4) + 1}${["", "e", "&", "a"][i % 4]})`;
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
    const state = {
      prompt: body.prompt.trim(),
      bpm: body.bpm,
      task: "Compose a playable drum groove that expresses the requested musical style. The pattern below is a work in progress: choose its next sixteenth note, using musical judgment.",
      grid: `4/4 time. ${body.steps} consecutive sixteenth-note steps total; 16 steps per bar. The finished pattern loops.`,
      currentPosition: position(index),
      previousDecisions:
        previousDecisions || "No previous decisions. This is the first step.",
      velocityMeaning:
        "Each previous line lists the instruments played together and their MIDI velocities. Unlisted instruments were silent. A rest line means all instruments were silent.",
    };
    const questions = Object.fromEntries(
      drums.flatMap(({ id, name }) => [
        [
          id,
          {
            type: "choice",
            instructions: `A skilled drummer is composing the requested groove, choosing one sixteenth note at a time. At currentPosition, would playing the ${name} or resting the ${name} make the better next musical decision? Use your knowledge of the requested style and previousDecisions to choose what the drummer should do NEXT.`,
            criteria: {
              play: `Strike the ${name} now as part of the requested groove.`,
              rest: `Leave the ${name} silent at this position in the groove.`,
            },
          },
        ],
        [
          `${id}_velocity`,
          {
            type: "choice",
            instructions: `Assuming the ${name} plays at currentPosition, how intensely should the drummer strike it to express the requested groove and fit previousDecisions? Choose the best dynamic for that possible strike.`,
            criteria: Object.fromEntries(
              Object.entries(criteria).filter(([key]) => key !== "rest"),
            ),
          },
        ],
      ]),
    );
    upstream = true;
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(25000),
    ]);
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
      await response.body?.cancel();
      return json(
        {
          error:
            response.status === 429 || response.status === 529
              ? "TypeSafe is busy. Your completed steps are saved; try continuing shortly."
              : "TypeSafe could not finish this step. Your completed steps are saved.",
        },
        502,
      );
    }
    const result = await boundedJson(response.body, 64000);
    if (!record(result) || !record(result.answers)) throw Error("upstream");
    const answers = result.answers;
    const step = Object.fromEntries(
      drums.map(({ id }) => {
        const answer = answers[id];
        const dynamic = answers[`${id}_velocity`];
        if (
          !record(answer) ||
          answer.type !== "choice" ||
          !["play", "rest"].includes(answer.choice as string) ||
          !record(dynamic) ||
          dynamic.type !== "choice" ||
          typeof dynamic.choice !== "string" ||
          dynamic.choice === "rest" ||
          !Object.hasOwn(velocities, dynamic.choice)
        )
          throw Error("upstream");
        return [
          id,
          answer.choice === "rest"
            ? 0
            : velocities[dynamic.choice as keyof typeof velocities],
        ];
      }),
    ) as BeatStep;
    const usage = record(result.usage) ? result.usage.input_tokens : null;
    const inputTokens =
      typeof usage === "number" && Number.isSafeInteger(usage) && usage >= 0
        ? usage
        : null;
    return json({ step, inputTokens });
  } catch (error) {
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
