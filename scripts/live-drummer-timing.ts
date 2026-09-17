import { mkdir, writeFile } from "node:fs/promises";
import { LiveDrummer } from "../src/live-drummer";
import { drums } from "../src/model";
const api = process.env.BEATBOX_URL || "http://127.0.0.1:8791";
const origin = performance.now();
const now = () => (performance.now() - origin) / 1000;
const calls: unknown[] = [],
  clicks: number[] = [],
  hits: { time: number; step: unknown }[] = [],
  statuses: string[] = [];
const resolution = Number(process.env.BEATBOX_RESOLUTION || 64);
const fetcher: typeof fetch = async (_, init) => {
  const started = now();
  const body = JSON.parse(init!.body as string);
  const response = await fetch(api + "/api/generate-step", {
    ...init,
    headers: { ...init?.headers, Origin: new URL(api).origin },
  });
  calls.push({
    started,
    seconds: now() - started,
    status: response.status,
    body,
  });
  return response;
};
const engine = new LiveDrummer(
  {
    prompt:
      "Kick on beats 1 and 3, snare on beats 2 and 4, closed hi-hat on every eighth note. No fills or other instruments.",
    bpm: 90,
    bars: 4,
    resolution,
  },
  {
    now,
    click: (t) => clicks.push(t),
    hit: (time, step) => hits.push({ time, step }),
    position: () => {},
    decisions: () => {},
    direction: () => {},
    usage: () => {},
    status: (s) => statuses.push(s),
  },
  fetcher,
);
engine.start();
await new Promise((r) => setTimeout(r, 11000));
engine.stop();
const sounding = hits.filter((h) =>
  drums.some((d) => (h.step as Record<string, number>)[d.id] > 0),
);
const result = {
  resolution,
  firstClick: clicks[0],
  firstDrum: sounding[0]?.time,
  clicks,
  hits,
  statuses,
  calls,
};
await mkdir("artifacts/live-drummer", { recursive: true });
await writeFile(
  `artifacts/live-drummer/timing-${resolution}.json`,
  JSON.stringify(result, null, 2),
);
console.log(
  JSON.stringify(
    {
      ...result,
      clicks: clicks.length,
      hits: hits.length,
      calls: calls.length,
    },
    null,
    2,
  ),
);
if (!sounding.length || statuses.some((s) => s.includes("late positions")))
  process.exitCode = 1;
