import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { wavClip, toBase64 } from "../src/wav";
const origin = process.argv[2];
if (!origin?.startsWith("https://")) throw Error("Pass preview origin");
const rows = JSON.parse(readFileSync("artifacts/dataset.json", "utf8"));
const map: Record<string, string> = {
    kd: "kick",
    sd: "snare",
    hhc: "closed",
    hho: "open",
  },
  results: any[] = [];
for (const person of [21, 22, 23, 24])
  for (const label of Object.keys(map)) {
    const r = rows.find(
      (r: any) =>
        r.participant === `Participant_${person}` &&
        r.mode === "Personal" &&
        r.file.includes("Improvisation") &&
        r.label === label,
    );
    if (!r) continue;
    const bytes = execFileSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        `artifacts/avp-full/AVP_Dataset/${r.mode}/${r.participant}/${r.file}`,
        "-f",
        "f32le",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-",
      ],
      { maxBuffer: 50000000 },
    );
    const samples = new Float32Array(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    const start = Math.max(0, Math.floor((r.time - 0.015) * 16000)),
      end = Math.min(
        samples.length,
        Math.floor((r.time + Math.min(r.duration + 0.025, 0.4)) * 16000),
      );
    const clip = samples.slice(start, end),
      peak = clip.reduce((m, v) => Math.max(m, Math.abs(v)), 0.00001);
    const repeated = new Float32Array(24000);
    for (let repeat = 0; repeat < 3; repeat++)
      for (let i = 0; i < clip.length; i++)
        repeated[repeat * 8000 + 800 + i] = (clip[i] / peak) * 0.8;
    const response = await fetch(origin + "/api/classify-audio", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        hits: [
          { id: "hit-0", audio: toBase64(wavClip(repeated, 16000, 0, 1.5)) },
        ],
      }),
    });
    const body = await response.json();
    if (!response.ok) throw Error(JSON.stringify(body));
    results.push({
      person,
      time: r.time,
      truth: map[label],
      ...body.answers[0],
    });
    console.log(
      person,
      map[label],
      body.answers[0].drum,
      body.answers[0].description,
    );
    writeFileSync(
      "artifacts/audio-probe.json",
      JSON.stringify(results, null, 2),
    );
  }
console.log(
  "score",
  results.filter((r) => r.truth === r.drum).length,
  results.length,
);
