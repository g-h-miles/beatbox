import { drumKits, type DrumKit } from "./drum-kits";
import type { Drum } from "./model";
// Electronic kit for the composer. The transcription demo keeps its own test sound.
// In particular, a snare needs a pitched body as well as the noisy wire transient.
const kits = new WeakMap<
  BaseAudioContext,
  {
    bus: DynamicsCompressorNode;
    noise: AudioBuffer;
    open: AudioScheduledSourceNode[];
  }
>();
export function grooveSound(
  ctx: BaseAudioContext,
  drum: Drum,
  time: number,
  velocity: number,
  kitName: DrumKit = "electronic",
): AudioScheduledSourceNode[] {
  const profile = drumKits[kitName];
  let kit = kits.get(ctx);
  if (!kit) {
    const bus = ctx.createDynamicsCompressor();
    bus.threshold.value = -10;
    bus.knee.value = 6;
    bus.ratio.value = 3;
    bus.attack.value = 0.003;
    bus.release.value = 0.12;
    bus.connect(ctx.destination);
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate),
      data = noise.getChannelData(0);
    let seed = 7391;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      data[i] = (seed >>> 0) / 2147483648 - 1;
    }
    kit = { bus, noise, open: [] };
    kits.set(ctx, kit);
  }
  const level = Math.pow(velocity / 127, 1.35),
    nodes: AudioScheduledSourceNode[] = [];
  const envelope = (peak: number, decay: number) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, peak * level),
      time + 0.001,
    );
    g.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    g.connect(kit!.bus);
    return g;
  };
  const tone = (
    frequency: number,
    peak: number,
    decay: number,
    end?: number,
  ) => {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(frequency, time);
    if (end) o.frequency.exponentialRampToValueAtTime(end, time + 0.045);
    o.connect(envelope(peak, decay));
    o.start(time);
    o.stop(time + decay);
    nodes.push(o);
  };
  const noise = (
    frequency: number,
    peak: number,
    decay: number,
    type: BiquadFilterType = "highpass",
  ) => {
    const source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter();
    source.buffer = kit!.noise;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.7;
    source.connect(filter);
    filter.connect(envelope(peak, decay));
    source.start(time);
    source.stop(time + decay);
    nodes.push(source);
  };
  if (drum === "kick") {
    tone(profile.kick[0], 0.85, profile.kick[2], profile.kick[1]);
    noise(1800, 0.12, 0.012);
  } else if (drum === "snare") {
    tone(
      profile.snare[0],
      0.32 * profile.body,
      profile.snare[2] * 0.7,
      profile.snare[0] * 0.78,
    );
    tone(profile.snare[0] * 1.78, 0.1 * profile.body, 0.07);
    noise(profile.snare[1], 0.65 * profile.wire, profile.snare[2]);
  } else if (drum === "closed" || drum === "open") {
    for (const source of kit.open) {
      try {
        source.stop(time + 0.006);
      } catch {}
    }
    kit.open = [];
    const decay = drum === "closed" ? profile.hats[1] : profile.hats[2];
    noise(profile.hats[0], 0.36, decay);
    noise(
      Math.min(15000, profile.hats[0] * 1.45),
      0.1,
      decay * 0.6,
      "bandpass",
    );
    if (drum === "open") kit.open = [...nodes];
  } else if (drum === "ride" || drum === "crash") {
    noise(profile.hats[0] * 0.76, 0.2, drum === "ride" ? 0.55 : 0.85);
    for (const f of [2053, 3047, 4051, 5987])
      tone(f, 0.025, drum === "ride" ? 0.4 : 0.6);
  } else {
    tone(800, 0.12, 0.05);
    noise(1600, 0.15, 0.08, "bandpass");
  }
  return nodes;
}
