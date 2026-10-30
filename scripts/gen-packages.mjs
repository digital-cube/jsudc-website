#!/usr/bin/env node
/**
 *   node scripts/gen-packages.mjs        (npm run gen; build, dev and check run it first)
 *
 * The Packages section's data, read at build time so the page never states a
 * version by hand:
 *
 *   src/generated/packages.json                    per package, from https://registry.npmjs.org/@jsudc%2F<name>:
 *                                                  the latest version, its date, every published version,
 *                                                  description, licence, repository, peers
 *   src/content/docs/packages/changelogs/<name>.md that repository's CHANGELOG.md at the tag of the
 *                                                  latest version (v<version>), as a page
 *
 * Both are git-ignored. A registry or GitHub that does not answer fails the
 * build: a Packages page with no versions is worse than no deploy.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "src", "generated", "packages.json");
const CHANGELOGS = join(ROOT, "src", "content", "docs", "packages", "changelogs");
const ORG = "digital-cube";

/** In the order the page lists them. */
const PACKAGES = ["core", "server", "react"];

async function get(url, as) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    headers: { accept: as === "json" ? "application/json" : "text/plain" },
  });
  if (!res.ok) throw new Error(`gen-packages: ${url} answered ${res.status}`);
  return as === "json" ? res.json() : res.text();
}

const repoUrl = (meta, name) =>
  (meta.repository?.url ?? `https://github.com/${ORG}/jsudc-${name}`)
    .replace(/^git\+/, "")
    .replace(/\.git$/, "");

const packages = [];
await rm(CHANGELOGS, { recursive: true, force: true });
await mkdir(CHANGELOGS, { recursive: true });

for (const [i, name] of PACKAGES.entries()) {
  const npmName = `@jsudc/${name}`;
  const meta = await get(`https://registry.npmjs.org/${encodeURIComponent(npmName)}`, "json");
  const latest = meta["dist-tags"].latest;
  const manifest = meta.versions[latest];
  const repo = repoUrl(meta, name);
  // Only releases: a prerelease such as 0.0.0-stage is a pipeline test, not a version to list.
  const versions = Object.keys(meta.versions)
    .filter((v) => !v.includes("-"))
    .map((v) => ({ version: v, date: meta.time[v]?.slice(0, 10) ?? null }))
    .reverse();

  const raw = repo.replace("https://github.com/", "https://raw.githubusercontent.com/");
  const changelog = await get(`${raw}/v${latest}/CHANGELOG.md`, "text");
  // The page has its own title; the file's `# Changelog` would be a second one.
  const body = changelog.replace(/^#\s+Changelog\s*\n/, "");
  await writeFile(
    join(CHANGELOGS, `${name}.md`),
    [
      "---",
      `title: ${JSON.stringify(`${npmName} changelog`)}`,
      `description: ${JSON.stringify(`Every release of ${npmName}, from CHANGELOG.md of ${repo.replace("https://github.com/", "")} at v${latest}.`)}`,
      "sidebar:",
      `  label: ${JSON.stringify(`${npmName} changelog`)}`,
      `  order: ${10 + i}`,
      "editUrl: false",
      "---",
      "",
      `<!-- Written by scripts/gen-packages.mjs from ${raw}/v${latest}/CHANGELOG.md. Do not edit: the build rewrites it. -->`,
      "",
      `:::note[From the repository]`,
      `[\`CHANGELOG.md\`](${repo}/blob/v${latest}/CHANGELOG.md) of [${repo.replace("https://github.com/", "")}](${repo}) at \`v${latest}\`, the version on npm, fetched when this site was built.`,
      ":::",
      "",
      body,
    ].join("\n"),
  );

  packages.push({
    name: npmName,
    short: name,
    description: manifest.description ?? meta.description ?? "",
    latest,
    date: meta.time[latest]?.slice(0, 10) ?? null,
    versions,
    license: manifest.license ?? meta.license ?? null,
    repository: repo,
    npm: `https://www.npmjs.com/package/${npmName}`,
    changelog: `/packages/changelogs/${name}/`,
    peers: Object.keys(manifest.peerDependencies ?? {}),
    optionalPeers: Object.entries(manifest.peerDependenciesMeta ?? {})
      .filter(([, m]) => m.optional)
      .map(([p]) => p),
  });
}

await mkdir(dirname(DATA), { recursive: true });
await writeFile(
  DATA,
  `${JSON.stringify({ fetched_at: new Date().toISOString(), packages }, null, 2)}\n`,
);
console.log(
  `gen-packages: ${packages.map((p) => `${p.name}@${p.latest}`).join(", ")} → src/generated/packages.json, ${packages.length} changelogs`,
);
