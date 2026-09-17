import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type AppEnv } from "../worker";
import { drums } from "../src/model";
const silent = Object.fromEntries(drums.map(({ id }) => [id, 0]));
const env = {
  TYPESAFE_API_KEY: "test-secret",
  GENERATE_LIMITER: { limit: async () => ({ success: true }) },
  CLASSIFY_LIMITER: { limit: async () => ({ success: true }) },
  ASSETS: {
    fetch: async () => new Response("asset"),
    connect: () => {
      throw Error("unused");
    },
  },
} as AppEnv;
const intent = {
  foundation: "backbeat",
  timekeeping: "eighths",
  voice: "closed",
  variation: "steady",
  syncopation: "straight",
};
const valid = {
  intent,
  prompt: "syncopated reggae",
  bpm: 96,
  bars: 4,
  resolution: 16,
  history: [],
};
const request = (body: unknown, origin = "https://beatbox.example") =>
  new Request("https://beatbox.example/api/generate-step", {
    method: "POST",
    headers: { Origin: origin },
    body: JSON.stringify(body),
  });
const answers = () => ({
  kick: { type: "choice", choice: "play" },
  snare: { type: "choice", choice: "rest" },
  cymbal: { type: "choice", choice: "rest" },
  cymbal_voice: { type: "choice", choice: "closed" },
  crash: { type: "choice", choice: "rest" },
  aux: { type: "choice", choice: "rest" },
  ...Object.fromEntries(
    drums.map(({ id }) => [
      `${id}_velocity`,
      { type: "choice", choice: "strong" },
    ]),
  ),
});
afterEach(() => vi.unstubAllGlobals());

