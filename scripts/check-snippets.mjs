#!/usr/bin/env node
/**
 *   npm run check:snippets
 *
 * Every TypeScript snippet the site shows lives in snippets/ and is imported
 * into the pages raw, so the docs cannot drift from the API without this
 * failing:
 *
 *   1. no .md/.mdx page has a ts/tsx/js fence of its own (code comes from snippets/);
 *   2. a scratch project in .snippets/ installs @jsudc/* the way a reader would,
 *      with the peers the quick starts name, and `tsc --noEmit` compiles every
 *      snippet against them;
 *   3. the home page's abridged collection (src/home/repos) passes @jsudc/core's schemas;
 *   4. the server quick start is started for real on a free port and answers a
 *      `list` of the books collection with `udc.list.ok`; with SNIPPETS_DATABASE_URL
 *      (a scratch database) the full-stack seed.ts and server.ts run against Postgres too.
 *
 * SNIPPETS_FROM  npm    the published packages (default)
 *                local  `npm pack` of the sibling checkouts ../jsudc-{core,server,react}
 *                       (SNIPPETS_LIBS=<dir> to look elsewhere): the code about to be released
 */
import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SNIPPETS = join(ROOT, "snippets");
const WORK = join(ROOT, ".snippets");
const FROM = process.env.SNIPPETS_FROM || "npm";
const LIBS = process.env.SNIPPETS_LIBS || join(ROOT, "..");
const PACKAGES = ["core", "server", "react"];

/** What the quick starts tell a reader to install next to @jsudc/*. */
const PEERS = {
  fastify: "^5",
  zod: "^4",
  "drizzle-orm": "^0.45",
  pg: "^8",
  react: "^19",
  "react-dom": "^19",
  "@tanstack/react-query": "^5",
  "radix-ui": "^1",
  "lucide-react": "*",
  "@tanstack/react-table": "^8",
  leaflet: "^1.9",
  recharts: "^3",
  "@dnd-kit/core": "^6",
  "@dnd-kit/sortable": "^10",
  "@dnd-kit/utilities": "^3",
  vite: "*",
  "@vitejs/plugin-react": "*",
  typescript: "^5.9",
  "@types/node": "^24",
  "@types/react": "^19",
  "@types/react-dom": "^19",
  // check-snippets' own: parses the YAML it validates
  yaml: "^2",
};

const failures = [];
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} exited ${r.status}`);
};
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );

// --- 1. no inline code in the pages -----------------------------------------------------
for (const file of walk(join(ROOT, "src", "content"))) {
  if (!/\.mdx?$/.test(file)) continue;
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/^```(ts|tsx|js|jsx|typescript|javascript)\b/gm)) {
    const line = text.slice(0, m.index).split("\n").length;
    failures.push(`${relative(ROOT, file)}:${line}: a \`\`\`${m[1]} fence; put it in snippets/`);
  }
}

// --- 2. compile -------------------------------------------------------------------------
mkdirSync(WORK, { recursive: true });
let specs;
if (FROM === "npm") {
  specs = Object.fromEntries(PACKAGES.map((p) => [`@jsudc/${p}`, "latest"]));
} else if (FROM === "local") {
  const tarballs = join(WORK, "tarballs");
  rmSync(tarballs, { recursive: true, force: true });
  mkdirSync(tarballs);
  specs = {};
  for (const p of PACKAGES) {
    const dir = join(LIBS, `jsudc-${p}`);
    if (!existsSync(join(dir, "package.json"))) throw new Error(`no checkout at ${dir}`);
    // `npm pack` runs the package's prepare (its build), as an install from git would.
    const r = spawnSync("npm", ["pack", dir, "--pack-destination", tarballs, "--loglevel=error"], {
      stdio: ["ignore", "ignore", "inherit"],
    });
    if (r.status !== 0) throw new Error(`npm pack ${dir} failed`);
    const tgz = readdirSync(tarballs).find(
      (f) => f.startsWith(`jsudc-${p}-`) && f.endsWith(".tgz"),
    );
    if (!tgz) throw new Error(`npm pack ${dir} wrote no jsudc-${p}-*.tgz`);
    specs[`@jsudc/${p}`] = `file:${join(tarballs, tgz)}`;
  }
} else {
  throw new Error(`SNIPPETS_FROM=${FROM}: npm or local`);
}

const pkg = {
  name: "jsudc-snippets",
  private: true,
  type: "module",
  dependencies: { ...specs, ...PEERS },
};
const pkgText = `${JSON.stringify(pkg, null, 2)}\n`;
const pkgFile = join(WORK, "package.json");
const fresh = !existsSync(pkgFile) || readFileSync(pkgFile, "utf8") !== pkgText || FROM === "local";
writeFileSync(pkgFile, pkgText);
if (fresh || !existsSync(join(WORK, "node_modules"))) {
  console.log(`installing @jsudc/* from ${FROM} into .snippets/`);
  run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: WORK });
}

