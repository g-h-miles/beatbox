// Canonical PCM16 WAV for bounded, explicitly requested audio-model uploads.
export function wavClip(
  samples: Float32Array,
  sampleRate: number,
  start: number,
  end: number,
  maxSeconds = 1.5,
): Uint8Array {
  const rate = 16000;
  const count = Math.max(
    1,
    Math.min(Math.min(90, maxSeconds) * rate, Math.ceil((end - start) * rate)),
  );
  const bytes = new Uint8Array(44 + count * 2),
    view = new DataView(bytes.buffer);
  const text = (at: number, s: string) =>
    [...s].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const pos = (start + i / rate) * sampleRate,
      j = Math.floor(pos),
      t = pos - j;
    const value = (samples[j] || 0) * (1 - t) + (samples[j + 1] || 0) * t;
    view.setInt16(
      44 + i * 2,
      Math.round(Math.max(-1, Math.min(1, value)) * 32767),
      true,
    );
  }
  return bytes;
}
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
