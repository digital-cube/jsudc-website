# jsudc-website

The website of the jsudc libraries, [`@jsudc/core`](https://github.com/digital-cube/jsudc-core),
[`@jsudc/server`](https://github.com/digital-cube/jsudc-server) and
[`@jsudc/react`](https://github.com/digital-cube/jsudc-react): **jsudc.dev**.

Astro + Starlight, MDX content under `src/content/docs` (the sidebar follows the
directory tree), Pagefind search, dark and light themes from the library's own
tokens (`src/styles/theme.css`).

```sh
nvm use            # Node from .nvmrc
npm ci
npm run dev        # http://localhost:4321
npm run build      # dist/, fails on a broken internal link
npm run preview    # serves dist/
npm run check      # astro check
npm run lint       # biome
npm run gen        # the generated pages alone (dev, build and check run it first)
```

## Generated pages

Two sections are written at build time and are not in git (`.gitignore`):

- **Reference** (`src/content/docs/reference/`): `scripts/gen-reference.mjs` imports the
  installed `@jsudc/core` (pinned in `package.json`) and walks its exported Zod schemas: keys,
  types, optional and default, the constraints `z.toJSONSchema` reports, the JSDoc the package
  ships in `dist/*.js` above every schema and key, the messages of its refinements, and its
  registries (`ACTIONS`, the `filter` builders, `filterableForType`, `RENDERER_NAMES`,
  `SOURCE_KINDS`). Each page states the version it came from. To move the reference to a new
  release, bump `@jsudc/core` and build; nothing is edited by hand.
- **Changelogs and versions** (`src/content/docs/packages/changelogs/`,
  `src/generated/packages.json`): `scripts/gen-packages.mjs` reads
  `https://registry.npmjs.org/@jsudc%2F<name>` and each repository's `CHANGELOG.md` at the tag of
  the version on npm. It needs the network; a registry or GitHub that does not answer fails the
  build.

## Screenshots

The home page's renderer strip and the Examples pages are real screenshots of the live example
(<https://examples.stage.jsudc.dev>), light and dark: one per view into
`src/assets/renderers/`, one per example route into `src/assets/examples/`:

```sh
npx playwright install chromium   # once (or SHOTS_CHANNEL=chrome for the installed Chrome)
npm run shots                     # every shot
npm run shots -- default-kit brand-restyle examples-page   # the Examples pages only
SHOTS_BASE=http://localhost:5173 npm run shots   # against a local example
```

## Deploy: stage

<https://stage.jsudc.dev> is static files served by nginx on the VM of the live
example (igor.digitalcube.work; TLS ends at the edge in front of it). On that VM,
from any copy of this repository:

```sh
deploy/stage.sh --install   # once: links deploy/nginx/stage.jsudc.dev.conf into sites-enabled, reloads nginx, deploys
deploy/stage.sh             # every deploy: builds main (v1 until main exists) and swaps it in
```

It builds into `/home/digital/sites/stage.jsudc.dev/releases/<short sha>` with
`SITE_URL=https://stage.jsudc.dev`, repoints the `current` symlink nginx serves,
keeps the last three releases and fails unless the site answers 200. Re-running it
with nothing new rebuilds nothing. `deploy/stage.sh --help` has the options.

The build reads two variables (`src/site.mjs`): `SITE_URL`, the site's own origin
(default `https://jsudc.dev`), and `EXAMPLE_URL`, where every live-example link
points (default `https://examples.jsudc.dev`; `deploy/stage.sh` passes
`https://examples.stage.jsudc.dev`).

## Licence

MIT, see [LICENSE](LICENSE).
