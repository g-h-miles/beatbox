import { describe, expect, it } from 'vitest';
import { activeDuration } from '../src/audio-duration';

describe('active acoustic duration', () => {
  const rate = 16000;
  function sound(length: number, tail: number) {
    const x = new Float32Array(Math.round((length + tail) * rate));
    for (let i = 0; i < length * rate; i++) x[i] = .5 * Math.sin(2 * Math.PI * 3000 * i / rate);
    return x;
  }
  it('ignores added trailing silence without shortening an actual sustained sound', () => {
    const short = sound(.06, .1), padded = sound(.06, .44), sustained = sound(.35, .15);
    const a = activeDuration(short, rate, 0, short.length / rate);
    const b = activeDuration(padded, rate, 0, padded.length / rate);
    expect(a).toBeCloseTo(b, 6);
    expect(a).toBeGreaterThan(.055);
    expect(a).toBeLessThan(.066);
    expect(activeDuration(sustained, rate, 0, .5)).toBeGreaterThan(.34);
  });
  it('does not depend on ordinary microphone gain', () => {
    const x = sound(.1, .3), quiet = x.map((v) => v * .01);
    expect(activeDuration(x, rate, 0, .4)).toBeCloseTo(activeDuration(quiet, rate, 0, .4), 6);
  });
  it('returns zero for silence and invalid bounds', () => {
    expect(activeDuration(new Float32Array(rate), rate, 0, 1)).toBe(0);
    expect(activeDuration(sound(.1, .1), rate, .2, .1)).toBe(0);
    expect(activeDuration(sound(.1, .1), 0, 0, .2)).toBe(0);
  });
});
