import type { APIRoute } from "astro";
import { LOCALES } from "../i18n";
import { renderOgImage } from "../lib/og-image";

export function getStaticPaths() {
  return LOCALES.map((locale) => ({ params: { locale } }));
}

export const GET: APIRoute = async ({ params }) => {
  const png = await renderOgImage(params.locale as string);
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
