import { criteria, type Features } from "../src/model";
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
        if (size > 48000) {
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
      const body = JSON.parse(new TextDecoder().decode(bytes));
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
      const hits: { id: string; features: Features }[] = body.hits.map(
        (h: unknown) => {
          if (!h || typeof h !== "object") throw Error("input");
          const v = h as { id: unknown; features: Record<string, unknown> };
          if (
            typeof v.id !== "string" ||
            !/^hit-\d+$/.test(v.id) ||
            !v.features
          )
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
          return { id: v.id, features };
        },
      );
      if (new Set(hits.map((h) => h.id)).size !== hits.length)
        return json({ error: "Duplicate IDs" }, 400);
      const questions = Object.fromEntries(
        hits.map((h, i) => [
          h.id,
          {
            type: "choice",
            instructions: `Choose the most likely intended drum for hits[${i}] from its acoustic measurements. These are vocal percussion features, not audio. Duration and attack are seconds; centroid is Hz; low (<350 Hz), mid (350–3500 Hz), high (>3500 Hz) are energy fractions. Flatness measures noise vs tonality. Consider ambiguity; use aux if no clear drum match. Do not infer timing or use musical position.`,
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
            state: { hits },
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
          !(a.choice in criteria) ||
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
