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

interface CurveSetInput {
  id: string;
  source: string;
  curves: Partial<Record<Exclude<CurveKind, "spl_stacked">, { file: string; note?: string }>>;
  stacked?: { count: number; file: string; note?: string }[];
}

function loadCsv(slug: string, file: string, kind: CurveKind) {
  const raw = csvFiles[`/data/enclosures/${slug}/${file}`];
  if (raw == null) return null;
  const parsed = parseCurveCsv(raw);
  if (kind === "spl" && parsed.value.length > 0) {
    const peak = Math.max(...parsed.value);
    if (peak > 120) {
      throw new Error(
        `${slug}/${file}: spl peak ${peak.toFixed(1)} dB exceeds 120 dB, ` +
          `this is not a 1W/1m sim (check input voltage/power reference)`
      );
    }
  }
  return parsed;
}

// One curve-set object already is one physical thing (one simulation run or one measurement
// session): no more grouping-by-id needed, unlike the old flat-row shape.
function loadCurveSet(slug: string, cs: CurveSetInput, driverProfile: string): DriverCurves {
  const dc: DriverCurves = {
    id: cs.id,
    driverProfile,
    source: cs.source,
    curves: {},
    stacked: {},
    notes: {},
  };
  for (const [kind, entry] of Object.entries(cs.curves) as [
    Exclude<CurveKind, "spl_stacked">,
    { file: string; note?: string } | undefined,
  ][]) {
    if (!entry) continue;
    const parsed = loadCsv(slug, entry.file, kind);
    if (parsed == null) continue;
    dc.curves[kind] = parsed;
    if (entry.note) dc.notes[kind] = entry.note;
  }
  for (const s of cs.stacked ?? []) {
    const parsed = loadCsv(slug, s.file, "spl_stacked");
    if (parsed == null) continue;
    dc.stacked[s.count] = { curve: parsed, note: s.note };
  }
  return dc;
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
    simulations: data.driverProfiles.flatMap((p) =>
      p.simulations.map((cs) => loadCurveSet(entry.id, cs, p.id))
    ),
    measurements: data.driverProfiles.flatMap((p) =>
      p.measurements.map((cs) => loadCurveSet(entry.id, cs, p.id))
    ),
    driverProfiles: data.driverProfiles.map((p) => ({ id: p.id })),
  };

  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
  });
};
