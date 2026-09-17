// Inspect musical structure in saved real model outputs, without changing notes.
import { readFileSync } from "node:fs";
const data = JSON.parse(readFileSync(process.argv[2], "utf8"));
const resolution = data.resolution || 16,
  history = data.history;
const lanes = ["kick", "snare", "closed", "open", "ride", "crash", "aux"];
const bars = Math.ceil(history.length / resolution),
  perBeat = resolution / 4;
const counts = Object.fromEntries(
  lanes.map((d) => [d, history.filter((s) => s[d] > 0).length]),
);
let backbeats = 0,
  possibleBackbeats = 0;
for (let i = 0; i < history.length; i++)
  if (i % resolution === perBeat || i % resolution === perBeat * 3) {
    possibleBackbeats++;
    if (history[i].snare > 0) backbeats++;
  }
console.log(
  JSON.stringify(
    {
      prompt: data.prompt,
      bars,
      resolution,
      seconds: (bars * 240) / data.bpm,
      counts,
      restSteps: history.filter((s) => lanes.every((d) => !s[d])).length,
      snareBackbeats: `${backbeats}/${possibleBackbeats}`,
    },
    null,
    2,
  ),
);
for (let bar = 0; bar < bars; bar++) {
  console.log(`\nBar ${bar + 1}`);
  for (const lane of lanes) {
    const row = history
      .slice(bar * resolution, (bar + 1) * resolution)
      .map((s) => (s[lane] >= 104 ? "X" : s[lane] > 0 ? "x" : "."));
    console.log(
      lane.padEnd(7),
      row.map((s, i) => (i && i % perBeat === 0 ? " | " : "") + s).join(""),
    );
  }
}
