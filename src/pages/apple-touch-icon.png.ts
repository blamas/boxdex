import { Resvg } from "@resvg/resvg-js";
import type { APIRoute } from "astro";
// `?raw` avoids a filesystem read, which breaks once Astro bundles this away from public/.
import svg from "../../public/favicon.svg?raw";

export const GET: APIRoute = () => {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 180 } });
  const png = resvg.render().asPng();
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
