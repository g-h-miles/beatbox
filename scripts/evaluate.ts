import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { analyze } from "../src/audio";
const file = process.argv[2];
const b = execFileSync(
  "ffmpeg",
  ["-v", "error", "-i", file, "-f", "f32le", "-ar", "44100", "-ac", "1", "-"],
  { maxBuffer: 50_000_000 },
);
const x = new Float32Array(
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
);
const hits = analyze(
  x,
  44100,
  Number(process.argv[3] || 50),
  (process.argv[4] as "hits" | "syllables") || "hits",
);
const annotations = readFileSync(file.replace(".wav", ".csv"), "utf8")
  .trim()
  .split("\n")
  .map((l) => {
    const [time, label] = l.trim().split(/[,\t]/);
    return { time: Number(time), label };
  });
const used = new Set<number>();
const matched = hits.map((h) => {
  let index = -1,
    best = 0.05;
  for (let i = 0; i < annotations.length; i++) {
    const d = Math.abs(annotations[i].time - h.time);
    if (d < best && !used.has(i)) {
      best = d;
      index = i;
    }
  }
  if (index >= 0) used.add(index);
  return {
    ...h,
    truth: index >= 0 ? annotations[index] : null,
    error: index >= 0 ? h.time - annotations[index].time : null,
  };
});
const result = {
  file,
  detected: hits.length,
  annotated: annotations.length,
  matched: used.size,
  precision: used.size / hits.length,
  recall: used.size / annotations.length,
  meanAbsoluteErrorMs:
    (matched
      .filter((h) => h.error !== null)
      .reduce((s, h) => s + Math.abs(h.error!), 0) /
      used.size) *
    1000,
  hits: matched,
};
writeFileSync("artifacts/evaluation.json", JSON.stringify(result, null, 2));
console.log(
  JSON.stringify(
    {
      ...result,
      hits: matched.map((h) => ({
        t: +h.time.toFixed(3),
        local: h.drum,
        truth: h.truth?.label,
        errorMs: h.error === null ? null : Math.round(h.error * 1000),
      })),
    },
    null,
    2,
  ),
);
