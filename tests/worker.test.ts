import { describe, it, expect, vi, afterEach } from "vitest";
import worker, { type AppEnv } from "../worker";
const f = {
  duration: 0.1,
  centroid: 100,
  low: 0.8,
  mid: 0.15,
  high: 0.05,
  flatness: 0.01,
  zcr: 0.01,
  attack: 0.005,
  rms: 0.5,
};
const env = {
  TYPESAFE_API_KEY: "test-key",
  CLASSIFY_LIMITER: { limit: async () => ({ success: true }) },
  ASSETS: {
    fetch: async () => new Response("asset"),
    connect: () => {
      throw Error("unused");
    },
  },
} as AppEnv;
const request = (body: unknown, origin = "https://beatbox.example") =>
  new Request("https://beatbox.example/api/classify", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
afterEach(() => vi.unstubAllGlobals());
describe("classification boundary", () => {
  it("does not expose a configured key", async () => {
    const r = await worker.fetch(
      new Request("https://beatbox.example/api/status"),
      env,
    );
    expect(await r.json()).toEqual({ configured: true });
  });
  it("reports missing key without inference", async () => {
    expect(
      (await worker.fetch(request({}), { ...env, TYPESAFE_API_KEY: undefined }))
        .status,
    ).toBe(503);
  });
  it("rejects other origins", async () => {
    expect(
      (await worker.fetch(request({}, "https://other.example"), env)).status,
    ).toBe(403);
  });
  it("rejects oversized batches and invalid features", async () => {
    expect(
      (
        await worker.fetch(
          request({ hits: Array(25).fill({ id: "hit-1", features: f }) }),
          env,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await worker.fetch(
          request({ hits: [{ id: "hit-1", features: { ...f, low: "bad" } }] }),
          env,
        )
      ).status,
    ).toBe(400);
  });
  it("sends the documented Jev contract and parses typed answers", async () => {
    const upstream = vi.fn(async () =>
      Response.json({
        answers: {
          "hit-1": {
            type: "choice",
            choice: "kick",
            confidence: 0.7,
            probabilities: { kick: 0.9, aux: 0.1 },
          },
        },
      }),
    );
    vi.stubGlobal("fetch", upstream);
    const r = await worker.fetch(
      request({ hits: [{ id: "hit-1", features: f }] }),
      env,
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({
      answers: [{ id: "hit-1", drum: "kick", confidence: 0.7 }],
    });
    const [, init] = upstream.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("jev-latest");
    expect(body.questions["hit-1"].type).toBe("choice");
    expect(Object.keys(body.questions["hit-1"].criteria)).toHaveLength(7);
    expect(body.state).toEqual({ hits: [{ id: "hit-1", features: f }] });
  });
  it("rejects invented answer labels", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({
        answers: {
          "hit-1": { type: "choice", choice: "banana", confidence: 0.9 },
        },
      }),
    );
    expect(
      (
        await worker.fetch(
          request({ hits: [{ id: "hit-1", features: f }] }),
          env,
        )
      ).status,
    ).toBe(502);
  });
  it("enforces rate limits before upstream", async () => {
    const limited = {
      ...env,
      CLASSIFY_LIMITER: { limit: async () => ({ success: false }) },
    } as AppEnv;
    expect((await worker.fetch(request({}), limited)).status).toBe(429);
  });
});
