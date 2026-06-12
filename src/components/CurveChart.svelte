<script lang="ts">
import EChart from "./EChart.svelte";

interface Series {
  name: string;
  color: string;
  points: [number, number][];
  dashed: boolean;
  smooth?: boolean;
  width?: number;
}

interface MarkLine {
  x: number;
  label: string;
}

const {
  series,
  yName,
  height = 380,
  markLines = [],
}: {
  series: Series[];
  yName: string;
  height?: number;
  markLines?: MarkLine[];
} = $props();

function buildOption() {
  // Re-read on every build: EChart re-invokes the builder on theme change.
  const css = getComputedStyle(document.documentElement);
  const accentColor = css.getPropertyValue("--accent").trim() || "#39ff14";
  const panelColor = css.getPropertyValue("--panel").trim() || "#161b22";
  const lineColor = css.getPropertyValue("--line").trim() || "#30363d";
  return {
    backgroundColor: "transparent",
    // Snappy transitions when series change (e.g. the apply-crossovers toggle).
    animationDuration: 300,
    animationDurationUpdate: 250,
    tooltip: { trigger: "axis" },
    // Stacked bottom-up: legend at the very bottom, zoom slider above it, then the
    // x-axis, nothing overlaps. Scroll keeps long series lists on one row.
    legend: { type: "scroll", bottom: 0 },
    dataZoom: [{ type: "inside" }, { type: "slider", bottom: 44 }],
    toolbox: {
      feature: {
        saveAsImage: {},
        dataZoom: {},
        restore: {},
      },
    },
    grid: { left: 60, right: 20, top: 40, bottom: 122 },
    xAxis: {
      type: "log",
      name: "Hz",
      nameLocation: "end",
      axisLabel: {
        formatter: (v: number) => (v >= 1000 ? `${v / 1000}k` : String(v)),
      },
      splitLine: { show: true, lineStyle: { color: lineColor, opacity: 0.9 } },
      minorTick: { show: true, splitNumber: 9 },
      minorSplitLine: { show: true, lineStyle: { color: lineColor, opacity: 0.3 } },
    },
    yAxis: {
      type: "value",
      name: yName,
      scale: true,
    },
    series: [
      ...series.map((ser) => ({
        type: "line",
        name: ser.name,
        data: ser.points,
        showSymbol: false,
        color: ser.color,
        smooth: ser.smooth ?? false,
        lineStyle: {
          width: ser.width ?? 2,
          type: ser.dashed ? "dashed" : "solid",
        },
      })),
      // Vertical markers (e.g. suggested crossover points) on an empty carrier series.
      ...(markLines.length > 0
        ? [
            {
              type: "line",
              name: "markers",
              data: [],
              showSymbol: false,
              tooltip: { show: false },
              markLine: {
                symbol: "none",
                silent: true,
                lineStyle: { type: "dashed", width: 2, color: accentColor },
                label: {
                  formatter: (p: { name: string }) => p.name,
                  position: "insideStartTop",
                  color: accentColor,
                  backgroundColor: panelColor,
                  borderColor: accentColor,
                  borderWidth: 1,
                  borderRadius: 3,
                  padding: [4, 7],
                  fontSize: 12,
                  fontWeight: "bold",
                },
                data: markLines.map((m) => ({ xAxis: m.x, name: m.label })),
              },
            },
          ]
        : []),
    ],
  };
}
</script>

<EChart option={buildOption} {height} />
