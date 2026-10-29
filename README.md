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

## Licence

MIT, see [LICENSE](LICENSE).
