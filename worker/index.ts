import { criteria, type Features } from "../src/model";
import { acousticEvidence } from "../src/acoustic";
import { describe, spectralDistance } from "../src/evidence";
export type AppEnv = Env & { TYPESAFE_API_KEY?: string };
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export default {
  async fetch(request: Request, env: AppEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/status")
      return json({ configured: !!env.TYPESAFE_API_KEY });
    if (url.pathname !== "/api/classify")
      return url.pathname.startsWith("/api/")
        ? json({ error: "Not found" }, 404)
        : env.ASSETS.fetch(request);
    if (request.method !== "POST") return json({ error: "Use POST" }, 405);
    if (request.headers.get("Origin") !== url.origin)
      return json({ error: "Use the app to classify hits." }, 403);
    if (!env.TYPESAFE_API_KEY)
      return json(
        {
          error:
            "TypeSafe is not connected yet. Local suggestions remain editable.",
        },
        503,
      );
    const limit = await env.CLASSIFY_LIMITER.limit({
      key: request.headers.get("CF-Connecting-IP") || "local",
    });
    if (!limit.success)
      return json(
        { error: "Take a breather. Try TypeSafe again in a minute." },
        429,
      );
    try {
      const reader = request.body?.getReader();
      if (!reader) return json({ error: "Missing body" }, 400);
      let size = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 96000) {
          await reader.cancel();
          return json({ error: "Request too large" }, 413);
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      let body;
      try {
        body = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        throw Error("input");
      }
      if (!body || typeof body !== "object") throw Error("input");
      if (
        !Array.isArray(body.hits) ||
        body.hits.length < 1 ||
        body.hits.length > 24
      )
        return json({ error: "Send between 1 and 24 hits" }, 400);
      const names = [
        "duration",
        "centroid",
        "low",
        "mid",
        "high",
        "flatness",
        "zcr",
        "attack",
        "rms",
      ] as const;
      const parseHit = (h: unknown) => {
        if (!h || typeof h !== "object") throw Error("input");
        const v = h as { id: unknown; features: Record<string, unknown> };
        if (typeof v.id !== "string" || !/^hit-\d+$/.test(v.id) || !v.features)
          throw Error("input");
        const features = {} as Features;
        for (const k of names) {
          const f = v.features[k];
          if (
            typeof f !== "number" ||
            !Number.isFinite(f) ||
            f < 0 ||
            f > 100000
          )
            throw Error("input");
          features[k] = f;
        }
        if (v.features.spectrum !== undefined) {
          const values = v.features.spectrum;
          if (
            !Array.isArray(values) ||
            values.length !== 20 ||
            values.some(
              (n) =>
                typeof n !== "number" ||
                !Number.isFinite(n) ||
                n < -10 ||
                n > 5,
            )
          )
            throw Error("input");
          features.spectrum = values;
        }
        if (v.features.acoustic !== undefined) {
          const values = v.features.acoustic;
          if (
            !Array.isArray(values) ||
            values.length !== 80 ||
            values.some(
              (n) =>
                typeof n !== "number" ||
                !Number.isFinite(n) ||
                n < -10 ||
                n > 5,
            )
          )
            throw Error("input");
          features.acoustic = values;
        }
        return { id: v.id, features };
      };
      const hits: { id: string; features: Features }[] =
        body.hits.map(parseHit);
      if (
        body.examples !== undefined &&
        (!Array.isArray(body.examples) || body.examples.length > 21)
      )
        throw Error("input");
      const examples: { drum: string; features: Features }[] = (
        body.examples || []
      ).map((e: { drum: string; features: unknown }, i: number) => {
        if (
          !e ||
          typeof e.drum !== "string" ||
          !Object.hasOwn(criteria, e.drum)
        )
          throw Error("input");
        return {
          drum: e.drum,
          features: parseHit({ id: `hit-${i}`, features: e.features }).features,
        };
      });
      const personalEvidence = (f: Features) => {
        const ranked = examples
          .map((e) => ({ ...e, distance: spectralDistance(f, e.features) }))
          .filter((e) => Number.isFinite(e.distance))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 3);
        return ranked.length
          ? ` This performer has manually labeled reference sounds in this recording. Closest personal matches: ${ranked.map((e) => `${e.drum} at spectral distance ${e.distance.toFixed(2)}`).join(", ")}. A distance below 0.6 is a close match. Prefer strong personal evidence over generic drum timbre rules; people's kicks may be bright. Distant examples are weak evidence.`
          : "";
      };
      if (new Set(hits.map((h) => h.id)).size !== hits.length)
        return json({ error: "Duplicate IDs" }, 400);
      const questions = Object.fromEntries(
        hits.map((h, i) => [
          h.id,
          {
            type: "choice",
            instructions: `Classify this ONE vocal-percussion sound: ${describe(h.features)}${body.mode === "syllables" ? "" : acousticEvidence(h.features)}${personalEvidence(h.features)} Which intended drum best matches these observations? A brief high-frequency hiss is a closed hi-hat. A bass-heavy b/boot/plosive is a kick. A midrange k/cat/pf burst is a snare. A long high-frequency hiss is an open hat. Do not mistake all noise for snare, or all sustained vowels for cymbals. Use aux if no drum fits. Do not infer rhythm or timing.`,
            criteria,
          },
        ]),
      );
      let response: Response | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        response = await fetch("https://api.typesafe.ai/v1/systemone", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.TYPESAFE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "jev-latest",
            state:
              "Monophonic human beatboxing, possibly spoken boots/cats syllables. Each question supplies independent measured acoustic evidence about one sound. There is no raw audio and no transcription. Classify only the described sound in the question.",
            questions,
          }),
          signal: AbortSignal.timeout(25000),
        });
        if (![429, 529].includes(response.status) || attempt === 2) break;
        await response.body?.cancel();
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
      if (!response?.ok)
        return json(
          {
            error: `TypeSafe could not classify this batch (${response?.status ?? "timeout"}). Your local hits are unchanged.`,
          },
          502,
        );
      const result = (await response.json()) as {
        answers: Record<
          string,
          {
            type: string;
            choice: string;
            confidence: number;
            probabilities: Record<string, number>;
          }
        >;
      };
      const answers = hits.map((h) => {
        const a = result.answers?.[h.id];
        if (
          !a ||
          a.type !== "choice" ||
          !Object.hasOwn(criteria, a.choice) ||
          !Number.isFinite(a.confidence) ||
          a.confidence < 0 ||
          a.confidence > 1
        )
          throw Error("upstream");
        return {
          id: h.id,
          drum: a.choice,
          confidence: a.confidence,
          probabilities: a.probabilities,
        };
      });
      return json({ answers });
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error && error.message === "input"
              ? "Invalid acoustic features."
              : "Classification failed. Your local hits are still available.",
        },
        error instanceof Error && error.message === "input" ? 400 : 502,
      );
    }
  },
};
