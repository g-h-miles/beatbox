import { expect, it } from "vitest";
import { coreDiversity } from "../src/core-diversity";
it("does not treat a repeated sound as between-instrument information", () => {
  const a = Array.from({ length: 20 }, (_, i) => -i / 4);
  expect(coreDiversity(Array.from({ length: 30 }, () => a))).toBe(0);
  expect(coreDiversity(Array(5).fill(a))).toBe(0);
});
it("measures contrasting spectra without using their order or drum labels", () => {
  const a = Array(20).fill(-1),
    b = Array(20).fill(-3);
  const spectra = [a, a, a, a, b, b, b, b];
  expect(coreDiversity(spectra)).toBe(2);
  expect(coreDiversity([...spectra].reverse())).toBe(2);
});
it("abstains with missing or invalid measurements", () => {
  expect(coreDiversity(Array(8).fill(undefined))).toBe(0);
  expect(coreDiversity(Array(8).fill(Array(20).fill(NaN)))).toBe(0);
});
