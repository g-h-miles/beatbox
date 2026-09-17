import FFT from "fft.js";
import type { Drum, Features, Hit } from "./model";
export const MAX_SECONDS = 90;
export function mono(buffer: AudioBuffer) {
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const x = buffer.getChannelData(c);
    for (let i = 0; i < x.length; i++) out[i] += x[i] / buffer.numberOfChannels;
  }
  return out;
}
export function features(
  x: Float32Array,
  sr: number,
  start: number,
  end: number,
): Features {
  const a = Math.floor(start * sr),
    b = Math.min(x.length, Math.floor(end * sr));
  let power = 0,
    peak = 0,
    peakI = a,
    cross = 0;
  for (let i = a; i < b; i++) {
    power += x[i] * x[i];
    if (Math.abs(x[i]) > peak) {
      peak = Math.abs(x[i]);
      peakI = i;
    }
    if (i > a && x[i] * x[i - 1] < 0) cross++;
  }
  const fft = new FFT(1024),
    bins = new Float64Array(512);
  let frames = 0;
  for (let at = a; at < Math.min(b, a + sr * 0.3); at += 512) {
    const win = Array.from(
      { length: 1024 },
      (_, i) =>
        (x[at + i] || 0) *
        (at + i < b ? 1 : 0) *
        (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / 1023)),
    );
    const spectrum = fft.createComplexArray();
    fft.realTransform(spectrum, win);
    for (let k = 1; k < 512; k++)
      bins[k] += spectrum[2 * k] ** 2 + spectrum[2 * k + 1] ** 2;
    frames++;
  }
  let total = 0,
    weighted = 0,
    low = 0,
    mid = 0,
    high = 0,
    log = 0;
  for (let k = 1; k < 512; k++) {
    const p = bins[k] / Math.max(frames, 1),
      f = (k * sr) / 1024;
    total += p;
    weighted += p * f;
    log += Math.log(p + 1e-12);
    if (f < 350) low += p;
    else if (f < 3500) mid += p;
    else high += p;
  }
  const spectrum: number[] = [];
  // Mel-spaced band shape, normalized to total power: independent of microphone gain.
  const mel = (hz: number) => 2595 * Math.log10(1 + hz / 700);
  const hz = (m: number) => 700 * (10 ** (m / 2595) - 1);
  for (let band = 0; band < 20; band++) {
    const lo = hz(mel(60) + ((mel(14000) - mel(60)) * band) / 20);
    const hi = hz(mel(60) + ((mel(14000) - mel(60)) * (band + 1)) / 20);
    let p = 0;
    for (
      let k = Math.max(1, Math.floor((lo * 1024) / sr));
      k < Math.min(512, Math.ceil((hi * 1024) / sr));
      k++
    )
      p += bins[k] / Math.max(frames, 1);
    spectrum.push(Math.log10(Math.max(1e-7, p / (total || 1))));
  }
  // Time-resolved spectra and decay distinguish an explosive consonant from
  // its vowel/hiss tail. Normalize globally, retaining attack-to-tail energy.
  const acoustic: number[] = [];
  const framePower: number[] = [];
  const temporal: number[][] = [];
  for (let frame = 0; frame < 20; frame++) {
    const at = a + Math.round(frame * 0.01 * sr);
    const win = Array.from({ length: 1024 }, (_, j) =>
      at + j < b
        ? (x[at + j] || 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * j) / 1023))
        : 0,
    );
    const c = fft.createComplexArray();
    fft.realTransform(c, win);
    const bands = Array(20).fill(0);
    let sum = 0;
    for (let k = 1; k < 512; k++) {
      const p = c[2 * k] ** 2 + c[2 * k + 1] ** 2;
      sum += p;
      const band = Math.floor(
        (20 * (mel((k * sr) / 1024) - mel(60))) / (mel(14000) - mel(60)),
      );
      if (band >= 0 && band < 20) bands[band] += p;
    }
    framePower.push(sum);
    temporal.push(bands);
  }
  const maximum = Math.max(...framePower, 1e-12);
  for (const [lo, hi] of [
    [0, 3],
    [3, 8],
    [8, 20],
  ]) {
    const segment = temporal.slice(lo, hi);
    const sums = Array.from({ length: 20 }, (_, k) =>
      segment.reduce((v, f) => v + f[k], 0),
    );
    const total = sums.reduce((v, p) => v + p, 0) || 1e-12;
    acoustic.push(...sums.map((p) => Math.log10(Math.max(1e-7, p / total))));
  }
  acoustic.push(
    ...framePower.map((p) => Math.log10(Math.max(1e-5, p / maximum))),
  );
  return {
    acoustic: acoustic.map((v) => Math.round(v * 1000) / 1000),
    spectrum,
    duration: end - start,
    centroid: weighted / (total || 1),
    low: low / (total || 1),
    mid: mid / (total || 1),
    high: high / (total || 1),
    flatness: Math.exp(log / 511) / (total / 511 + 1e-12),
    zcr: cross / Math.max(1, b - a),
    attack: (peakI - a) / sr,
    rms: Math.sqrt(power / Math.max(1, b - a)),
  };
}
export function guess(f: Features): Drum {
  if (f.low > 0.48) return "kick";
  if (f.attack > 0.08 && f.flatness > 0.1) return "aux";
  if (f.high > 0.48) return f.duration > 0.22 ? "open" : "closed";
  if (f.flatness < 0.025 && f.centroid > 1800 && f.duration > 0.2)
    return "ride";
  if (f.duration > 0.38 && f.flatness > 0.08) return "crash";
  if (f.mid > 0.4) return "snare";
  return "aux";
}
// Energy novelty at 2 ms hops, followed by a sample-level backward attack search.
// No beat grid or tempo enters this function.
export function analyze(
  x: Float32Array,
  sr: number,
  sensitivity = 50,
  mode: "hits" | "syllables" = "hits",
): Hit[] {
  const hop = Math.max(1, Math.round(sr * 0.002)),
    window = hop * 3,
    n = Math.ceil(x.length / hop),
    energy = new Float64Array(n);
  let max = 0;
  for (let f = 0; f < n; f++) {
    let sum = 0;
    for (let i = f * hop; i < Math.min(x.length, f * hop + window); i++)
      sum += x[i] * x[i];
    energy[f] = Math.sqrt(sum / window);
    max = Math.max(max, energy[f]);
  }
  if (max < 0.0003) return [];
  const floor = Math.max(0.0003, max * (0.055 - (sensitivity / 100) * 0.045)),
    ratio = 3.4 - sensitivity * 0.021,
    onsets: number[] = [];
  let last = -1000;
  if (energy[0] > floor) {
    let at = 0;
    while (
      at < Math.min(x.length, window) &&
      Math.abs(x[at]) < Math.max(0.00015, energy[0] * 0.08)
    )
      at++;
    onsets.push(at / sr);
    last = 0;
  }
  for (let f = 2; f < n - 2; f++) {
    let baseline = 0;
    const first = Math.max(0, f - 20);
    for (let j = first; j < f - 2; j++) baseline += energy[j];
    baseline /= Math.max(1, f - first - 2);
    if (
      energy[f] > floor &&
      energy[f] > Math.max(floor, baseline * ratio) &&
      energy[f] > energy[f - 1] * 1.08 &&
      f - last > 23
    ) {
      let idx = f * hop;
      const lower = Math.max(0, idx - window);
      const threshold = Math.max(0.00015, energy[f] * 0.08);
      while (idx > lower && Math.abs(x[idx]) > threshold) idx--;
      // Locate the first non-silent sample in the attack window, retaining leading silence.
      for (let i = lower; i < Math.min(x.length, f * hop + window); i++) {
        if (Math.abs(x[i]) > threshold) {
          idx = i;
          break;
        }
      }
      onsets.push(idx / sr);
      last = f;
    }
  }
  if (mode === "syllables") {
    // Keep short vowel re-attacks and attached /ts/ tails together. Quiet
    // separates words; a new non-hiss attack also re-arms continuous speech.
    const grouped: number[] = [];
    for (const onset of onsets) {
      if (!grouped.length) {
        grouped.push(onset);
        continue;
      }
      let quiet = 0,
        longest = 0;
      for (
        let f = Math.ceil((grouped[grouped.length - 1] * sr) / hop);
        f < Math.floor((onset * sr) / hop);
        f++
      ) {
        quiet = energy[f] < floor ? quiet + 1 : 0;
        longest = Math.max(longest, quiet);
      }
      const gap = onset - grouped[grouped.length - 1];
      const attack = features(
        x,
        sr,
        onset,
        Math.min(x.length / sr, onset + 0.04),
      );
      const attachedHiss = attack.high > 0.65 && gap < 0.5;
      if ((longest * hop) / sr >= 0.09 || (gap >= 0.12 && !attachedHiss))
        grouped.push(onset);
    }
    onsets.splice(0, onsets.length, ...grouped);
  }
  return onsets.slice(0, 600).map((time, i) => {
    const next = onsets[i + 1] ?? x.length / sr;
    let end = Math.min(next, time + 1.2);
    const begin = Math.ceil(((time + 0.025) * sr) / hop);
    for (let f = begin; f < Math.min(n, Math.floor((next * sr) / hop)); f++) {
      if (energy[f] < floor) {
        end = Math.min(end, (f * hop) / sr);
        break;
      }
    }
    end = Math.max(time + 0.01, end);
    if (mode === "syllables") {
      let quiet = 0;
      end = Math.min(next, time + 1.2);
      for (let j = begin; j < Math.min(n, Math.floor((next * sr) / hop)); j++) {
        quiet = energy[j] < floor ? quiet + 1 : 0;
        if ((quiet * hop) / sr >= 0.09) {
          end = Math.max(time + 0.01, ((j - quiet + 1) * hop) / sr);
          break;
        }
      }
    }
    const f = features(
      x,
      sr,
      time,
      mode === "syllables" ? Math.min(end, time + 0.04) : end,
    );
    return {
      id: `hit-${i}`,
      time,
      duration: end - time,
      velocity: Math.max(
        20,
        Math.min(127, Math.round(127 * Math.sqrt(f.rms / max))),
      ),
      drum: guess(f),
      confidence: null,
      source: "local",
      features: f,
    };
  });
}
export function drumSound(
  ctx: BaseAudioContext,
  drum: Drum,
  time: number,
  velocity = 100,
): AudioScheduledSourceNode[] {
  const volume = ctx.createGain();
  volume.gain.value = (velocity / 127) * 0.65;
  volume.connect(ctx.destination);
  const duration =
    drum === "kick"
      ? 0.25
      : drum === "closed"
        ? 0.07
        : drum === "snare"
          ? 0.18
          : drum === "ride"
            ? 0.5
            : drum === "aux"
              ? 0.22
              : 0.65;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.7, time + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  gain.connect(volume);
  const nodes: AudioScheduledSourceNode[] = [];
  if (drum === "kick" || drum === "ride") {
    const o = ctx.createOscillator();
    o.type = drum === "kick" ? "sine" : "triangle";
    o.frequency.setValueAtTime(drum === "kick" ? 155 : 2700, time);
    o.frequency.exponentialRampToValueAtTime(
      drum === "kick" ? 43 : 1700,
      time + duration,
    );
    o.connect(gain);
    o.start(time);
    o.stop(time + duration);
    nodes.push(o);
  } else {
    const buffer = ctx.createBuffer(
        1,
        Math.ceil(ctx.sampleRate * duration),
        ctx.sampleRate,
      ),
      data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = drum === "aux" ? "bandpass" : "highpass";
    filter.frequency.value =
      drum === "snare" ? 900 : drum === "aux" ? 1400 : 6500;
    source.connect(filter);
    filter.connect(gain);
    source.start(time);
    nodes.push(source);
  }
  return nodes;
}
export async function demoBuffer(): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, 44100 * 5, 44100);
  const pattern: [number, Drum][] = [
    [0.23, "kick"],
    [0.49, "closed"],
    [0.76, "snare"],
    [1.02, "closed"],
    [1.27, "kick"],
    [1.43, "kick"],
    [1.78, "snare"],
    [2.04, "open"],
    [2.32, "kick"],
    [2.57, "closed"],
    [2.83, "snare"],
    [3.09, "ride"],
    [3.36, "kick"],
    [3.62, "closed"],
    [3.87, "snare"],
    [4.13, "crash"],
  ];
  for (const [time, drum] of pattern) drumSound(ctx, drum, time, 95);
  return ctx.startRendering();
}
