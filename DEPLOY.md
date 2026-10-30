# Deploying jsudc.dev

Stage (<https://stage.jsudc.dev>) is served from the live example's VM by
`deploy/stage.sh`; see _Deploy: stage_ in the README.

Production (<https://jsudc.dev>) is served from `digitalcube-production-websites`
by `deploy/prod.sh`; see _Deploy: production_ in the README. The rest of this page
is the alternative that is not in use: a hosted static platform.

Two workflows are ready and both are off: each runs only when the repository
variable `DEPLOY_TARGET` names it. Until a host is chosen the site is
`npm run build` + `npm run preview`.

| Host             | `DEPLOY_TARGET`    | Also needed                                                                                                                                                                                                                                                                                         |
| ---------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare Pages | `cloudflare-pages` | a Pages project `jsudc-website` (direct upload); secrets `CLOUDFLARE_API_TOKEN` (permission _Cloudflare Pages: Edit_) and `CLOUDFLARE_ACCOUNT_ID`; the custom domain `jsudc.dev` added in the Pages project (automatic when the zone is on Cloudflare, else a `CNAME` to `jsudc-website.pages.dev`) |
| GitHub Pages     | `github-pages`     | Settings → Pages → Source _GitHub Actions_; the repository public (or a plan with private Pages); custom domain `jsudc.dev` in Settings → Pages, DNS `A`/`AAAA` records to GitHub's Pages addresses for the apex                                                                                    |

```sh
gh variable set DEPLOY_TARGET --repo digital-cube/jsudc-website --body cloudflare-pages
gh secret set CLOUDFLARE_API_TOKEN --repo digital-cube/jsudc-website
gh secret set CLOUDFLARE_ACCOUNT_ID --repo digital-cube/jsudc-website
```

Then push to `main` (or run the workflow by hand from the Actions tab).
