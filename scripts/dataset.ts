import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { analyze } from "../src/audio";
const root = "artifacts/avp-full/AVP_Dataset";
const rows: any[] = [];
for (const mode of ["Fixed", "Personal"])
  for (const participant of readdirSync(`${root}/${mode}`).filter((p) =>
    p.startsWith("Participant_"),
  )) {
    const dir = `${root}/${mode}/${participant}`;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".wav"))) {
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
        { maxBuffer: 50000000 },
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
        .map((l) => {
          const [t, label] = l.trim().split(/[,\t]/);
          return { time: Number(t), label };
        });
      const used = new Set();
      for (const hit of analyze(x, 44100, 50)) {
        let best = 0.05,
          index = -1;
        annotations.forEach((a, i) => {
          const d = Math.abs(a.time - hit.time);
          if (d < best && !used.has(i)) {
            best = d;
            index = i;
          }
        });
        if (index < 0) continue;
        used.add(index);
        rows.push({
          participant,
          mode,
          file,
          time: hit.time,
          duration: hit.duration,
          label: annotations[index].label,
          features: hit.features,
        });
      }
    }
    console.log(mode, participant, rows.length);
  }
writeFileSync("artifacts/dataset.json", JSON.stringify(rows));
