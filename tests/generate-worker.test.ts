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
const valid = { prompt: "syncopated reggae", bpm: 96, steps: 16, history: [] };
const request = (body: unknown, origin = "https://beatbox.example") =>
  new Request("https://beatbox.example/api/generate-step", {
    method: "POST",
    headers: { Origin: origin },
    body: JSON.stringify(body),
  });
const answers = () =>
  Object.fromEntries(
    drums.flatMap(({ id }) => [
      [id, { type: "choice", choice: id === "kick" ? "play" : "rest" }],
      [`${id}_velocity`, { type: "choice", choice: "strong" }],
    ]),
  );
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
    });
    expect(upstream).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(upstream.mock.calls[0][1]?.body as string);
    expect(payload.state.previousDecisions.split("\n")).toHaveLength(3);
    expect(payload.state.previousDecisions).toContain(
      "step 2, bar 1, beat 1, sixteenth 2 (count 1e): Kick velocity 104",
    );
    expect(payload.state.previousDecisions).toContain("Closed hat velocity 32");
    expect(payload.state.currentPosition).toBe(
      "step 4, bar 1, beat 1, sixteenth 4 (count 1a)",
    );
    expect(payload.state.prompt).toBe(valid.prompt);
    expect(Object.keys(payload.questions)).toEqual(
      drums.flatMap((d) => [d.id, `${d.id}_velocity`]),
    );
    for (const { id, name } of drums) {
      expect(payload.questions[id].instructions).toContain(name);
      expect(payload.questions[id].criteria.rest).toContain("silent");
      expect(payload.questions[`${id}_velocity`].instructions).toContain(
        "Assuming",
      );
      expect(
        Object.keys(payload.questions[`${id}_velocity`].criteria),
      ).toHaveLength(5);
    }
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("accepts 63 prior steps for a 64-step loop and rejects completed history", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ answers: answers() }));
    expect(
      (
        await worker.fetch(
          request({ ...valid, steps: 64, history: Array(63).fill(silent) }),
          env,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await worker.fetch(
          request({ ...valid, steps: 64, history: Array(64).fill(silent) }),
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
    { ...valid, steps: 17 },
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
      (await worker.fetch(request({ prompt: "x".repeat(17000) }), env)).status,
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
  it("does not fabricate unreported token usage", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({ answers: answers(), usage: { input_tokens: -5 } }),
    );
    expect(await (await worker.fetch(request(valid), env)).json()).toEqual({
      step: { ...silent, kick: 104 },
      inputTokens: null,
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
