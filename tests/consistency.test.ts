import { describe, it, expect } from "vitest";
import {
  wardGroups,
  pooledCoreLabels,
} from "../src/research-relative/consistency";
import fixture from "./consistency-fixture.json";
describe("frozen acoustic consistency rule", () => {
  it("matches sklearn Ward partition and pooled LIBSVM votes", () => {
    const rows = fixture.rows.map((row) => new Float32Array(row));
    const original = rows.map((row) => Array.from(row));
    const groups = wardGroups(rows);
    for (let i = 0; i < groups.length; i++)
      for (let j = 0; j < groups.length; j++)
        expect(groups[i] === groups[j]).toBe(
          fixture.groups[i] === fixture.groups[j],
        );
    expect(pooledCoreLabels(groups, fixture.margins)).toEqual(fixture.labels);
    expect(rows.map((row) => Array.from(row))).toEqual(original);
  });
  it("keeps short recordings unpooled and rejects malformed vectors", () => {
    expect(wardGroups([])).toEqual([]);
    expect(wardGroups([new Float32Array([1]), new Float32Array([2])])).toEqual([
      0, 1,
    ]);
    expect(() => wardGroups([new Float32Array([NaN])])).toThrow();
    expect(() => pooledCoreLabels([0], [])).toThrow();
  });
});
