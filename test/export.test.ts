import { describe, expect, it } from "vitest";
import { curveSeriesToCsv, recordsToCsv, toCsv } from "../src/lib/export";
import type { EnclosureRecord } from "../src/lib/metrics";

describe("toCsv", () => {
  it("joins rows and cells", () => {
    expect(
      toCsv([
        ["a", "b"],
        [1, 2],
      ])
    ).toBe("a,b\n1,2");
  });

  it("quotes cells containing comma, quote, or newline", () => {
    expect(toCsv([["a,b", 'he said "hi"', "x\ny"]])).toBe('"a,b","he said ""hi""","x\ny"');
  });
});

describe("curveSeriesToCsv", () => {
  it("emits one tidy row per point, preserving each series' native grid", () => {
    const csv = curveSeriesToCsv(
      [
        {
          name: "A",
          source: "rew_measured",
          points: [
            [20, 90],
            [40, 95],
          ],
        },
        { name: "B", source: "hornresp_sim", points: [[31.5, 88]] },
      ],
      "spl"
    );
    expect(csv).toBe(
      [
        "enclosure,kind,source,freq_hz,value",
        "A,spl,rew_measured,20,90",
        "A,spl,rew_measured,40,95",
        "B,spl,hornresp_sim,31.5,88",
      ].join("\n")
    );
  });
});

describe("recordsToCsv", () => {
  const rec = (over: Partial<EnclosureRecord>): EnclosureRecord =>
    ({
      slug: "x",
      name: "X",
      category: "sub",
      topology: "ported",
      provenance: "sim",
      metrics: {},
      ...over,
    }) as EnclosureRecord;

  it("has identity + all axis metric columns and leaves missing metrics blank", () => {
    const csv = recordsToCsv([rec({ metrics: { volumeL: 50, maxSplDb: 130 } })]);
    const [header, row] = csv.split("\n");
    expect(header).toBe(
      "slug,name,category,topology,provenance,volumeL,footprintCm2,heightMm,weightKg,f3Hz,f3HzHigh,maxSplDb,sensitivityDb,outputDensity"
    );
    // volumeL=50 in col 6, maxSplDb=130 in its column, others blank
    expect(row).toBe("x,X,sub,ported,sim,50,,,,,,130,,");
  });
});
