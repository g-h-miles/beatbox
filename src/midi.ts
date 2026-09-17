import { drums, type Hit } from "./model";
const vlq = (n: number) => {
  const b = [n & 127];
  while ((n = Math.floor(n / 128)) > 0) b.unshift((n & 127) | 128);
  return b;
};
const u32 = (n: number) => [
  (n >>> 24) & 255,
  (n >>> 16) & 255,
  (n >>> 8) & 255,
  n & 255,
];
// 9600 ticks/quarter. Tempo is metadata: seconds remain invariant at any selected BPM.
export function midi(hits: Hit[], bpm = 120, duration = 0): Uint8Array {
  const tempo = Math.round(60_000_000 / bpm),
    ppq = 9600,
    ticks = (s: number) => Math.round(((s * 1_000_000) / tempo) * ppq);
  const events = hits
    .flatMap((h) => {
      const note = drums.find((d) => d.id === h.drum)!.note;
      return [
        { t: ticks(h.time), data: [0x99, note, h.velocity] },
        {
          t: ticks(h.time + Math.min(0.06, h.duration)),
          data: [0x89, note, 0],
        },
      ];
    })
    .sort((a, b) => a.t - b.t || a.data[0] - b.data[0]);
  const name = [...new TextEncoder().encode("BEATBOX • original timing")];
  const track = [
    0,
    255,
    81,
    3,
    ...u32(tempo).slice(1),
    0,
    255,
    3,
    name.length,
    ...name,
  ];
  let previous = 0;
  for (const e of events) {
    track.push(...vlq(e.t - previous), ...e.data);
    previous = e.t;
  }
  track.push(...vlq(Math.max(0, ticks(duration) - previous)), 255, 47, 0);
  return new Uint8Array([
    77,
    84,
    104,
    100,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    1,
    ppq >> 8,
    ppq & 255,
    77,
    84,
    114,
    107,
    ...u32(track.length),
    ...track,
  ]);
}
