import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("artifacts", { recursive: true });
// A deterministic PCM WAV fixture exercises decode/upload independently of the demo.
const sr = 44100,
  pcm = Buffer.alloc(sr * 2 * 2);
for (const t of [0.217, 0.601, 1.091, 1.438])
  for (let j = 0; j < 3000; j++) {
    const sample = Math.round(23000 * Math.exp(-j / 500) * Math.cos(j * 0.18));
    pcm.writeInt16LE(sample, (Math.floor(t * sr) + j) * 2);
  }
const head = Buffer.alloc(44);
head.write("RIFF");
head.writeUInt32LE(36 + pcm.length, 4);
head.write("WAVEfmt ", 8);
head.writeUInt32LE(16, 16);
head.writeUInt16LE(1, 20);
head.writeUInt16LE(1, 22);
head.writeUInt32LE(sr, 24);
head.writeUInt32LE(sr * 2, 28);
head.writeUInt16LE(2, 32);
head.writeUInt16LE(16, 34);
head.write("data", 36);
head.writeUInt32LE(pcm.length, 40);
writeFileSync("artifacts/timing-fixture.wav", Buffer.concat([head, pcm]));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.route("**/api/status", (r) =>
  r.fulfill({ json: { configured: true } }),
);
await page.goto("http://localhost:8787");
await page
  .locator("input[type=file]")
  .setInputFiles("artifacts/timing-fixture.wav");
await page.waitForFunction(
  () => document.querySelectorAll(".hit-row").length === 4,
);
const labels = await page.locator(".hit-row").allTextContents();
console.log("Detected file labels:", labels);
const detected = Number(labels[0].match(/([0-9]+\.[0-9]+)s/)[1]);
assert(Math.abs(detected - 0.217) < 0.008);
await page.route("**/api/classify", async (r) => {
  const payload = r.request().postDataJSON();
  assert.equal(payload.hits.length, 4);
  assert.equal(Object.keys(payload.hits[0]).sort().join(","), "features,id");
  await r.fulfill({
    json: {
      answers: payload.hits.map((h) => ({
        id: h.id,
        drum: "snare",
        confidence: 0.72,
      })),
    },
  });
});
await page.getByRole("button", { name: "Classify sounds" }).click();
await page
  .getByRole("status")
  .filter({ hasText: "Classification complete" })
  .waitFor();
assert(
  (await page.locator(".hit-row").allTextContents()).every(
    (t) => t.includes("Snare") && t.includes("72%"),
  ),
);
await page.route("**/api/classify", (r) =>
  r.fulfill({
    status: 502,
    json: { error: "Deliberate upstream test failure" },
  }),
);
await page.getByRole("button", { name: "Classify sounds" }).click();
await page
  .getByRole("status")
  .filter({ hasText: "Deliberate upstream test failure" })
  .waitFor();
assert(
  (await page.locator(".hit-row").allTextContents()).every((t) =>
    t.includes("Snare"),
  ),
);
await page.locator("input[type=file]").setInputFiles({
  name: "not-audio.wav",
  mimeType: "audio/wav",
  buffer: Buffer.from("invalid audio"),
});
await page.waitForFunction(() =>
  document.querySelector("[role=status]")?.textContent.includes("decode"),
);
assert.equal(await page.locator(".hit-row").count(), 4);
await page.keyboard.press("1");
await page.waitForFunction(() => document.querySelector(".pad.active"));
await page.getByRole("button", { name: "How it works" }).click();
await page
  .getByRole("heading", { name: "Your groove, without the grid." })
  .waitFor();
await browser.close();
console.log(
  "Upload, error recovery, keyboard pads, and mocked TypeSafe success/failure passed.",
);