const SRC = join(WORK, "src");
rmSync(SRC, { recursive: true, force: true });
cpSync(SNIPPETS, SRC, { recursive: true });
// What a Vite app's `vite/client` types give it: CSS imports.
writeFileSync(join(SRC, "env.d.ts"), 'declare module "*.css";\n');
writeFileSync(
  join(WORK, "tsconfig.json"),
  `${JSON.stringify(
    {
      compilerOptions: {
        target: "es2023",
        lib: ["es2023", "dom", "dom.iterable"],
        module: "preserve",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: ["node"],
        resolveJsonModule: true,
      },
      include: ["src"],
    },
    null,
    2,
  )}\n`,
);
const versions = Object.fromEntries(
  PACKAGES.map((p) => {
    const f = join(WORK, "node_modules", "@jsudc", p, "package.json");
    return [p, JSON.parse(readFileSync(f, "utf8")).version];
  }),
);
console.log(`tsc --noEmit over snippets/ against ${JSON.stringify(versions)}`);
const tsc = spawnSync(join(WORK, "node_modules", ".bin", "tsc"), ["-p", WORK], {
  stdio: "inherit",
});
if (tsc.status !== 0) failures.push("tsc --noEmit failed (above)");

// --- 3. the home page's collection files are valid documents ---------------------------
// src/home/repos is an abridged copy of the live example's repos collection.
const validate = spawnSync(
  process.execPath,
  [
    "--input-type=module",
    "-e",
    `import { readFileSync } from "node:fs";
     import { SchemaDocSchema, SourceConfigSchema, ViewConfigSchema } from "@jsudc/core";
     import { parse } from "yaml";
     const dir = process.argv[1];
     const read = (f) => readFileSync(dir + "/" + f, "utf8");
     SchemaDocSchema.parse(JSON.parse(read("schema.json")));
     ViewConfigSchema.parse(parse(read("view.yaml")));
     SourceConfigSchema.parse(parse(read("source.yaml")));`,
    join(ROOT, "src", "home", "repos"),
  ],
  { cwd: WORK, encoding: "utf8" },
);
if (validate.status === 0) console.log("src/home/repos: schema.json, view.yaml, source.yaml valid");
else failures.push(`src/home/repos is not a valid collection:\n${validate.stderr}`);

// --- 4. run the quick starts --------------------------------------------------------------
const freePort = () =>
  new Promise((resolve) => {
    const s = createServer().listen(0, () => {
      const { port } = /** @type {import("node:net").AddressInfo} */ (s.address());
      s.close(() => resolve(port));
    });
  });

/** Start `<dir>/server.ts` on a free port and expect the three books from a `list`. */
async function serveBooks(name, dir, env = {}) {
  const port = await freePort();
  const server = join(dir, "server.ts");
  writeFileSync(server, readFileSync(server, "utf8").replace("port: 5100", `port: ${port}`));
  const child = spawn(process.execPath, [server], {
    cwd: dir,
    env: { ...process.env, ...env },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (d) => {
    stderr += d;
  });
  try {
    let answer;
    for (let i = 0; i < 50 && !answer; i++) {
      await new Promise((r) => setTimeout(r, 200));
      answer = await fetch(`http://127.0.0.1:${port}/udc/list`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ collection: "books" }),
      })
        .then((r) => r.json())
        .catch(() => undefined);
    }
    if (answer?.kind === "udc.list.ok" && answer.payload.rows.length === 3) {
      console.log(`${name}: udc.list.ok, ${answer.payload.rows.length} books`);
    } else {
      failures.push(`${name}: ${JSON.stringify(answer)}\n${stderr}`);
    }
  } finally {
    child.kill();
  }
}

if (tsc.status === 0) {
  await serveBooks("server quick start", join(SRC, "server"));
  // The Postgres one needs a database it may write to: SNIPPETS_DATABASE_URL.
  const url = process.env.SNIPPETS_DATABASE_URL;
  if (url) {
    const dir = join(SRC, "full-stack");
    const seed = spawnSync(process.execPath, ["seed.ts"], {
      cwd: dir,
      env: { ...process.env, DATABASE_URL: url },
      encoding: "utf8",
    });
    if (seed.status === 0) {
      console.log(`full-stack seed: ${seed.stdout.trim()}`);
      await serveBooks("full-stack server", dir, { DATABASE_URL: url });
    } else failures.push(`full-stack seed.ts failed:\n${seed.stderr}`);
  } else {
    console.log("full-stack: not run (set SNIPPETS_DATABASE_URL to a scratch database)");
  }
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n${failures.map((f) => `  ${f}`).join("\n")}`);
  process.exit(1);
}
console.log("snippets ok");
