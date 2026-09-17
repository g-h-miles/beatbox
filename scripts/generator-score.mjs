// Scores a deliberately explicit musical instruction; never changes generated notes.
import { readFileSync } from "node:fs";
export function scorePattern(history, resolution, style = "rock") {
  const expected = new Set(),
    actual = new Set();
  const perBeat = resolution / 4;
  for (let i = 0; i < history.length; i++) {
    const beat = (i % resolution) / perBeat;
    if (style === "rock") {
      if (beat === 0 || beat === 2) expected.add(`${i}:kick`);
      if (beat === 1 || beat === 3) expected.add(`${i}:snare`);
      if (Number.isInteger(beat * 2)) expected.add(`${i}:closed`);
    } else if (style === "one-drop") {
      if (beat === 2) {
        expected.add(`${i}:kick`);
        expected.add(`${i}:snare`);
      }
      if (Number.isInteger(beat * 2) && !Number.isInteger(beat))
        expected.add(`${i}:closed`);
    } else throw Error("Unknown reference style");
    for (const [drum, velocity] of Object.entries(history[i]))
      if (velocity > 0) actual.add(`${i}:${drum}`);
  }
  const correct = [...actual].filter((n) => expected.has(n)).length;
  const missing = [...expected].filter((n) => !actual.has(n));
  const extra = [...actual].filter((n) => !expected.has(n));
  return {
    expected: expected.size,
    actual: actual.size,
    correct,
    precision: correct / (actual.size || 1),
    recall: correct / (expected.size || 1),
    f1: (2 * correct) / (actual.size + expected.size || 1),
    missing,
    extra,
  };
}
if (process.argv[1]?.endsWith("generator-score.mjs")) {
  const data = JSON.parse(readFileSync(process.argv[2], "utf8"));
  console.log(
    JSON.stringify(
      scorePattern(
        data.history,
        data.resolution || 16,
        process.argv[3] || "rock",
      ),
      null,
      2,
    ),
  );
}
