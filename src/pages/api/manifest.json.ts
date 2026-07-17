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

    // First profile is the box's reference/canonical build: scalar per-build facts (count,
    // impedance, crossover floor) are derived from it. Other profiles are alternates, valid
    // but not what the catalog's numeric facets describe.
    const primary = data.driverProfiles[0];
    const driverCount = primary.drivers.reduce((sum, e) => sum + e.qty, 0);

    // Nominal load: stated, or the driver's nominal for a single-driver box. Multi-driver
    // internal wiring is unknown, left undefined rather than guessed.
    const nominalImpedanceOhm =
      data.specs.impedanceNominalOhm ??
      (driverCount === 1 ? driverImpedanceMap.get(primary.drivers[0].driver.id) : undefined);

    // A CD's protection floor only constrains the *system* crossover into the box
    // when the CD is what the crossover feeds, i.e. an all-compression box. In a
    // multi-way box with cones, the internal crossover already protects the CD.
    const allCompression = primary.drivers.every((e) => driverMinXoMap.has(e.driver.id));
    const cdFloors = allCompression
      ? primary.drivers
          .map((e) => driverMinXoMap.get(e.driver.id))
          .filter((v): v is number => v !== undefined)
      : [];

    // Display entries keep their real qty (a size/exit facet carries no count). undefined
    // size/exit fields drop out of the JSON at stringify time.
    const primaryDrivers = primary.drivers.map((e) => ({
      qty: e.qty,
      sizeInch: driverSizeMap.get(e.driver.id),
      exitInch: compressionExitMap.get(e.driver.id),
    }));

    // Curve sets live under each profile now: union across all of them, same rationale as the
    // driver-membership facets above.
    const allSimSets = data.driverProfiles.flatMap((p) => p.simulations);
    const allMeasSets = data.driverProfiles.flatMap((p) => p.measurements);

    // Membership facets (which drivers/sizes/exits this box can use) union across every
    // declared profile, so faceted search finds a box even when a size/driver is only
    // available in an alternate build, not just the primary one.
    const allDriverRefs = data.driverProfiles.flatMap((p) => p.drivers);

    const driverSizes = [
      ...new Set(
        allDriverRefs
          .map((e) => driverSizeMap.get(e.driver.id))
          .filter((s): s is number => s !== undefined)
      ),
    ].sort((a, b) => a - b);

    const compressionExits = [
      ...new Set(
        allDriverRefs
          .map((e) => compressionExitMap.get(e.driver.id))
          .filter((s): s is number => s !== undefined)
      ),
    ].sort((a, b) => a - b);

    return {
      slug: entry.id,
      name: data.name,
      category: data.category,
      topology: data.topology,
      topologyVariant: data.topologyVariant,
      driverCount,
      primaryDrivers,
      drivers: [...new Set(allDriverRefs.map((e) => e.driver.id))],
      driverSizes,
      compressionExits,
      ways: data.ways,
      recommendedFor: data.recommendedFor,
      verified: data.verified,
      provenance: provenanceOf(allMeasSets),
      buildComplexity: data.buildComplexity,
      hasPlans: data.plans.length > 0,
      hasMeasurements: allMeasSets.length > 0,
      availableKinds: [
        ...new Set(
          [...allSimSets, ...allMeasSets].flatMap((cs) => [
            ...Object.keys(cs.curves),
            ...(cs.stacked?.length ? ["spl_stacked"] : []),
          ])
        ),
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
