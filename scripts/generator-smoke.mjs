// Real sequential API smoke test. No musical decisions are made in this script.
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.BEATBOX_URL || "http://127.0.0.1:8791";
const steps = Number(process.env.BEATBOX_STEPS || 16);
const prompt = process.env.BEATBOX_PROMPT || "Syncopated reggae";
const bpm = 90;
const history = [];
let inputTokens = 0,
  usageComplete = true;
const started = Date.now();
for (let i = 0; i < steps; i++) {
  const response = await fetch(`${base}/api/generate-step`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: new URL(base).origin,
    },
    body: JSON.stringify({ prompt, bpm, steps, history }),
    signal: AbortSignal.timeout(45000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      `Step ${i + 1}: ${response.status} ${JSON.stringify(result)}`,
    );
  history.push(result.step);
  if (typeof result.inputTokens === "number") inputTokens += result.inputTokens;
  else usageComplete = false;
  console.log(
    `${i + 1}: ${
      Object.entries(result.step)
        .filter(([, velocity]) => velocity > 0)
        .map(([drum, velocity]) => `${drum}:${velocity}`)
        .join(" ") || "rest"
    }`,
  );
}
const output = {
  prompt,
  bpm,
  steps,
  history,
  inputTokens,
  usageComplete,
  seconds: (Date.now() - started) / 1000,
};
await mkdir("artifacts/generator", { recursive: true });
await writeFile(
  `artifacts/generator/live-${steps}.json`,
  JSON.stringify(output, null, 2),
);
console.log(
  JSON.stringify(
    { requests: steps, inputTokens, usageComplete, seconds: output.seconds },
    null,
    2,
  ),
);
