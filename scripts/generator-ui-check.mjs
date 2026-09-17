import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const baseUrl = process.argv[2] || "http://127.0.0.1:5197";
const output = process.env.BEATBOX_QA_OUTPUT || "artifacts/generator-ui";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
let calls = [];
await page.route("**/api/generate-step", async (route) => {
  const body = route.request().postDataJSON();
  calls.push(body);
  await new Promise((r) => setTimeout(r, 30));
  await route.fulfill({
    json: {
      step: {
        kick: body.history.length % 4 === 0 ? 104 : 0,
        snare: body.history.length % 8 === 4 ? 80 : 0,
        closed: body.history.length % 2 === 0 ? 56 : 0,
        open: 0,
        ride: 0,
        crash: 0,
        aux: 0,
      },
      inputTokens: 234,
    },
  });
});
await page.goto(`${baseUrl}/make`);
await page.screenshot({ path: path.join(output, "desktop.png") });
await page.getByRole("button", { name: "Make beat", exact: true }).click();
await page.getByRole("button", { name: "Make another beat" }).waitFor();
if (calls.length !== 16 || calls.some((c, i) => c.history.length !== i))
  throw Error("history chain broken");
await page.getByRole("button", { name: "Play loop", exact: true }).click();
await page.waitForTimeout(2900); // One full bar at 90 BPM; playback must still loop.
await page.getByRole("button", { name: "Stop", exact: true }).click();
const download = page.waitForEvent("download");
await page.getByRole("button", { name: "MIDI", exact: true }).click();
const file = await download;
await file.saveAs(path.join(output, "preview.mid"));
await page.getByRole("button", { name: "Kick, step 1:", exact: false }).click();
await page.screenshot({ path: path.join(output, "filled.png") });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: path.join(output, "mobile.png") });
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > innerWidth,
);
if (overflow) throw Error("page overflow");
await page.getByLabel("Length", { exact: true }).selectOption("64");
await page.getByRole("button", { name: "Make beat", exact: true }).click();
await page.waitForFunction(
  () =>
    Number(
      document
        .querySelector(".generator-foot")
        ?.textContent?.match(/(\d+) completed requests/)?.[1] || 0,
    ) > 0,
);
await page.getByRole("button", { name: "Stop generating" }).click();
await page.getByRole("button", { name: /Continue from step/ }).waitFor();
await page.getByRole("button", { name: /Continue from step/ }).click();
await page.getByRole("button", { name: "Make another beat" }).waitFor();
await page.screenshot({ path: path.join(output, "mobile64.png") });
await page.goto(baseUrl);
await page.getByRole("link", { name: "Make a beat" }).waitFor();
await page.screenshot({ path: path.join(output, "home-mobile.png") });
if (errors.length) throw Error(errors.join("\n"));
console.log(
  "PASS sequential history, generation, edit, playback, MIDI, cancel/resume, mobile overflow",
);
await browser.close();
