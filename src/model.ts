export const drums = [
  { id: "kick", name: "Kick", syllable: "BOOM", note: 36, key: "1" },
  { id: "closed", name: "Closed hat", syllable: "TS", note: 42, key: "2" },
  { id: "open", name: "Open hat", syllable: "TSHH", note: 46, key: "3" },
  { id: "ride", name: "Ride", syllable: "TING", note: 51, key: "4" },
  { id: "crash", name: "Crash", syllable: "KSHH", note: 49, key: "5" },
  { id: "snare", name: "Snare", syllable: "KA", note: 38, key: "6" },
  { id: "aux", name: "Aux / breath", syllable: "HAA", note: 75, key: "7" },
] as const;
export type Drum = (typeof drums)[number]["id"];
export type Features = {
  spectrum?: number[];
  acoustic?: number[];
  duration: number;
  centroid: number;
  low: number;
  mid: number;
  high: number;
  flatness: number;
  zcr: number;
  attack: number;
  rms: number;
};
export type Hit = {
  id: string;
  time: number;
  duration: number;
  velocity: number;
  drum: Drum;
  confidence: number | null;
  source: "local" | "typesafe" | "manual";
  features: Features;
  confirmedDrum?: boolean;
  probabilities?: Partial<Record<Drum, number>>;
  acousticDrum?: Drum;
  rhythmAdjusted?: boolean;
};
export const criteria = {
  kick: "Low, bass-heavy explosive lip plosive; short punch and low spectral centroid.",
  closed: "Short bright hiss or t sound; high-frequency noise and brief decay.",
  open: "Sustained bright tsh hiss with longer decay than closed hi-hat.",
  ride: "Bright but relatively tonal, ringing or ting-like sustained sound.",
  crash: "Broadband explosive noisy attack with a long decaying wash.",
  snare: "Sharp broadband mid-frequency-heavy k, pf or clap-like transient.",
  aux: "Breathing, inhalation or ambiguous non-drum sound; soft attack or no clear match.",
};
