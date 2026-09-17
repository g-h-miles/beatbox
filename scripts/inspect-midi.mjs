import { readFileSync } from "node:fs";
const bytes = readFileSync(process.argv[2]);
if (bytes.toString("ascii", 0, 4) !== "MThd") throw Error("Invalid MIDI");
const ppq = bytes.readUInt16BE(12);
let offset = 22,
  ticks = 0,
  running = 0,
  tempo = 500000;
const notes = [];
function variable() {
  let n = 0,
    b;
  do {
    b = bytes[offset++];
    n = n * 128 + (b & 127);
  } while (b & 128);
  return n;
}
while (offset < bytes.length) {
  ticks += variable();
  let status = bytes[offset++];
  if (status < 128) {
    offset--;
    status = running;
  } else running = status;
  if (status === 255) {
    const type = bytes[offset++],
      len = variable();
    if (type === 81) tempo = bytes.readUIntBE(offset, 3);
    offset += len;
    if (type === 47) break;
  } else if (status === 240 || status === 247) offset += variable();
  else {
    const note = bytes[offset++],
      kind = status >> 4,
      v = kind === 12 || kind === 13 ? 0 : bytes[offset++];
    if (kind === 9 && v > 0)
      notes.push({
        bar: Math.floor(ticks / (4 * ppq)) + 1,
        beat: (ticks % (4 * ppq)) / ppq + 1,
        note,
        velocity: v,
      });
  }
}
const names = {
  36: "kick",
  38: "snare",
  42: "closed",
  46: "open",
  51: "ride",
  49: "crash",
  75: "aux",
};
console.log(
  JSON.stringify(
    {
      file: process.argv[2],
      ppq,
      bpm: 60000000 / tempo,
      bars: ticks / (4 * ppq),
      count: notes.length,
      counts: Object.fromEntries(
        Object.entries(names).map(([note, name]) => [
          name,
          notes.filter((n) => n.note == note).length,
        ]),
      ),
      notes,
    },
    null,
    2,
  ),
);
