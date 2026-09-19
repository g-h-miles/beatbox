export const drums = [
  { id: "kick", name: "Kick", syllable: "BOOM", note: 36, key: "1" },
  { id: "closed", name: "Closed hat", syllable: "TS", note: 42, key: "2" },
  { id: "open", name: "Open hat", syllable: "TSHH", note: 46, key: "3" },
  { id: "ride", name: "Ride", syllable: "TING", note: 51, key: "4" },
  { id: "crash", name: "Crash", syllable: "KSHH", note: 49, key: "5" },
  { id: "snare", name: "Snare", syllable: "KA", note: 38, key: "6" },
  { id: "aux", name: "Aux / breath", syllable: "HAA", note: 75, key: "7" },
  { id: "tom_low", name: "Low tom", syllable: "DOOM", note: 45, key: "8" },
  { id: "tom_mid", name: "Mid tom", syllable: "DOM", note: 47, key: "9" },
  { id: "tom_high", name: "High tom", syllable: "DUM", note: 50, key: "0" },
] as const;
export type Drum = (typeof drums)[number]["id"];
export type Hit = {
  time: number;
  duration: number;
  velocity: number;
  drum: Drum;
};
