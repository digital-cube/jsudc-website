// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightLinksValidator from "starlight-links-validator";

export default defineConfig({
  site: "https://jsudc.dev",
  integrations: [
    starlight({
      title: "jsudc",
      description:
        "Universal Data Collections: describe a collection once, serve it with @jsudc/server and get its table, board, calendar, map, tree, chart and forms with @jsudc/react.",
      logo: { src: "./src/assets/logo.svg", replacesTitle: false },
      favicon: "/favicon.svg",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/digital-cube" }],
      customCss: ["@fontsource-variable/inter", "./src/styles/theme.css"],
      sidebar: [{ label: "Get started", items: [{ autogenerate: { directory: "get-started" } }] }],
      plugins: [starlightLinksValidator()],
      lastUpdated: false,
    }),
  ],
});
