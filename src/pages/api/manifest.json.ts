import { getCollection } from "astro:content";
import type { APIRoute } from "astro";
import { deriveMetrics, type EnclosureRecord, provenanceOf } from "../../lib/metrics";

export const GET: APIRoute = async () => {
  const [enclosures, driverEntries] = await Promise.all([
    getCollection("enclosures"),
    getCollection("drivers"),
  ]);

  // Only cone drivers carry a nominal size; compression drivers contribute no size facet.
  const driverSizeMap = new Map(
    driverEntries.flatMap((d) => (d.data.type === "cone" ? [[d.id, d.data.sizeInch] as const] : []))
  );
  const driverImpedanceMap = new Map(driverEntries.map((d) => [d.id, d.data.impedanceOhm]));
  const driverMinXoMap = new Map(
    driverEntries.flatMap((d) =>
      d.data.type === "compression" ? [[d.id, d.data.minCrossoverHz] as const] : []
    )
  );
  const compressionExitMap = new Map(
    driverEntries.flatMap((d) =>
      d.data.type === "compression" ? [[d.id, d.data.exitInch] as const] : []
    )
  );

  const records: EnclosureRecord[] = enclosures.map((entry) => {
    const data = entry.data;
    const metrics = deriveMetrics({
      netVolumeL: data.netVolumeL,
      dims: data.dims,
      weightKg: data.weightKg,
      specs: data.specs,
    });

    // Nominal load: stated, or the driver's nominal for a single-driver box. Multi-driver
    // internal wiring is unknown, left undefined rather than guessed.
    const nominalImpedanceOhm =
      data.specs.impedanceNominalOhm ??
      (data.driverCount === 1 && data.drivers.length === 1
        ? driverImpedanceMap.get(data.drivers[0].id)
        : undefined);

    // A CD's protection floor only constrains the *system* crossover into the box
    // when the CD is what the crossover feeds, i.e. an all-compression box. In a
    // multi-way box with cones, the internal crossover already protects the CD.
    const allCompression = data.drivers.every((ref) => driverMinXoMap.has(ref.id));
    const cdFloors = allCompression
      ? data.drivers
          .map((ref) => driverMinXoMap.get(ref.id))
          .filter((v): v is number => v !== undefined)
      : [];

    const driverSizes = [
      ...new Set(
        data.drivers
          .map((ref) => driverSizeMap.get(ref.id))
          .filter((s): s is number => s !== undefined)
      ),
    ].sort((a, b) => a - b);

    const compressionExits = [
      ...new Set(
        data.drivers
          .map((ref) => compressionExitMap.get(ref.id))
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
      compressionExits,
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
      nominalImpedanceOhm,
      minCrossoverHz: cdFloors.length > 0 ? Math.max(...cdFloors) : undefined,
      sheetCount: data.sheetCount,
      sheetSizeMm: data.sheetSizeMm,
      metrics,
    };
  });

  return new Response(JSON.stringify(records), {
    headers: { "Content-Type": "application/json" },
  });
};
