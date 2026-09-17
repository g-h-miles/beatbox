/** Export full detection outcomes, including misses and extra hits, for ML evaluation. */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { analyze } from "../src/audio";
const root = "artifacts/avp-full/AVP_Dataset";
const records = [];
for (const mode of ["Fixed", "Personal"]) {
  for (const participant of readdirSync(`${root}/${mode}`)
    .filter((p) => p.startsWith("Participant_"))
    .sort()) {
    const dir = `${root}/${mode}/${participant}`;
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith(".wav"))
      .sort()) {
      const path = `${dir}/${file}`;
      const bytes = execFileSync(
        "ffmpeg",
        [
          "-v",
          "error",
          "-i",
          path,
          "-f",
          "f32le",
          "-ar",
          "44100",
          "-ac",
          "1",
          "-",
        ],
        { maxBuffer: 50_000_000 },
      );
      const x = new Float32Array(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
      );
      const annotations = readFileSync(path.replace(".wav", ".csv"), "utf8")
        .trim()
        .split("\n")
        .map((line) => {
          const [time, label] = line.trim().split(/[,\t]/);
          return { time: Number(time), label };
        })
        .filter((a) => Number.isFinite(a.time));
      const hits = analyze(x, 44100, 50);
      records.push({
        path,
        mode,
        participant: Number(participant.split("_")[1]),
        file,
        duration: x.length / 44100,
        annotations,
        detections: hits.map((hit, i) => ({
          time: hit.time,
          duration: hit.duration,
          nextTime: hits[i + 1]?.time ?? x.length / 44100,
        })),
      });
    }
  }
}
writeFileSync("artifacts/events-v2.json", JSON.stringify(records));
console.log(`Exported ${records.length} complete recordings.`);
