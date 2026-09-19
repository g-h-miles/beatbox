import type { DrumKit } from "./drum-kits";
import { drums, type Drum } from "./composer-model";
import { type BeatStep, stepSeconds } from "./generator";
import { midi } from "./composer-midi";

// Complete phrases, not independent yes/no hit decisions. These are deliberately
// authored vocabulary; the model arranges them rather than inventing arbitrary MIDI.
export const foundations = {
  pocket: {
    name: "Pocket",
    description:
      "A relaxed backbeat. Kick 1, 3, 3&; snare 2 and 4. Space before each backbeat.",
    kick: [0, 8, 10],
    snare: [4, 12],
    ghosts: [],
  },
  straight: {
    name: "Straight backbeat",
    description: "Plain rock/pop. Kick 1 and 3; snare 2 and 4. No extra hits.",
    kick: [0, 8],
    snare: [4, 12],
    ghosts: [],
  },
  boom_bap: {
    name: "Boom bap",
    description: "Hip-hop pocket. Kick 1, 2&, 3&; firm snare 2 and 4.",
    kick: [0, 6, 10],
    snare: [4, 12],
    ghosts: [],
  },
  funk: {
    name: "Funk pocket",
    description:
      "Syncopated sixteenth-note funk. Kick 1, 2&, 3a; snare 2 and 4 with quiet connective ghosts on 2a and 4e.",
    kick: [0, 6, 11],
    snare: [4, 12],
    ghosts: [7, 13],
  },
  one_drop: {
    name: "One drop",
    description:
      "Roots reggae. Kick and restrained snare together on beat 3. No kick on beat 1. The cymbal phrase carries the pulse.",
    kick: [8],
    snare: [8],
    ghosts: [],
  },
  steppers: {
    name: "Steppers",
    description:
      "Reggae steppers. Kick on every numbered beat; restrained snare on 3.",
    kick: [0, 4, 8, 12],
    snare: [8],
    ghosts: [],
  },
  rockers: {
    name: "Rockers",
    description: "Reggae rockers. Kick on 1 and 3; restrained snare on 3.",
    kick: [0, 8],
    snare: [8],
    ghosts: [],
  },
  four_floor: {
    name: "Four on the floor",
    description: "House/disco. Kick on all four numbered beats, snare 2 and 4.",
    kick: [0, 4, 8, 12],
    snare: [4, 12],
    ghosts: [],
  },
  half_time: {
    name: "Half time",
    description: "Spacious half-time pocket. Kick 1 and 2&; snare 3.",
    kick: [0, 6],
    snare: [8],
    ghosts: [],
  },
  broken: {
    name: "Broken beat",
    description:
      "Syncopated breakbeat. Kick 1, 2a, 3&; snare 2 and 4; quiet snare ghost on 3e.",
    kick: [0, 7, 10],
    snare: [4, 12],
    ghosts: [9],
  },
  kick_only: {
    name: "Quarter-note kick",
    description: "Only a kick drum on each numbered beat; no snare.",
    kick: [0, 4, 8, 12],
    snare: [],
    ghosts: [],
  },
  no_foundation: {
    name: "Cymbals only",
    description: "No kick or snare. Use only when the request excludes both.",
    kick: [],
    snare: [],
    ghosts: [],
  },
} as const;
export const tops = {
  eighths: {
    name: "Eighth-note hats",
    description:
      "Closed hats on 1 & 2 & 3 & 4 &, strong/soft alternating pulse. A plain rock or pop groove.",
    hits: [0, 2, 4, 6, 8, 10, 12, 14],
    accents: [0, 4, 8, 12],
    open: [],
  },
  offbeat_accent: {
    name: "Offbeat accents",
    description:
      "Continuous closed eighth-note hats, with quieter numbered beats and stronger & offbeats. A full reggae pulse, not just four disconnected hats.",
    hits: [0, 2, 4, 6, 8, 10, 12, 14],
    accents: [2, 6, 10, 14],
    open: [],
  },
  offbeats: {
    name: "Offbeat hats",
    description:
      "Only the four & offbeats, all closed. Use when explicitly requested, or a sparse dance arrangement.",
    hits: [2, 6, 10, 14],
    accents: [],
    open: [],
  },
  open_offbeats: {
    name: "Open offbeats",
    description:
      "Open hats on each & offbeat; closed hats on each numbered beat choke them. House/disco pumping pulse.",
    hits: [0, 2, 4, 6, 8, 10, 12, 14],
    accents: [],
    open: [2, 6, 10, 14],
  },
  sixteenths: {
    name: "Sixteenth-note hats",
    description:
      "Continuous closed sixteenths, eighths at medium strength and intervening e/a at ghost level. Quiet inner notes make the pulse breathe.",
    hits: Array.from({ length: 16 }, (_, i) => i),
    accents: [0, 2, 4, 6, 8, 10, 12, 14],
    open: [],
  },
  syncopated: {
    name: "Broken hats",
    description:
      "Eighth-note pulse with quiet sixteenth pickups on 2a and 4a; omit 3& for a small pocket of space.",
    hits: [0, 2, 4, 6, 7, 8, 12, 14, 15],
    accents: [0, 4, 8, 12],
    open: [],
  },
  quarters: {
    name: "Quarter-note hats",
    description: "Closed hats on beats 1, 2, 3, 4 only. Broad, sparse pulse.",
    hits: [0, 4, 8, 12],
    accents: [0, 8],
    open: [],
  },
  ride: {
    name: "Eighth-note ride",
    description:
      "Eighth-note ride cymbal with understated offbeats; no hi-hat.",
    hits: [0, 2, 4, 6, 8, 10, 12, 14],
    accents: [0, 4, 8, 12],
    open: [],
  },
  thirty_seconds: {
    name: "Thirty-second-note hats",
    description:
      "Continuous quiet 1/32 closed hats, with stronger eighth-note accents. Use only when explicitly requested.",
    hits: Array.from({ length: 32 }, (_, i) => i / 2),
    accents: [0, 2, 4, 6, 8, 10, 12, 14],
    open: [],
  },
  none: {
    name: "No cymbals",
    description:
      "No hats, ride or crashes. Use for kick-only or explicitly cymbal-free requests.",
    hits: [],
    accents: [],
    open: [],
  },
} as const;
export const feels = {
  straight:
    "Straight sixteenths, stable timing; firm foundation and softly articulated hats. Default unless a relaxed or swung feel is requested.",
  laid_back:
    "Laid-back pocket: snare 9 ms behind the pulse and a light 56% sixteenth swing. Good for a relaxed funk/hip-hop pocket.",
  swung:
    "Clearly swung sixteenths, 62% swing. Use for an explicit swung or shuffle-like sixteenth feel, not ordinary straight reggae.",
} as const;
export const fills = {
  tom_run:
    "A descending high/mid/low tom fill on beat 4: high on 4, mid on 4e, low on 4& and 4a. Clear snare and cymbals during the fill, retain the kick.",
  tom_build:
    "A two-beat descending tom fill over beats 3 and 4. High toms on 3/3e, mid toms on 3&/3a, low toms on 4/4e/4&/4a. Clear snare and cymbals during the fill, retain the kick.",
  none: "No fill. Keep the chosen groove unchanged for this bar.",
  snare_pickup:
    "A short snare pickup on 4& and 4a, building into the following bar. Keep the kick pattern.",
  snare_roll:
    "A one-beat snare fill across beat 4 in sixteenth notes, increasing intensity. Keep the kick pattern, clear cymbals during the fill.",
  snare_build:
    "A two-beat snare fill across beats 3 and 4 in sixteenth notes, building intensity. Keep the kick pattern, clear cymbals during the fill.",
  fine_roll:
    "A one-beat snare fill across beat 4 in thirty-second notes. Keep the kick pattern, clear cymbals during the fill.",
} as const;
export const variations = {
  unchanged:
    "Keep the foundation and cymbal phrase unchanged. Use for the opening motif, an explicitly identical repeat, or exact note-position constraints.",
  kick_pickup:
    "Add one kick at 4& leading into the next bar. Keep other notes unchanged. Not for strict four-on-floor-only or one-drop-only kick instructions.",
  snare_ghost:
    "Add a quiet snare ghost on 3a, keeping the main backbeats unchanged. Not when snare positions are strictly specified or snare is excluded.",
  hat_answer:
    "A quiet closed-hat answer on 2a and 4a. Preserve the main pulse. Not for exact hat-position constraints or cymbal exclusions.",
  open_lift:
    "Open the existing hat on 4& for a short lift. Keep its velocity and all other notes. Only when a closed hat exists there and open hats are allowed.",
  hat_space:
    "Leave out the hat on 4& to create a small breath before the next bar. Only when a hat exists there and exact positions were not requested.",
} as const;
export function applyVariation(
  groove: BarGroove,
  variation: keyof typeof variations,
): BarGroove {
  const steps = groove.steps.map((s) => ({ ...s }));
  const r = groove.resolution ?? 16;
  const at = (i: number) => steps[(i * r) / 16];
  if (variation === "kick_pickup") at(14).kick ||= 80;
  if (variation === "snare_ghost") at(11).snare ||= 32;
  if (variation === "hat_answer")
    for (const i of [7, 15]) {
      if (!at(i).open && !at(i).ride) at(i).closed ||= 32;
    }
  if (variation === "open_lift" && at(14).closed) {
    at(14).open = at(14).closed;
    at(14).closed = 0;
  }
  if (variation === "hat_space") {
    at(14).closed = 0;
    at(14).open = 0;
  }
  return { ...groove, steps };
}
export type BarPlan = {
  variation?: keyof typeof variations;
  foundation: keyof typeof foundations;
  top: keyof typeof tops;
  feel: keyof typeof feels;
  fill: keyof typeof fills;
};
export function applyFill(
  groove: BarGroove,
  fill: keyof typeof fills,
): BarGroove {
  if (fill === "none") return groove;
  const resolution = groove.resolution ?? 16;
  const steps = groove.steps.map((s) => ({ ...s }));
  if (fill === "tom_run" || fill === "tom_build") {
    const start = fill === "tom_build" ? resolution / 2 : (resolution * 3) / 4;
    const count = fill === "tom_build" ? 8 : 4;
    for (let i = start; i < resolution; i++) {
      steps[i].snare = 0;
      steps[i].closed = 0;
      steps[i].open = 0;
      steps[i].ride = 0;
    }
    for (let n = 0; n < count; n++) {
      const voice =
        n < count / 4 ? "tom_high" : n < count / 2 ? "tom_mid" : "tom_low";
      steps[start + (n * resolution) / 16][voice] = n % 2 ? 80 : 104;
    }
    return { ...groove, steps };
  }
  const start =
    fill === "snare_build"
      ? resolution / 2
      : fill === "snare_pickup"
        ? (resolution * 7) / 8
        : (resolution * 3) / 4;
  const spacing = fill === "fine_roll" ? 1 : resolution / 16;
  for (let i = start; i < resolution; i++) {
    if (fill !== "snare_pickup") {
      steps[i].closed = 0;
      steps[i].open = 0;
      steps[i].ride = 0;
    }
    steps[i].snare =
      (i - start) % spacing === 0
        ? i < start + (resolution - start) / 2
          ? 56
          : 104
        : 0;
  }
  return { ...groove, steps };
}
export type BarGroove = {
  foundation: keyof typeof foundations;
  top: keyof typeof tops;
  feel: keyof typeof feels;
  steps: BeatStep[];
  kit?: DrumKit;
  arrangements?: BarPlan[];
  bars?: number;
  resolution?: number;
};
export function arrangeBar(
  foundation: BarGroove["foundation"],
  top: BarGroove["top"],
  feel: BarGroove["feel"],
  bars = 1,
  resolution = 16,
): BarGroove {
  const base = foundations[foundation],
    cymbals = tops[top];
  const steps = Array.from(
    { length: resolution },
    () => Object.fromEntries(drums.map((d) => [d.id, 0])) as BeatStep,
  );
  const reggae = ["one_drop", "rockers", "steppers"].includes(foundation);
  base.kick.forEach((i) => (steps[(i * resolution) / 16].kick = 104));
  base.snare.forEach(
    (i) => (steps[(i * resolution) / 16].snare = reggae ? 80 : 104),
  );
  base.ghosts.forEach((i) => (steps[(i * resolution) / 16].snare = 32));
  cymbals.hits.forEach((i) => {
    if (!Number.isInteger((i * resolution) / 16)) return;
    const voice: Drum =
      top === "ride"
        ? "ride"
        : (cymbals.open as readonly number[]).includes(i)
          ? "open"
          : "closed";
    const accent = (cymbals.accents as readonly number[]).includes(i);
    steps[(i * resolution) / 16][voice] =
      top === "sixteenths" || top === "thirty_seconds"
        ? accent
          ? 56
          : 32
        : accent
          ? 80
          : 56;
  });
  return {
    foundation,
    top,
    feel,
    bars,
    resolution,
    steps: Array.from({ length: bars }, () =>
      steps.map((s) => ({ ...s })),
    ).flat(),
  };
}
export function barNotes(
  groove: BarGroove,
  bpm: number,
): { drum: Drum; velocity: number; time: number; duration: number }[] {
  if (groove.arrangements) {
    const resolution = groove.resolution ?? 16;
    return groove.arrangements.flatMap((plan, index) =>
      barNotes(
        {
          ...groove,
          ...plan,
          arrangements: undefined,
          bars: 1,
          steps: groove.steps.slice(
            index * resolution,
            (index + 1) * resolution,
          ),
        },
        bpm,
      ).map((note) => ({ ...note, time: note.time + (index * 240) / bpm })),
    );
  }
  const resolution = groove.resolution ?? 16;
  const unit = stepSeconds(bpm, resolution);
  const swing =
    groove.feel === "swung" ? 0.62 : groove.feel === "laid_back" ? 0.56 : 0.5;
  return groove.steps
    .flatMap((step, i) =>
      drums.flatMap(({ id }) =>
        step[id] > 0
          ? [
              {
                drum: id,
                velocity: step[id],
                time:
                  (i +
                    (Math.floor(i / (resolution / 16)) % 2
                      ? ((2 * swing - 1) * resolution) / 16
                      : 0)) *
                    unit +
                  (id === "snare" && groove.feel === "laid_back" ? 0.009 : 0),
                duration: Math.min(0.06, unit),
              },
            ]
          : [],
      ),
    )
    .map((note) => ({
      ...note,
      duration: Math.min(
        note.duration,
        (240 / bpm) * (groove.bars ?? 1) - note.time,
      ),
    }))
    .sort((a, b) => a.time - b.time);
}
export function barMidi(groove: BarGroove, bpm: number) {
  const quarter = Math.round(60_000_000 / bpm) / 1_000_000;
  return midi(
    barNotes(groove, 60 / quarter),
    bpm,
    quarter * 4 * (groove.bars ?? 1),
    `BEATBOX • ${groove.bars ?? 1}-bar arrangement`,
  );
}
