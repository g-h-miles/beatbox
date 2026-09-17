import { afterEach, expect, it, vi } from "vitest";
import { wavClip, toBase64 } from "../src/wav";
import { classifyAudio } from "../worker/audio";
import type { AudioEnv } from "../worker/audio";
const env = {
  GEMINI_API_KEY: "private-test-key",
  TYPESAFE_API_KEY: "other-private-key",
  CLASSIFY_LIMITER: { limit: async () => ({ success: true }) },
} as AudioEnv;
const audio = toBase64(
  wavClip(new Float32Array(1600).fill(0.25), 16000, 0, 0.1),
);
const request = (hits: unknown, origin = "https://beatbox.example") =>
  new Request("https://beatbox.example/api/classify-audio", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ hits }),
  });
afterEach(() => vi.unstubAllGlobals());
it("encodes bounded canonical WAV, including leading silence", () => {
  const samples = new Float32Array(3200);
  samples.fill(0.5, 1600);
  const wav = wavClip(samples, 16000, 0, 0.2),
    v = new DataView(wav.buffer);
  expect(wav.length).toBe(6444);
  expect(v.getUint32(24, true)).toBe(16000);
  expect(v.getInt16(44 + 1000 * 2, true)).toBe(0);
  expect(v.getInt16(44 + 2000 * 2, true)).toBe(16384);
  expect(wavClip(samples, 16000, 0, 10).length).toBe(48044);
});
it("requires both secrets and same origin without disclosing keys", async () => {
  expect(
    (await classifyAudio(request([]), { ...env, GEMINI_API_KEY: undefined }))
      .status,
  ).toBe(503);
  expect(
    (await classifyAudio(request([]), "bad" as unknown as AudioEnv)).status,
  ).toBe(503);
  expect(
    (await classifyAudio(request([], "https://elsewhere.example"), env)).status,
  ).toBe(403);
});
it("rejects arbitrary bytes, duplicates, and oversized batches before any model call", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  for (const hits of [
    [{ id: "hit-0", audio: "AAAA" }],
    [
      { id: "hit-0", audio },
      { id: "hit-0", audio },
    ],
    Array.from({ length: 9 }, (_, i) => ({ id: `hit-${i}`, audio })),
  ]) {
    expect((await classifyAudio(request(hits), env)).status).toBe(400);
  }
  expect(fetch).not.toHaveBeenCalled();
});
it("keeps audio-model and TypeSafe judgments separate for paired evaluation", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    answers: [
                      {
                        id: "hit-0",
                        drum: "kick",
                        description:
                          "A short voiced boot syllable with a lip plosive.",
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        answers: { "hit-0": { choice: "snare", confidence: 0.6 } },
      }),
    );
  vi.stubGlobal("fetch", fetch);
  const response = await classifyAudio(request([{ id: "hit-0", audio }]), env);
  expect(response.status).toBe(200);
  const result = (await response.json()) as {
    answers: { id: string; drum: string; reviewDrum: string }[];
  };
  expect(result.answers[0]).toMatchObject({
    id: "hit-0",
    drum: "kick",
    reviewDrum: "snare",
  });
  expect(JSON.stringify(result)).not.toContain("private-key");
  const sent = JSON.parse(fetch.mock.calls[0][1].body);
  expect(sent.contents[0].parts[2].inline_data.mime_type).toBe("audio/wav");
  expect(fetch.mock.calls[0][1].headers["x-goog-api-key"]).toBe(
    "private-test-key",
  );
});
it("rejects missing or invented model IDs rather than moving labels between hits", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    answers: [
                      {
                        id: "hit-99",
                        drum: "kick",
                        description: "A plosive.",
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    ),
  );
  expect(
    (await classifyAudio(request([{ id: "hit-0", audio }]), env)).status,
  ).toBe(502);
});
