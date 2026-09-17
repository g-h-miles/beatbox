import { mkdir, writeFile } from "node:fs/promises";
import { barMidi } from "../src/bar-groove";
const base = process.env.BEATBOX_URL || "http://127.0.0.1:8791";
await mkdir("artifacts/one-bar", { recursive: true });
for (const [name, prompt] of Object.entries({
  pocket:
    "A laid-back pocket. Firm kick, snare on 2 and 4, quiet eighth-note hats.",
  reggae:
    "Roots reggae one drop. A steady eighth-note hi-hat pulse with offbeat accents. No fills.",
  unsupported:
    "Seven beats in a bar, 7/8, with a different drum fill every third bar.",
})) {
  const start = performance.now();
  const r = await fetch(base + "/api/generate-step", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: new URL(base).origin,
    },
    body: JSON.stringify({
      prompt,
      bpm: 90,
      bars: 1,
      resolution: 16,
      history: [],
      oneBar: true,
    }),
  });
  const data = (await r.json()) as any;
  const result = {
    status: r.status,
    ms: Math.round(performance.now() - start),
    prompt,
    ...data,
  };
  await writeFile(
    `artifacts/one-bar/${name}.json`,
    JSON.stringify(result, null, 2),
  );
  if (data.groove)
    await writeFile(`artifacts/one-bar/${name}.mid`, barMidi(data.groove, 90));
  console.log(
    JSON.stringify({
      ...result,
      groove: data.groove
        ? {
            foundation: data.groove.foundation,
            top: data.groove.top,
            feel: data.groove.feel,
          }
        : undefined,
    }),
  );
  if (!r.ok || (name === "unsupported" ? !data.unsupported : !data.groove))
    process.exitCode = 1;
}
