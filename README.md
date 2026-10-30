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
```

## Renderer screenshots

The home page's renderer strip is real screenshots of the live example
(<https://jsudc.igor.digitalcube.work>), one per view, light and dark:

```sh
npx playwright install chromium   # once
npm run shots                     # writes src/assets/renderers/*.png
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
points (default `https://jsudc.igor.digitalcube.work`).

## Licence

MIT, see [LICENSE](LICENSE).
