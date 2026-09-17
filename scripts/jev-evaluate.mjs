import { readFileSync, writeFileSync } from "node:fs";
const result = JSON.parse(readFileSync("artifacts/evaluation.json", "utf8"));
const mapping = { kd: "kick", sd: "snare", hhc: "closed", hho: "open" };
for (let i = 0; i < result.hits.length; i += 24) {
  const response = await fetch("https://beatbox.grahammiles.me/api/classify", {
    method: "POST",
    headers: {
      Origin: "https://beatbox.grahammiles.me",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      hits: result.hits
        .slice(i, i + 24)
        .map(({ id, features }) => ({ id, features })),
    }),
  });
  const data = await response.json();
  if (!response.ok) throw Error(JSON.stringify(data));
  for (const a of data.answers) {
    const h = result.hits.find((h) => h.id === a.id);
    h.jev = a.drum;
    h.confidence = a.confidence;
  }
  console.log("Classified", i + data.answers.length);
}
const matched = result.hits.filter((h) => h.truth),
  correct = matched.filter((h) => h.jev === mapping[h.truth.label]).length;
result.classification = {
  correct,
  total: matched.length,
  accuracy: correct / matched.length,
};
writeFileSync("artifacts/jev-evaluation.json", JSON.stringify(result, null, 2));
console.log(result.classification);
console.log(
  matched.map((h) => [
    h.time.toFixed(2),
    mapping[h.truth.label],
    h.jev,
    h.confidence,
  ]),
);
