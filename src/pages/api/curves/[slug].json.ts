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
  entries: { driver: { id: string }[]; kind: string; source: string; file: string; count?: number; note?: string }[]
): DriverCurves[] {
  // Group entries by sorted driver-id concat + count; deterministic across declaration order
  const map = new Map<string, DriverCurves>();
  for (const entry of entries) {
    const driverId = [...entry.driver.map((d) => d.id)].sort().join("+");
    const count = entry.count ?? 1;
    const mapKey = `${driverId}:c${count}`;
    if (!map.has(mapKey))
      map.set(mapKey, { driverId, count, note: entry.note, source: entry.source, curves: {} });
    const key = `/data/enclosures/${slug}/${entry.file}`;
    const raw = csvFiles[key];
    if (raw == null) continue;
    const parsed = parseCurveCsv(raw);
    if (entry.kind === "spl" && parsed.value.length > 0) {
      const peak = Math.max(...parsed.value);
      if (peak > 120) {
        throw new Error(
          `${slug}/${entry.file}: spl peak ${peak.toFixed(1)} dB exceeds 120 dB, ` +
            `this is not a 1W/1m sim (check input voltage/power reference)`
        );
      }
    }
    // biome-ignore lint/style/noNonNullAssertion: key was just set above
    map.get(mapKey)!.curves[entry.kind as CurveKind] = parsed;
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
