import { getCollection } from "astro:content";
import type { APIRoute } from "astro";
import { type EnclosureRecord, deriveMetrics, provenanceOf } from "../../lib/metrics";

export const GET: APIRoute = async () => {
  const [enclosures, driverEntries] = await Promise.all([
    getCollection("enclosures"),
    getCollection("drivers"),
  ]);

  // Only cone drivers carry a nominal size; compression drivers contribute no size facet.
  const driverSizeMap = new Map(
    driverEntries.flatMap((d) => (d.data.type === "cone" ? [[d.id, d.data.sizeInch] as const] : []))
  );

  const records: EnclosureRecord[] = enclosures
    .map((entry) => {
      const data = entry.data;
      const metrics = deriveMetrics({
        netVolumeL: data.netVolumeL,
        dims: data.dims,
        weightKg: data.weightKg,
        specs: data.specs,
      });

      const driverSizes = [
        ...new Set(
          data.drivers
            .map((ref) => driverSizeMap.get(ref.id))
            .filter((s): s is number => s !== undefined)
        ),
      ].sort((a, b) => a - b);

      return {
        slug: entry.id,
        name: data.name,
        category: data.category,
        topology: data.topology,
        topologyVariant: data.topologyVariant,
        driverCount: data.driverCount,
        drivers: data.drivers.map((ref) => ref.id),
        driverSizes,
        ways: data.ways,
        recommendedFor: data.recommendedFor,
        verified: data.verified,
        provenance: provenanceOf(data.measurements),
        buildComplexity: data.buildComplexity,
        hasPlans: data.plans.length > 0,
        hasMeasurements: data.measurements.length > 0,
        availableKinds: [
          ...new Set([
            ...data.simulations.map((s) => s.kind),
            ...data.measurements.map((m) => m.kind),
          ]),
        ],
        recommendedCrossoverHz: data.specs.recommendedCrossoverHz,
        coverageAngleDeg: data.specs.coverageAngleDeg,
        recommendedPowerW: data.specs.recommendedPowerW,
        powerAesW: data.specs.powerAesW,
        powerProgramW: data.specs.powerProgramW,
        metrics,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return new Response(JSON.stringify(records), {
    headers: { "Content-Type": "application/json" },
  });
};
