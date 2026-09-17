import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { wavClip, toBase64 } from "../src/wav";
const origin = process.argv[2];
if (!origin?.startsWith("https://"))
  throw Error("Pass the candidate preview HTTPS origin.");
const rawRows = JSON.parse(readFileSync("artifacts/dataset.json", "utf8")) as {
  participant: string;
  file: string;
  mode: string;
  label: string;
  time: number;
  duration: number;
}[];
const rows = rawRows.filter((r) =>
  ["kd", "sd", "hhc", "hho"].includes(r.label),
);
const subset: typeof rows = [];
for (const file of [
  ...new Set(
    rows
      .filter(
        (r) =>
          Number(r.participant.split("_")[1]) >= 21 &&
          r.file.includes("Improvisation"),
      )
      .map((r) => r.file),
  ),
]) {
  const all = rows.filter((r) => r.file === file);
  for (let i = 0; i < 12; i++)
    subset.push(all[Math.floor((i * all.length) / 12)]);
}
const map: Record<string, string> = {
  kd: "kick",
  sd: "snare",
  hhc: "closed",
  hho: "open",
};
const cache = new Map<string, Float32Array>();
const answers: any[] = [];
for (let i = 0; i < subset.length; i += 8) {
  const batch = subset.slice(i, i + 8);
  const hits = batch.map((r, j) => {
    const path = `artifacts/avp-full/AVP_Dataset/${r.mode}/${r.participant}/${r.file}`;
    if (!cache.has(path)) {
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
      cache.set(
        path,
        new Float32Array(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
        ),
      );
    }
    return {
      id: `hit-${i + j}`,
      audio: toBase64(
        wavClip(
          cache.get(path)!,
          44100,
          Math.max(0, r.time - 0.015),
          r.time + Math.min(r.duration + 0.025, 1.45),
        ),
      ),
    };
  });
  const response = await fetch(origin + "/api/classify-audio", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ hits }),
  });
  const result = await response.json();
  if (!response.ok) throw Error(JSON.stringify(result));
  for (const a of result.answers) {
    const index = Number(a.id.slice(4));
    answers.push({ ...subset[index], ...a, truth: map[subset[index].label] });
  }
  writeFileSync(
    "artifacts/audio-model-evaluation.json",
    JSON.stringify(answers, null, 2),
  );
  console.log(`Evaluated ${answers.length}/${subset.length}`);
}
console.log(
  JSON.stringify(
    {
      count: answers.length,
      gemini: answers.filter((a) => a.drum === a.truth).length,
      typesafe: answers.filter((a) => a.reviewDrum === a.truth).length,
    },
    null,
    2,
  ),
);
