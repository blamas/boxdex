import type { CollectionEntry } from "astro:content";
import { getCollection } from "astro:content";
import type { APIRoute, GetStaticPaths } from "astro";
import { type CurveKind, parseCurveCsv } from "../../../lib/csv";
import type { DriverCurves } from "../../../lib/curves";

interface Props {
  entry: CollectionEntry<"enclosures">;
}

const csvFiles = import.meta.glob("/data/enclosures/**/*.csv", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function loadCurves(
  slug: string,
  entries: { driver: { id: string }; kind: string; source: string; file: string }[]
): DriverCurves[] {
  // Group entries by driver, preserving first-seen source per driver
  const map = new Map<string, DriverCurves>();
  for (const entry of entries) {
    const driverId = entry.driver.id;
    if (!map.has(driverId)) map.set(driverId, { driverId, source: entry.source, curves: {} });
    const key = `/data/enclosures/${slug}/${entry.file}`;
    const raw = csvFiles[key];
    if (raw == null) continue;
    const parsed = parseCurveCsv(raw);
    // biome-ignore lint/style/noNonNullAssertion: key was just set above
    map.get(driverId)!.curves[entry.kind as CurveKind] = parsed;
  }
  return [...map.values()];
}

export const getStaticPaths: GetStaticPaths = async () => {
  const enclosures = await getCollection("enclosures");
  return enclosures.map((entry) => ({
    params: { slug: entry.id },
    props: { entry },
  }));
};

export const GET: APIRoute = async ({ props }) => {
  const { entry } = props as Props;
  const data = entry.data;

  const payload = {
    slug: entry.id,
    name: data.name,
    simulations: loadCurves(entry.id, data.simulations),
    measurements: loadCurves(entry.id, data.measurements),
  };

  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
  });
};
