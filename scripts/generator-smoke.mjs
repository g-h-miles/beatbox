// Real sequential API test. All musical choices come from TypeSafe.
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.BEATBOX_URL || "http://127.0.0.1:8791";
const bars = Number(process.env.BEATBOX_BARS || 8);
const resolution = Number(process.env.BEATBOX_RESOLUTION || 16);
const steps = bars * resolution;
const prompt = process.env.BEATBOX_PROMPT || "Syncopated reggae";
const bpm = 90,
  history = [];
let intent,
  inputTokens = 0,
  usageComplete = true,
  modelCalls = 0,
  attempts = 0;
const started = Date.now();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const out = `artifacts/generator/live-${bars}bars-${resolution}.json`;
await mkdir("artifacts/generator", { recursive: true });
async function save() {
  await writeFile(
    out,
    JSON.stringify(
      {
        prompt,
        bpm,
        bars,
        resolution,
        steps,
        history,
        intent,
        inputTokens,
        usageComplete,
        modelCalls,
        attempts,
        seconds: (Date.now() - started) / 1000,
      },
      null,
      2,
    ),
  );
}
for (let i = 0; i < steps; i++) {
  let result;
  for (let retry = 0; retry <= 5; retry++) {
    const requestStarted = Date.now();
    attempts++;
    const response = await fetch(`${base}/api/generate-step`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: new URL(base).origin,
      },
      body: JSON.stringify({ prompt, bpm, bars, resolution, history, intent }),
      signal: AbortSignal.timeout(60000),
    });
    result = await response.json();
    await pause(
      Math.max(
        0,
        Number(process.env.BEATBOX_PACE_MS || 600) -
          (Date.now() - requestStarted),
      ),
    );
    if (response.ok) break;
    if (
      ![429, 502, 503, 504].includes(response.status) ||
      result.retryable === false ||
      retry === 5
    ) {
      await save();
      throw Error(
        `Position ${i + 1}: ${response.status} ${JSON.stringify(result)}`,
      );
    }
    const retryAfter = Number(response.headers.get("Retry-After"));
    console.log(`Retry position ${i + 1} after HTTP ${response.status}`);
    await pause(
      Math.max(
        Number.isFinite(retryAfter) ? retryAfter * 1000 : 0,
        2000 * 2 ** retry,
      ),
    );
  }
  history.push(result.step);
  intent = result.intent;
  modelCalls += result.modelCalls || 1;
  if (typeof result.inputTokens === "number") inputTokens += result.inputTokens;
  else usageComplete = false;
  console.log(
    `${i + 1}: ${
      Object.entries(result.step)
        .filter(([, v]) => v > 0)
        .map(([d, v]) => `${d}:${v}`)
        .join(" ") || "rest"
    }`,
  );
  await save();
}
console.log(
  JSON.stringify(
    {
      steps,
      bars,
      resolution,
      intent,
      inputTokens,
      usageComplete,
      modelCalls,
      attempts,
      seconds: (Date.now() - started) / 1000,
    },
    null,
    2,
  ),
);
