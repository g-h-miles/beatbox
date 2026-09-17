import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const base = process.env.UI_URL || "http://127.0.0.1:5186",
  root = process.env.AVP_DATASET_DIR || "artifacts/avp-full/AVP_Dataset",
  out = "artifacts/hybrid-ui";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(),
  reports = [];
let lastRequest = 0;
for (const rate of [44100, 48000])
  for (const sound of ["Improvisation", "Kick"]) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1080 },
    });
    page.setDefaultTimeout(120000);
    const assets = [],
      calls = [],
      errors = [];
    await page.addInitScript((rate) => {
      window.rates = [];
      const AC = AudioContext;
      window.AudioContext = class extends AC {
        constructor(...args) {
          super({ ...args[0], sampleRate: rate });
          window.rates.push(this.sampleRate);
        }
      };
    }, rate);
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (r.url().includes("relative-model"))
        assets.push({ url: r.url(), status: r.status() });
    });
    await page.route("**/api/**", async (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname;
      if (path === "/api/classify") {
        await new Promise((r) =>
          setTimeout(r, Math.max(0, 2400 - (Date.now() - lastRequest))),
        );
        lastRequest = Date.now();
      }
      const res = await fetch("https://beatbox.grahammiles.me" + path, {
        method: req.method(),
        headers: {
          "Content-Type": "application/json",
          Origin: "https://beatbox.grahammiles.me",
        },
        ...(req.method() === "POST" ? { body: req.postData() } : {}),
      });
      const text = await res.text();
      calls.push({
        path,
        status: res.status,
        ...(path === "/api/classify"
          ? { request: req.postDataJSON(), response: JSON.parse(text) }
          : {}),
      });
      await route.fulfill({
        status: res.status,
        contentType: "application/json",
        body: text,
      });
    });
    await page.goto(base);
    await page
      .locator("input[type=file]")
      .setInputFiles(`${root}/Fixed/Participant_15/P15_${sound}_Fixed.wav`);
    await page.getByRole("status").filter({ hasText: "hits found" }).waitFor();
    const times = await page
      .locator(".hit-row > span:nth-child(2)")
      .allTextContents();
    await page.getByRole("button", { name: "Classify sounds" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Classification complete" })
      .waitFor();
    assert.deepEqual(
      await page.locator(".hit-row > span:nth-child(2)").allTextContents(),
      times,
    );
    assert(calls.every((c) => c.status === 200));
    assert.deepEqual(errors, []);
    const texts = await page.locator(".hit-row").allTextContents(),
      suggested = texts.filter((t) => t.includes("Suggested")).length;
    if (sound === "Kick") {
      assert.equal(assets.length, 0);
      assert.equal(suggested, 0);
    } else {
      assert(assets.some((a) => a.status === 200));
      assert(suggested > 0);
    }
    const result = {
      rate,
      actualRates: await page.evaluate(() => window.rates),
      sound,
      hits: times.length,
      suggested,
      assets,
      calls,
      errors,
    };
    reports.push(result);
    await page.screenshot({
      path: `${out}/gate-${sound}-${rate}.png`,
      fullPage: true,
    });
    console.log(
      JSON.stringify({ rate, sound, hits: times.length, suggested, assets }),
    );
    await page.close();
  }
writeFileSync(`${out}/gate-report.json`, JSON.stringify(reports, null, 2));
await browser.close();
