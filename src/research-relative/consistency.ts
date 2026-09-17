/** Frozen Ward grouping for recording-level margin pooling. Research only. */
export function wardGroups(rows: Float32Array[], count = 8): number[] {
  const n = rows.length;
  if (!n) return [];
  if (!Number.isInteger(count) || count < 1)
    throw new Error("Invalid group count");
  const dimensions = rows[0].length;
  if (
    !dimensions ||
    rows.some(
      (row) =>
        row.length !== dimensions || row.some((x) => !Number.isFinite(x)),
    )
  )
    throw new Error("Invalid acoustic features");
  const active = new Uint8Array(n).fill(1);
  const sizes = new Uint32Array(n).fill(1);
  const members = Array.from({ length: n }, (_, i) => [i]);
  const distances = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      let square = 0;
      for (let d = 0; d < dimensions; d++)
        square += (rows[i][d] - rows[j][d]) ** 2;
      distances[i * n + j] = distances[j * n + i] = square;
    }
  for (let remaining = n; remaining > count; remaining--) {
    let a = -1,
      b = -1,
      best = Infinity;
    for (let i = 0; i < n; i++)
      if (active[i])
        for (let j = i + 1; j < n; j++)
          if (active[j] && distances[i * n + j] < best) {
            best = distances[i * n + j];
            a = i;
            b = j;
          }
    if (a < 0) throw new Error("Invalid acoustic distance");
    const na = sizes[a],
      nb = sizes[b];
    for (let v = 0; v < n; v++)
      if (active[v] && v !== a && v !== b) {
        const nv = sizes[v],
          total = na + nb + nv;
        const square =
          ((na + nv) * distances[a * n + v] +
            (nb + nv) * distances[b * n + v] -
            nv * best) /
          total;
        distances[a * n + v] = distances[v * n + a] = Math.max(0, square);
      }
    active[b] = 0;
    sizes[a] += sizes[b];
    members[a].push(...members[b]);
  }
  const groups = new Array<number>(n);
  let group = 0;
  for (let i = 0; i < n; i++)
    if (active[i]) {
      for (const member of members[i]) groups[member] = group;
      group++;
    }
  return groups;
}

/** Average uncalibrated pairwise margins; returns original three-class votes. */
export function pooledCoreLabels(
  groups: number[],
  margins: number[][],
): number[] {
  if (
    groups.length !== margins.length ||
    margins.some(
      (row) => row.length !== 3 || row.some((x) => !Number.isFinite(x)),
    )
  )
    throw new Error("Invalid margin groups");
  const sums = new Map<number, { sum: number[]; count: number }>();
  groups.forEach((group, i) => {
    const item = sums.get(group) ?? { sum: [0, 0, 0], count: 0 };
    for (let d = 0; d < 3; d++) item.sum[d] += margins[i][d];
    item.count++;
    sums.set(group, item);
  });
  const labels = new Map<number, number>();
  for (const [group, { sum, count }] of sums) {
    const votes = [0, 0, 0];
    let column = 0;
    for (let i = 0; i < 3; i++)
      for (let j = i + 1; j < 3; j++)
        votes[sum[column++] / count > 0 ? i : j]++;
    let winner = 0;
    for (let i = 1; i < 3; i++) if (votes[i] > votes[winner]) winner = i;
    labels.set(group, winner);
  }
  return groups.map((group) => labels.get(group)!);
}
