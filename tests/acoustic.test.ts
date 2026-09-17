import { expect, it } from "vitest";
import { acousticProbabilities } from "../src/acoustic";
import fixtures from "./acoustic-fixtures.json";
it("matches native CatBoost probabilities on held-out human beatbox features", () => {
  const classes = ["closed", "open", "kick", "snare"];
  for (const fixture of fixtures) {
    const actual = acousticProbabilities(fixture.features)!;
    classes.forEach((drum, i) =>
      expect(actual.find((a) => a.drum === drum)!.probability).toBeCloseTo(
        fixture.probabilities[i],
        6,
      ),
    );
  }
});
it("does not manufacture model evidence for legacy/incomplete measurements", () => {
  expect(
    acousticProbabilities({ ...fixtures[0].features, acoustic: undefined }),
  ).toBeNull();
});
