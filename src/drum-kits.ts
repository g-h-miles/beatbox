export const drumKits = {
  electronic: {
    name: "Electronic",
    description:
      "Clean electronic drum machine: deep pitched kick, bright snare and crisp hats. Techno, house, dance.",
    kick: [145, 49, 0.3],
    snare: [185, 1400, 0.16],
    hats: [7200, 0.055, 0.34],
    body: 1,
    wire: 1,
  },
  acoustic: {
    name: "Acoustic",
    description:
      "Acoustic-inspired studio kit: shorter rounded kick, resonant snare and softer cymbals. Rock, pop, natural band grooves.",
    kick: [115, 58, 0.18],
    snare: [215, 2300, 0.22],
    hats: [5800, 0.085, 0.48],
    body: 1.25,
    wire: 0.75,
  },
  dusty: {
    name: "Dusty hip-hop",
    description:
      "Dark, dry hip-hop kit: low thudding kick, papery snare and muted short hats. Boom bap and lo-fi.",
    kick: [92, 42, 0.23],
    snare: [155, 850, 0.11],
    hats: [3800, 0.045, 0.22],
    body: 1.1,
    wire: 0.65,
  },
  funk: {
    name: "Tight funk",
    description:
      "Tight punchy funk kit: short kick, high snappy snare, articulated hats. Funk and syncopated pockets.",
    kick: [165, 65, 0.14],
    snare: [265, 2900, 0.095],
    hats: [8200, 0.038, 0.25],
    body: 0.85,
    wire: 0.85,
  },
  reggae: {
    name: "Warm reggae",
    description:
      "Warm reggae kit: deep round bass drum, woody rim-like snare, relaxed darker hats. Roots reggae, dub and one drop.",
    kick: [105, 40, 0.36],
    snare: [360, 1100, 0.065],
    hats: [4800, 0.075, 0.4],
    body: 1.3,
    wire: 0.32,
  },
} as const;
export type DrumKit = keyof typeof drumKits;
