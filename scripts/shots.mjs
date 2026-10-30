#!/usr/bin/env node
/**
 *   npm run shots [-- <name> ...]
 *
 * The home page's renderer strip: one screenshot of the live example per view,
 * in the light and the dark theme, cropped to the data view (the example's
 * <main>, without its sidebar), written as src/assets/renderers/<name>-<theme>.webp.
 * And the Examples pages: one per example route, the whole window (the header's
 * brand switch is part of the point), as src/assets/examples/<name>-<theme>.webp.
 * Re-run it whenever the example or the library's look changes; the site
 * imports the files, so a build after it picks them up.
 *
 * SHOTS_BASE   the example to shoot (default EXAMPLE_URL from src/site.mjs)
 * SHOTS_SCALE  device pixel ratio (default 2)
 * SHOTS_CHANNEL  a browser Playwright did not download, e.g. `chrome` for the
 *              installed Google Chrome (default: Playwright's own Chromium,
 *              `npx playwright install chromium` once)
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";
import { EXAMPLE_URL } from "../src/site.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(ROOT, "src", "assets");
const BASE = (process.env.SHOTS_BASE || EXAMPLE_URL).replace(/\/$/, "");
const SCALE = Number(process.env.SHOTS_SCALE || 2);
const VIEWPORT = { width: 1280, height: 800 };
const THEMES = ["light", "dark"];

/**
 * One entry per frame of the strip, in its order, then one per example route.
 * `path` opens the renderer's tab; `prepare` runs on the loaded page before the
 * shot (the schema editor is a dialog of the table, not a tab). `dir` is the
 * folder under src/assets (default `renderers`); `window` shoots the whole
 * viewport instead of <main>.
 */
const SHOTS = [
  { name: "table", path: "/udc/companies?tab=table" },
  { name: "cards", path: "/udc/repos?tab=cards" },
  { name: "kanban", path: "/udc/tickets?tab=kanban" },
  { name: "calendar", path: "/udc/appointments?tab=calendar" },
  {
    name: "tree",
    path: "/udc/org?tab=tree",
    // The org chart opens one level deep; open the first few departments too.
    prepare: async (page) => {
      for (let i = 0; i < 3; i++) {
        const closed = page.locator('main [role="treeitem"][aria-expanded="false"]').first();
        if (!(await closed.count())) break;
        await closed.focus();
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(300);
      }
    },
  },
  { name: "map", path: "/udc/flights?tab=map", settle: 2500 },
  // Earthquakes, not the server metrics: the metrics are seeded for a fixed day and
  // their window follows the clock, so it runs empty; the quakes are live.
  { name: "chart", path: "/udc/quakes?tab=chart", settle: 1500 },
  {
    name: "schema-editor",
    path: "/udc/companies?tab=table",
    prepare: async (page) => {
      await page.getByRole("button", { name: "Add column", exact: true }).click();
      await page.getByRole("dialog").waitFor();
      await page.getByRole("textbox", { name: "Field name" }).fill("website");
    },
  },
  // The example routes (jsudc-example /examples): `?brand=` picks the brand on arrival
  // and stores it, so each shot names its own.
  {
    name: "default-kit",
    dir: "examples",
    window: true,
    path: "/udc/companies?tab=table&brand=default",
  },
  {
    name: "brand-restyle",
    dir: "examples",
    window: true,
    path: "/udc/companies?tab=table&brand=acme",
  },
  { name: "examples-page", dir: "examples", window: true, path: "/examples?brand=default" },
];

const only = process.argv.slice(2);
const shots = only.length ? SHOTS.filter((s) => only.includes(s.name)) : SHOTS;
if (only.length && shots.length !== only.length) {
  console.error(`unknown shot; known: ${SHOTS.map((s) => s.name).join(", ")}`);
  process.exit(2);
}

for (const dir of new Set(shots.map((s) => s.dir ?? "renderers"))) {
  await mkdir(join(ASSETS, dir), { recursive: true });
}
const browser = await chromium.launch({ channel: process.env.SHOTS_CHANNEL || undefined });
try {
  for (const theme of THEMES) {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: SCALE,
      colorScheme: theme,
      locale: "en-GB",
      timezoneId: "Europe/Belgrade",
    });
    // The example keeps its theme and language in localStorage (@jsudc/react's
    // THEME_STORAGE_KEY); set both before any of its scripts run.
    await context.addInitScript((t) => {
      localStorage.setItem("udc-theme", t);
      localStorage.setItem("udc-locale", "en");
      localStorage.setItem("udc-tz", "Europe/Belgrade");
    }, theme);
    const page = await context.newPage();
    for (const shot of shots) {
      await page.goto(BASE + shot.path, { waitUntil: "networkidle" });
      const main = page.locator("main");
      await main.waitFor();
      // Skeletons gone = the first page of rows has drawn.
      await page
        .locator(".udc-skeleton")
        .first()
        .waitFor({ state: "detached", timeout: 15_000 })
        .catch(() => {});
      if (shot.prepare) await shot.prepare(page);
      // No focus ring from the steps above, unless a dialog holds the focus.
      if (!(await page.getByRole("dialog").count())) {
        await page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement)?.blur());
      }
      await page.waitForTimeout(shot.settle ?? 800);
      const clip = shot.window ? { x: 0, y: 0, ...VIEWPORT } : await main.boundingBox();
      if (!clip) throw new Error(`${shot.name}: <main> has no box`);
      const png = await page.screenshot({ clip, animations: "disabled", caret: "hide" });
      const file = join(ASSETS, shot.dir ?? "renderers", `${shot.name}-${theme}.webp`);
      await sharp(png).webp({ quality: 82 }).toFile(file);
      console.log(`${theme.padEnd(5)} ${shot.name.padEnd(13)} ${BASE}${shot.path}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
