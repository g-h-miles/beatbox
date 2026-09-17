import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../worker/research-audio-fewshot";
function wav() {
  const b = Buffer.alloc(48);
  b.write("RIFF");
  b.writeUInt32LE(40, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(4, 40);
  return b.toString("base64");
}
const payload = () => ({
  examples: Array.from({ length: 12 }, (_, i) => ({
    label: ["closed", "open", "kick", "snare"][i % 4],
    audio: wav(),
  })),
  hits: [{ id: "hit-1", audio: wav() }],
});
const request = (body: unknown) =>
  new Request("http://localhost/classify", {
    method: "POST",
    body: JSON.stringify(body),
  });
afterEach(() => vi.unstubAllGlobals());
describe("temporary few-shot endpoint", () => {
  it("reports configuration without returning the secret", async () => {
    const r = await worker.fetch(new Request("http://localhost/status"), {
      GEMINI_API_KEY: "test-secret",
    });
    expect(await r.json()).toEqual({ configured: true });
  });
  it("rejects invalid audio and duplicate target IDs before calling upstream", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const b = payload();
    b.hits[0].audio = "bad";
    expect(
      (await worker.fetch(request(b), { GEMINI_API_KEY: "test" })).status,
    ).toBe(400);
    const d = payload();
    d.hits.push(d.hits[0]);
    expect(
      (await worker.fetch(request(d), { GEMINI_API_KEY: "test" })).status,
    ).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("returns validated predictions and rejects an invented target ID", async () => {
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
                      answers: [{ id: "hit-1", drum: "kick" }],
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
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      answers: [{ id: "hit-2", drum: "kick" }],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetch);
    expect(
      await (
        await worker.fetch(request(payload()), { GEMINI_API_KEY: "test" })
      ).json(),
    ).toEqual({
      answers: [{ id: "hit-1", drum: "kick" }],
      model: "gemini-3.1-pro-preview",
    });
    expect(
      (await worker.fetch(request(payload()), { GEMINI_API_KEY: "test" }))
        .status,
    ).toBe(502);
  });
  it("does not echo upstream errors or secrets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("test-secret", { status: 403 })),
    );
    const r = await worker.fetch(request(payload()), {
      GEMINI_API_KEY: "test-secret",
    });
    expect(await r.json()).toEqual({
      error: "Upstream request failed",
      status: 403,
    });
  });
});
