<script lang="ts">
import { cssVar } from "../lib/echarts";
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
  // The dashed line itself stays neutral (var(--line)) regardless: these color the label
  // badge instead. borderColor = the box being lowpassed here (plays below this point),
  // textColor = the box being highpassed here (plays above it), so a frequency shared by
  // two boxes' corners (still coupled, before either side is edited apart) shows both at
  // once without banding or moving the line. Either falls back to the other when only one
  // side has a box at this frequency.
  borderColor?: string;
  textColor?: string;
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
  const accentColor = cssVar("--accent", "#39ff14");
  const panelColor = cssVar("--panel", "#161b22");
  const lineColor = cssVar("--line", "#30363d");
  // --line is a subtle divider tone, too low-contrast for a marker meant to stand out
  // against the chart; --muted is a proper mid-gray, visible without being colored.
  const markLineColor = cssVar("--muted", "#8b949e");
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
                // Neutral for every entry: color lives on the label badge instead (see
                // MarkLine), so the line itself never has to pick a side.
                lineStyle: { type: "dashed", width: 2.5, color: markLineColor },
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
                data: markLines.map((m) => {
                  const borderColor = m.borderColor ?? m.textColor ?? accentColor;
                  const textColor = m.textColor ?? m.borderColor ?? accentColor;
                  return {
                    xAxis: m.x,
                    name: m.label,
                    label: { color: textColor, borderColor },
                  };
                }),
              },
            },
          ]
        : []),
    ],
  };
}
</script>

<EChart option={buildOption} {height} />
