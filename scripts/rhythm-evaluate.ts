import { readFileSync, writeFileSync } from "node:fs";
import { applyRhythm, estimateTempo, inferGrid } from "../src/rhythm";
import type { Hit, Drum } from "../src/model";
const source = process.argv[2];
if (!source) throw Error("Pass a labeled evaluation JSON containing hits.");
const input = JSON.parse(readFileSync(source, "utf8"));
const hits: Hit[] = input.hits.map((h: Hit) => ({ ...h, source: "typesafe" }));
for (let i = 0; i < hits.length; i += 24) {
  const response = await fetch("https://beatbox.grahammiles.me/api/classify", {
    method: "POST",
    headers: {
      Origin: "https://beatbox.grahammiles.me",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      hits: hits.slice(i, i + 24).map(({ id, features }) => ({ id, features })),
    }),
  });
  const data = (await response.json()) as {
    answers: {
      id: string;
      drum: Drum;
      confidence: number;
      probabilities: Record<Drum, number>;
    }[];
    error?: string;
  };
  if (!response.ok) throw Error(data.error ?? `HTTP ${response.status}`);
  for (const a of data.answers) {
    const h = hits.find((h) => h.id === a.id)!;
    Object.assign(h, {
      drum: a.drum,
      acousticDrum: a.drum,
      confidence: a.confidence,
      probabilities: a.probabilities,
    });
  }
  console.log(`Classified ${Math.min(i + 24, hits.length)}/${hits.length}`);
}
const tempo = estimateTempo(hits),
  grid = tempo ? inferGrid(hits, tempo.bpm, null) : null;
const assisted = applyRhythm(hits, grid, true);
const mapping: Record<string, Drum> = {
  kd: "kick",
  sd: "snare",
  hhc: "closed",
  hho: "open",
};
let baseline = 0,
  improved = 0,
  total = 0;
const changes = [];
for (let i = 0; i < hits.length; i++) {
  if (hits[i].time !== assisted[i].time) throw Error("Timing changed");
  const truth = mapping[input.hits[i].truth?.label];
  if (truth) {
    total++;
    baseline += Number(hits[i].drum === truth);
    improved += Number(assisted[i].drum === truth);
  }
  if (assisted[i].rhythmAdjusted)
    changes.push({
      time: hits[i].time,
      from: hits[i].drum,
      to: assisted[i].drum,
      truth,
    });
}
const result = {
  source,
  tempo,
  grid,
  total,
  baseline,
  assisted: improved,
  changes,
  hits,
};
writeFileSync(
  `artifacts/rhythm-${source.split("/").pop()}`,
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify({ ...result, hits: undefined }, null, 2));
