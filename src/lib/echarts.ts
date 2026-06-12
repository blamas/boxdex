import { LineChart, RadarChart, ScatterChart } from "echarts/charts";
import {
  BrushComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
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
  CanvasRenderer,
]);

export const darkTheme = {
  backgroundColor: "transparent",
  textStyle: { color: "#c9d1d9" },
  title: { textStyle: { color: "#c9d1d9" } },
  legend: { textStyle: { color: "#c9d1d9" } },
  categoryAxis: {
    axisLine: { lineStyle: { color: "#30363d" } },
    axisTick: { lineStyle: { color: "#30363d" } },
    axisLabel: { color: "#8b949e" },
    splitLine: { lineStyle: { color: "#21262d" } },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: "#30363d" } },
    axisTick: { lineStyle: { color: "#30363d" } },
    axisLabel: { color: "#8b949e" },
    splitLine: { lineStyle: { color: "#21262d" } },
  },
  logAxis: {
    axisLine: { lineStyle: { color: "#30363d" } },
    axisTick: { lineStyle: { color: "#30363d" } },
    axisLabel: { color: "#8b949e" },
    splitLine: { lineStyle: { color: "#21262d" } },
  },
  tooltip: {
    backgroundColor: "#161b22",
    borderColor: "#30363d",
    textStyle: { color: "#c9d1d9" },
  },
};

export const lightTheme = {
  backgroundColor: "transparent",
  textStyle: { color: "#1f2328" },
  title: { textStyle: { color: "#1f2328" } },
  legend: { textStyle: { color: "#1f2328" } },
  categoryAxis: {
    axisLine: { lineStyle: { color: "#d0d7de" } },
    axisTick: { lineStyle: { color: "#d0d7de" } },
    axisLabel: { color: "#656d76" },
    splitLine: { lineStyle: { color: "#eaeef2" } },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: "#d0d7de" } },
    axisTick: { lineStyle: { color: "#d0d7de" } },
    axisLabel: { color: "#656d76" },
    splitLine: { lineStyle: { color: "#eaeef2" } },
  },
  logAxis: {
    axisLine: { lineStyle: { color: "#d0d7de" } },
    axisTick: { lineStyle: { color: "#d0d7de" } },
    axisLabel: { color: "#656d76" },
    splitLine: { lineStyle: { color: "#eaeef2" } },
  },
  tooltip: {
    backgroundColor: "#f6f8fa",
    borderColor: "#d0d7de",
    textStyle: { color: "#1f2328" },
  },
};

export const DARK_ACCENT = "#39ff14";
export const LIGHT_ACCENT = "#1a7f37";

// Returns the theme object and accent colour matching the current HTML data-theme attribute.
export function getActiveTheme(): { theme: typeof darkTheme; accent: string } {
  const isLight =
    typeof document !== "undefined" && document.documentElement.dataset.theme === "light";
  return isLight
    ? { theme: lightTheme, accent: LIGHT_ACCENT }
    : { theme: darkTheme, accent: DARK_ACCENT };
}

export { echarts };
