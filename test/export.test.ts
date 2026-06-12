import { describe, expect, it } from "vitest";
import { curveSeriesToCsv, jsonString, recordsToCsv, toCsv } from "../src/lib/export";
import { makeMetrics, makeRecord } from "./fixtures";

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
  it("has identity + all axis metric columns and leaves missing metrics blank", () => {
    const rec = makeRecord({
      slug: "x",
      name: "X",
      topology: "ported",
      metrics: makeMetrics({
        volumeL: 50,
        footprintCm2: 2400,
        heightMm: 900,
        f3Hz: 38,
        maxSplDb: 130,
      }),
    });
    const csv = recordsToCsv([rec]);
    const [header, row] = csv.split("\n");
    expect(header).toBe(
      "slug,name,category,topology,provenance,volumeL,footprintCm2,heightMm,weightKg,f3Hz,f3HzHigh,maxSplDb,sensitivityDb,outputDensity"
    );
    // optional metrics without a value stay blank, never defaulted
    expect(row).toBe("x,X,sub,ported,sim,50,2400,900,,38,,130,,");
  });
});

describe("jsonString", () => {
  it("pretty-prints with 2-space indentation", () => {
    expect(jsonString({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});
