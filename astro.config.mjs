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
      components: {
        Hero: "./src/components/Hero.astro",
        SocialIcons: "./src/components/SocialIcons.astro",
      },
      expressiveCode: {
        themes: ["github-dark-default", "github-light-default"],
        // wrapped lines keep their indentation; no code block scrolls sideways
        defaultProps: { wrap: true, preserveIndent: true },
        styleOverrides: {
          borderRadius: "12px",
          borderColor: "var(--jsudc-border-strong)",
          codeFontSize: "0.8125rem",
          codeLineHeight: "1.7",
          frames: { shadowColor: "transparent" },
        },
      },
      customCss: ["@fontsource-variable/inter", "./src/styles/theme.css"],
      sidebar: [{ label: "Get started", items: [{ autogenerate: { directory: "get-started" } }] }],
      plugins: [starlightLinksValidator()],
      lastUpdated: false,
    }),
  ],
});
