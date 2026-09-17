import { mkdir, writeFile } from "node:fs/promises";
import { scorePattern } from "./generator-score.mjs";
const base = process.env.BEATBOX_URL || "http://127.0.0.1:8791";
const prompt =
  process.env.BEATBOX_PROMPT ||
  "Kick on beats 1 and 3, snare on beats 2 and 4, closed hi-hat on every eighth note. Repeat all bars. No fills or other instruments.";
const bars = 4,
  resolution = Number(process.env.BEATBOX_RESOLUTION || 64),
  bpm = 90;
const start = performance.now();
let calls = 0,
  tokens = 0;
async function call(extra) {
  const r = await fetch(base + "/api/generate-step", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: new URL(base).origin,
    },
    body: JSON.stringify({
      prompt,
      bars,
      resolution,
      bpm,
      history: [],
      ...extra,
    }),
  });
  const data = await r.json();
  if (!r.ok) throw Error(JSON.stringify(data));
  calls += data.modelCalls;
  tokens += data.inputTokens;
  return data;
}
const { intent } = await call({ planOnly: true });
const planMs = performance.now() - start;
const parts = await Promise.all(
  Array.from({ length: (bars * resolution) / 8 }, (_, i) =>
    call({ intent, batchStart: i * 8, batchSize: 8 }),
  ),
);
const history = parts.flatMap((p) => p.steps);
const result = {
  prompt,
  bars,
  resolution,
  bpm,
  intent,
  history,
  seconds: (performance.now() - start) / 1000,
  planMs,
  calls,
  tokens,
  score: scorePattern(history, resolution),
};
await mkdir("artifacts/generator", { recursive: true });
await writeFile(
  "artifacts/generator/parallel-" + resolution + ".json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify({ ...result, history: undefined }, null, 2));
