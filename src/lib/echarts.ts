import { LineChart, RadarChart, ScatterChart } from "echarts/charts";
import {
  BrushComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  RadarComponent,
  ToolboxComponent,
  TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  LineChart,
  ScatterChart,
  RadarChart,
  GridComponent,
  RadarComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  ToolboxComponent,
  BrushComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

export function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function buildTheme() {
  const text = cssVar("--text", "#c9d1d9");
  const line = cssVar("--line", "#30363d");
  const lineSubtle = cssVar("--line-subtle", "#21262d");
  const muted = cssVar("--muted", "#8b949e");
  const panel = cssVar("--panel", "#161b22");

  const axisStyle = {
    axisLine: { lineStyle: { color: line } },
    axisTick: { lineStyle: { color: line } },
    axisLabel: { color: muted },
    splitLine: { lineStyle: { color: lineSubtle } },
  };

  return {
    backgroundColor: "transparent",
    textStyle: { color: text },
    legend: { textStyle: { color: text } },
    categoryAxis: axisStyle,
    valueAxis: axisStyle,
    logAxis: axisStyle,
    tooltip: {
      backgroundColor: panel,
      borderColor: line,
      textStyle: { color: text },
    },
  };
}

export function getActiveTheme(): { theme: ReturnType<typeof buildTheme>; accent: string } {
  return { theme: buildTheme(), accent: cssVar("--accent", "#39ff14") };
}

export { echarts };

export type EChartsInstance = ReturnType<typeof echarts.init>;