describe("beat generation boundary", () => {
  it("passes every previous decision as a line and returns model choices and reported usage", async () => {
    const upstream = vi.fn<typeof fetch>(async () =>
      Response.json({ answers: answers(), usage: { input_tokens: 1203 } }),
    );
    vi.stubGlobal("fetch", upstream);
    const history = [
      silent,
      { ...silent, kick: 104 },
      { ...silent, closed: 32 },
    ];
    const response = await worker.fetch(request({ ...valid, history }), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      step: { ...silent, kick: 104 },
      inputTokens: 1203,
      intent,
      modelCalls: 1,
    });
    expect(upstream).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(upstream.mock.calls[0][1]?.body as string);
    expect(payload.state.previousDecisions.split("\n")).toHaveLength(3);
    expect(payload.state.previousDecisions).toContain(
      "step 2, bar 1, beat 1, subdivision 2/4 (count 1e): Kick velocity 104",
    );
    expect(payload.state.previousDecisions).toContain("Closed hat velocity 32");
    expect(payload.state.currentPosition).toBe(
      "step 4, bar 1, beat 1, subdivision 4/4 (count 1a)",
    );
    expect(payload.state.prompt).toBe(valid.prompt);
    expect(Object.keys(payload.questions)).toEqual([
      "kick",
      "snare",
      "cymbal",
      "cymbal_voice",
      "crash",
      "aux",
      ...drums.map((d) => `${d.id}_velocity`),
    ]);
    expect(payload.state.grid).toContain("4 bars total");
    expect(payload.state.fractionAfterBeat).toBe("3/4");
    for (const { id } of drums) {
      expect(payload.questions[`${id}_velocity`].instructions).toContain(
        "Assuming",
      );
      expect(
        Object.keys(payload.questions[`${id}_velocity`].criteria),
      ).toHaveLength(5);
    }
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("accepts 511 prior steps for an 8-bar 1/64 loop and rejects completed history", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ answers: answers() }));
    expect(
      (
        await worker.fetch(
          request({
            ...valid,
            bars: 4,
            resolution: 64,
            history: Array(255).fill(silent),
          }),
          env,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await worker.fetch(
          request({
            ...valid,
            bars: 4,
            resolution: 64,
            history: Array(256).fill(silent),
          }),
          env,
        )
      ).status,
    ).toBe(400);
  });
  it.each([
    null,
    { ...valid, prompt: " " },
    { ...valid, prompt: "x".repeat(1001) },
    { ...valid, bpm: 39 },
    { ...valid, bpm: 120.5 },
    { ...valid, resolution: 17 },
    { ...valid, bars: 3 },
    { ...valid, bars: 16 },
    { ...valid, bars: 8 },
    { ...valid, history: [null] },
    { ...valid, history: [{ kick: 32 }] },
    { ...valid, history: [{ ...silent, kick: 33 }] },
    { ...valid, history: [{ ...silent, kick: "32" }] },
    { ...valid, history: [{ ...silent, extra: 0 }] },
  ])("rejects invalid settings/history without inference: %j", async (body) => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    expect((await worker.fetch(request(body), env)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("limits body size, checks origin/key/method and enforces its own rate limit", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    expect(
      (await worker.fetch(request({ prompt: "x".repeat(132000) }), env)).status,
    ).toBe(413);
    expect(
      (await worker.fetch(request(valid, "https://evil.example"), env)).status,
    ).toBe(403);
    expect(
      (
        await worker.fetch(request(valid), {
          ...env,
          TYPESAFE_API_KEY: undefined,
        })
      ).status,
    ).toBe(503);
    expect(
      (
        await worker.fetch(
          new Request("https://beatbox.example/api/generate-step"),
          env,
        )
      ).status,
    ).toBe(405);
    expect(
      (
        await worker.fetch(request(valid), {
          ...env,
          GENERATE_LIMITER: { limit: async () => ({ success: false }) },
        } as AppEnv)
      ).status,
    ).toBe(429);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("uses the same musical position at every resolution and includes the previous bar observation", async () => {
    const upstream = vi.fn<typeof fetch>(async () =>
      Response.json({ answers: answers() }),
    );
    vi.stubGlobal("fetch", upstream);
    for (const resolution of [8, 16, 32, 64]) {
      const history = Array(resolution + resolution / 4).fill(silent);
      history[resolution / 4] = { ...silent, snare: 104 };
      expect(
        (await worker.fetch(request({ ...valid, resolution, history }), env))
          .status,
      ).toBe(200);
      const payload = JSON.parse(
        upstream.mock.calls.at(-1)![1]?.body as string,
      );
      expect(payload.state.currentBar).toBe(2);
      expect(payload.state.currentBeat).toBe(2);
      expect(payload.state.isQuarterNoteBeat).toBe(true);
      expect(payload.state.previousDecisions.split("\n")).toHaveLength(
        history.length,
      );
      expect(payload.state.samePositionPreviousBar).toContain('"snare":104');
    }
  });
  it.each([
    [0, true, true, true, true],
    [1, false, false, false, false],
    [2, false, false, false, true],
    [4, false, false, true, true],
    [8, false, true, true, true],
    [16, true, true, true, true],
  ])(
    "grounds 1/64 position %s in exact musical boundaries",
    async (index, quarter, eighth, sixteenth, thirtySecond) => {
      const upstream = vi.fn<typeof fetch>(async () =>
        Response.json({ answers: answers() }),
      );
      vi.stubGlobal("fetch", upstream);
      await worker.fetch(
        request({
          ...valid,
          resolution: 64,
          history: Array(index).fill(silent),
        }),
        env,
      );
      const payload = JSON.parse(upstream.mock.calls[0][1]?.body as string);
      expect(payload.state.metricalAlignment).toEqual({
        quarterNoteBoundary: quarter,
        eighthNoteBoundary: eighth,
        sixteenthNoteBoundary: sixteenth,
        thirtySecondNoteBoundary: thirtySecond,
        sixtyFourthNoteBoundary: true,
      });
      expect(payload.state.numberedBeatOnset).toContain(
        quarter ? "EXACT onset" : "NONE",
      );
    },
  );
  it("preserves simultaneous model-selected kick, snare, cymbal, crash and aux", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({
        answers: {
          ...answers(),
          snare: { type: "choice", choice: "play" },
          cymbal: { type: "choice", choice: "play" },
          cymbal_voice: { type: "choice", choice: "open" },
          crash: { type: "choice", choice: "play" },
          aux: { type: "choice", choice: "play" },
        },
      }),
    );
    expect(await (await worker.fetch(request(valid), env)).json()).toEqual({
      step: {
        ...silent,
        kick: 104,
        snare: 104,
        open: 104,
        crash: 104,
        aux: 104,
      },
      inputTokens: null,
      intent,
      modelCalls: 1,
    });
  });
  it.each([429, 502, 503, 504, 529])(
    "exposes a resumable temporary failure for upstream %s",
    async (status) => {
      vi.stubGlobal("fetch", async () => new Response("temporary", { status }));
      const response = await worker.fetch(request(valid), env);
      expect(response.status).toBe(503);
      expect(response.headers.get("Retry-After")).toBe("2");
    },
  );
  it("lets TypeSafe choose intent before the first note and adds both usage reports", async () => {
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          answers: Object.fromEntries(
            Object.entries(intent).map(([key, choice]) => [
              key,
              { type: "choice", choice },
            ]),
          ),
          usage: { input_tokens: 100 },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ answers: answers(), usage: { input_tokens: 200 } }),
      );
    vi.stubGlobal("fetch", upstream);
    const response = await worker.fetch(
      request({ ...valid, intent: undefined }),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      step: { ...silent, kick: 104 },
      intent,
      inputTokens: 300,
      modelCalls: 2,
    });
    expect(upstream).toHaveBeenCalledTimes(2);
    const noteRequest = JSON.parse(upstream.mock.calls[1][1]?.body as string);
    expect(noteRequest.state.musicalIntent.foundation).toContain("backbeat");
  });
  it("rejects unknown intent and noninitial history without its model intent", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    expect(
      (
        await worker.fetch(
          request({ ...valid, intent: { ...intent, foundation: "banana" } }),
          env,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await worker.fetch(
          request({ ...valid, intent: undefined, history: [silent] }),
          env,
        )
      ).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("does not fabricate unreported token usage", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({ answers: answers(), usage: { input_tokens: -5 } }),
    );
    expect(await (await worker.fetch(request(valid), env)).json()).toEqual({
      step: { ...silent, kick: 104 },
      inputTokens: null,
      intent,
      modelCalls: 1,
    });
  });
  it("rejects partial or invented answers instead of silently replacing them", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({
        answers: { ...answers(), kick: { type: "choice", choice: "banana" } },
      }),
    );
    expect((await worker.fetch(request(valid), env)).status).toBe(502);
    vi.stubGlobal("fetch", async () => Response.json({ answers: {} }));
    expect((await worker.fetch(request(valid), env)).status).toBe(502);
  });
  it("keeps upstream errors and secrets out of browser responses", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response("test-secret", { status: 401 }),
    );
    const response = await worker.fetch(request(valid), env);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("test-secret");
  });
  it("does not infer after an already aborted request", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const controller = new AbortController();
    controller.abort();
    const aborted = new Request(request(valid), { signal: controller.signal });
    expect((await worker.fetch(aborted, env)).status).toBe(502);
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("parallel composer", () => {
  it("plans once without making a hidden first step", async () => {
    const upstream = vi.fn<typeof fetch>(async () =>
      Response.json({
        answers: Object.fromEntries(
          Object.entries(intent).map(([id, choice]) => [
            id,
            { type: "choice", choice },
          ]),
        ),
        usage: { input_tokens: 123 },
      }),
    );
    vi.stubGlobal("fetch", upstream);
    const response = await worker.fetch(
      request({ ...valid, intent: undefined, planOnly: true }),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      intent,
      inputTokens: 123,
      modelCalls: 1,
    });
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it("maps a batch by position, with timing inside each question and no fabricated history", async () => {
    const upstream = vi.fn<typeof fetch>(async () =>
      Response.json({
        answers: Object.fromEntries(
          [0, 1].flatMap((i) =>
            Object.entries(answers()).map(([key, value]) => [
              `${i}_${key}`,
              value,
            ]),
          ),
        ),
        usage: { input_tokens: 456 },
      }),
    );
    vi.stubGlobal("fetch", upstream);
    const response = await worker.fetch(
      request({ ...valid, batchStart: 12, batchSize: 2 }),
      env,
    );
    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      start: number;
      steps: unknown[];
    };
    expect(result.start).toBe(12);
    expect(result.steps).toEqual([
      { ...silent, kick: 104 },
      { ...silent, kick: 104 },
    ]);
    const payload = JSON.parse(upstream.mock.calls[0][1]!.body as string);
    expect(payload.state.previousDecisions).toBeUndefined();
    expect(payload.questions["0_kick"].instructions).toContain("bar 1, beat 4");
    expect(payload.questions["1_cymbal"].instructions).toContain(
      "subdivision 2/4",
    );
  });
  it.each([
    { batchStart: -1, batchSize: 4 },
    { batchStart: 0, batchSize: 9 },
    { batchStart: 63, batchSize: 2 },
    { batchStart: 0.5, batchSize: 4 },
    { batchStart: 0, batchSize: 4, intent: undefined },
    { batchStart: 0, batchSize: 4, history: [silent] },
    { planOnly: "yes" },
  ])("rejects invalid batch boundaries before inference: %j", async (extra) => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    expect(
      (await worker.fetch(request({ ...valid, ...extra }), env)).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
});
