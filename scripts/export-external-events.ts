/** Preserve both independent annotators; never select labels using predictions. */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { analyze } from "../src/audio";
const root = "artifacts/beatboxset1";
const records = [];
for (const file of readdirSync(root)
  .filter((f) => f.endsWith(".wav"))
  .sort()) {
  const path = `${root}/${file}`;
  const bytes = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-f", "f32le", "-ar", "44100", "-ac", "1", "-"],
    { maxBuffer: 50_000_000 },
  );
  const x = new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const hits = analyze(x, 44100, 50);
  const annotations = Object.fromEntries(
    ["DR", "HT"].map((annotator) => [
      annotator,
      readFileSync(
        `${root}/Annotations_${annotator}/${file.replace(".wav", ".csv")}`,
        "utf8",
      )
        .trim()
        .split(/\r?\n/)
        .map((line) => {
          const [time, label] = line.trim().split(/[,\t]/);
          return { time: Number(time), label };
        })
        .filter((a) => Number.isFinite(a.time)),
    ]),
  );
  records.push({
    file,
    path,
    annotations,
    duration: x.length / 44100,
    detections: hits.map((hit, i) => ({
      time: hit.time,
      duration: hit.duration,
      nextTime: hits[i + 1]?.time ?? x.length / 44100,
    })),
  });
}
writeFileSync("artifacts/external-events-v2.json", JSON.stringify(records));
console.log(
  `Exported ${records.length} external recordings with both independent annotation sets.`,
);
