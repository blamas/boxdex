import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
// `?raw`: a fs read here breaks once Astro bundles this away from public/.
import iconSvg from "../../public/favicon-iso.svg?raw";
import { type Translations, useTranslations } from "../i18n";

const require = createRequire(import.meta.url);

// satori only reads TTF/OTF/WOFF (no WOFF2), fontsource ships .woff alongside .woff2.
const fontRegular = readFileSync(
  require.resolve("@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff")
);
const fontBold = readFileSync(
  require.resolve("@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff")
);

// satori has no native <svg> path support, but happily renders an <img> background.
const ICON_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString("base64")}`;

interface OgCopy {
  titleRest: Translations["meta"]["titleRest"];
  desc: Translations["meta"]["ogDescription"];
}

function buildTree(copy: OgCopy) {
  return {
    type: "div",
    props: {
      style: {
        width: "1200px",
        height: "630px",
        background: "#0d1117",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "32px",
      },
      children: [
        { type: "img", props: { src: ICON_DATA_URI, width: 130, height: 130 } },
        {
          type: "div",
          props: {
            style: {
              fontFamily: "JetBrains Mono",
              fontWeight: 700,
              fontSize: "44px",
              letterSpacing: "-0.01em",
              display: "flex",
            },
            children: [
              { type: "span", props: { style: { color: "#c9d1d9" }, children: "Box" } },
              { type: "span", props: { style: { color: "#39ff14" }, children: "dex" } },
              { type: "span", props: { style: { color: "#c9d1d9" }, children: copy.titleRest } },
            ],
          },
        },
        {
          type: "div",
          props: {
            style: {
              fontFamily: "JetBrains Mono",
              fontWeight: 400,
              fontSize: "24px",
              color: "#8b949e",
            },
            children: copy.desc,
          },
        },
      ],
    },
  };
}

export async function renderOgImage(locale: string): Promise<Buffer> {
  const meta = useTranslations(locale).meta;
  const copy: OgCopy = { titleRest: meta.titleRest, desc: meta.ogDescription };
  const svg = await satori(
    // biome-ignore lint/suspicious/noExplicitAny: satori's object-syntax nodes aren't typed without a JSX pragma
    buildTree(copy) as any,
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "JetBrains Mono", data: fontRegular, weight: 400, style: "normal" },
        { name: "JetBrains Mono", data: fontBold, weight: 700, style: "normal" },
      ],
    }
  );
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } });
  return resvg.render().asPng();
}
