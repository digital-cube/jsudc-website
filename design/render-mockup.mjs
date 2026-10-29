#!/usr/bin/env node
// Renders design/home-mockup.html to design/home-mockup-<theme>.png (1440 wide, full page).
// SHOTS_CHANNEL=chrome uses the installed Google Chrome, as in scripts/shots.mjs.
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(join(here, "home-mockup.html")).href;
const browser = await chromium.launch({ channel: process.env.SHOTS_CHANNEL || undefined });
for (const theme of ["light", "dark"]) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  await page.goto(url);
  await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
  await page.evaluate(() => document.fonts.ready);
  for (const img of await page.locator("img").all()) {
    await img.evaluate((i) => i.complete || new Promise((r) => i.addEventListener("load", r)));
  }
  await page.evaluate((t) => {
    for (const i of document.querySelectorAll("img"))
      i.src = i.src.replace(/-(light|dark)\.webp$/, `-${t}.webp`);
  }, theme);
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(here, `home-mockup-${theme}.png`), fullPage: true });
  await page.close();
}
await browser.close();
