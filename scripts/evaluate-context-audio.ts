import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { wavClip, toBase64 } from "../src/wav";
const origin = process.argv[2];
if (!origin?.startsWith("https://")) throw Error("Pass the preview origin");
const mapping: Record<string, string> = {
  kd: "kick",
  sd: "snare",
  hhc: "closed",
  hho: "open",
};
const rows = JSON.parse(readFileSync("artifacts/dataset.json", "utf8")).filter(
  (r: any) =>
    mapping[r.label] &&
    Number(r.participant.split("_")[1]) >= 21 &&
    r.file.includes("Improvisation"),
);
const results: any[] = [];
for (const file of [...new Set<string>(rows.map((r: any) => r.file))]) {
  const all = rows.filter((r: any) => r.file === file),
    selected = Array.from(
      { length: 12 },
      (_, i) => all[Math.floor((i * all.length) / 12)],
    ),
    r = all[0];
  const bytes = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      `artifacts/avp-full/AVP_Dataset/${r.mode}/${r.participant}/${file}`,
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
  const samples = new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const response = await fetch(origin + "/api/classify-audio", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      contextAudio: toBase64(
        wavClip(samples, 44100, 0, samples.length / 44100, 90),
      ),
      hits: selected.map((s: any, i: number) => ({
        id: `hit-${i}`,
        time: s.time,
      })),
    }),
  });
  const body = await response.json();
  if (!response.ok) throw Error(JSON.stringify(body));
  for (const a of body.answers) {
    const s = selected[Number(a.id.slice(4))];
    results.push({ file, time: s.time, truth: mapping[s.label], ...a });
  }
  writeFileSync(
    "artifacts/context-audio-evaluation.json",
    JSON.stringify(results, null, 2),
  );
  console.log(
    file,
    results.filter((a) => a.drum === a.truth).length,
    results.length,
  );
}
console.log({
  total: results.length,
  gemini: results.filter((a) => a.drum === a.truth).length,
  typesafe: results.filter((a) => a.reviewDrum === a.truth).length,
});
