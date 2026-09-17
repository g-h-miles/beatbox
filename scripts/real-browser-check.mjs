import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const browser = await chromium.launch();
const page = await browser.newPage({
  acceptDownloads: true,
  viewport: { width: 1440, height: 1100 },
});
const responses = [];
page.on("response", async (r) => {
  if (r.url().endsWith("/api/classify")) responses.push(await r.json());
});
await page.goto("https://beatbox.grahammiles.me");
await page
  .locator("input[type=file]")
  .setInputFiles("artifacts/avp/P8_Improvisation_Personal.wav");
await page.waitForFunction(
  () => document.querySelectorAll(".hit-row").length === 49,
);
// Explicit calibration: one closed hat, one representative kick, one open hat.
for (const [index, label] of [
  [0, "closed"],
  [5, "kick"],
  [39, "open"],
]) {
  await page.locator(".hit-row").nth(index).click();
  await page.getByLabel("Sound", { exact: true }).selectOption(label);
}
await page.getByRole("button", { name: "Classify with TypeSafe" }).click();
await page
  .getByRole("status")
  .filter({ hasText: "TypeSafe pass complete" })
  .waitFor({ timeout: 90000 });
const rows = await page.locator(".hit-row").allTextContents();
writeFileSync(
  "artifacts/p8-live-browser.json",
  JSON.stringify({ calibrationIndices: [0, 5, 39], rows, responses }, null, 2),
);
const promise = page.waitForEvent("download");
await page.getByRole("button", { name: "Download MIDI" }).click();
await (await promise).saveAs("artifacts/real-beatbox.mid");
await page.screenshot({
  path: "artifacts/real-beatbox-browser.png",
  fullPage: true,
});
const truth = JSON.parse(readFileSync("artifacts/p8-evaluation.json", "utf8"));
const mapping = { kd: "Kick", sd: "Snare", hhc: "Closed hat", hho: "Open hat" };
let correct = 0,
  total = 0;
for (let i = 0; i < rows.length; i++) {
  if (truth.hits[i].truth) {
    total++;
    if (rows[i].includes(mapping[truth.hits[i].truth.label])) correct++;
  }
}
console.log("Real browser calibrated result:", { correct, total });
await page.getByLabel("Performance", { exact: true }).selectOption("syllables");
await page
  .locator("input[type=file]")
  .setInputFiles("artifacts/boots-and-cats.wav");
await page.waitForFunction(
  () => document.querySelectorAll(".hit-row").length === 8,
);
await page.getByRole("button", { name: "Classify with TypeSafe" }).click();
await page
  .getByRole("status")
  .filter({ hasText: "TypeSafe pass complete" })
  .waitFor({ timeout: 90000 });
const words = await page.locator(".hit-row").allTextContents();
console.log("Spoken word labels:", words);
const p = page.waitForEvent("download");
await page.getByRole("button", { name: "Download MIDI" }).click();
await (await p).saveAs("artifacts/boots-and-cats.mid");
writeFileSync(
  "artifacts/boots-live-browser.json",
  JSON.stringify({ words, responses: responses.slice(-1) }, null, 2),
);
await browser.close();
