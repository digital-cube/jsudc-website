/*
 * Where the site lives and where its live example lives, read once from the
 * environment at build time. astro.config.mjs, the components and the content
 * import these instead of spelling a host, so one build command serves stage
 * and production:
 *
 *   SITE_URL     the site's own origin, Astro's `site` (default https://jsudc.dev)
 *   EXAMPLE_URL  the live example every "live example" link opens and
 *                scripts/shots.mjs photographs (default https://jsudc.igor.digitalcube.work)
 */
const origin = (value, fallback) => (value || fallback).replace(/\/+$/, "");

export const SITE_URL = origin(process.env.SITE_URL, "https://jsudc.dev");
export const EXAMPLE_URL = origin(process.env.EXAMPLE_URL, "https://jsudc.igor.digitalcube.work");
