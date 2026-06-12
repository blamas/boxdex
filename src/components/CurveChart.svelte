<script lang="ts">
import { onMount } from "svelte";
import { echarts, getActiveTheme } from "../lib/echarts";

interface Series {
  name: string;
  color: string;
  points: [number, number][];
  dashed: boolean;
  smooth?: boolean;
  width?: number;
}

const {
  series,
  yName,
  height = 380,
}: { series: Series[]; yName: string; height?: number } = $props();

let host: HTMLDivElement;
let chart: ReturnType<typeof echarts.init> | null = null;

function buildOption(s: Series[], yN: string) {
  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    legend: {},
    dataZoom: [{ type: "inside" }, { type: "slider", bottom: 8 }],
    toolbox: {
      feature: {
        saveAsImage: {},
        dataZoom: {},
        restore: {},
      },
    },
    grid: { left: 60, right: 20, top: 40, bottom: 60 },
    xAxis: {
      type: "log",
      name: "Hz",
      nameLocation: "end",
      axisLabel: {
        formatter: (v: number) => (v >= 1000 ? `${v / 1000}k` : String(v)),
      },
      splitLine: { show: true },
    },
    yAxis: {
      type: "value",
      name: yN,
      scale: true,
    },
    series: s.map((ser) => ({
      type: "line",
      name: ser.name,
      data: ser.points,
      showSymbol: false,
      color: ser.color,
      smooth: ser.smooth ?? false,
      lineStyle: { width: ser.width ?? 2, type: ser.dashed ? "dashed" : "solid" },
    })),
  };
}

function initChart() {
  const { theme } = getActiveTheme();
  chart?.dispose();
  chart = echarts.init(host, theme);
  chart.setOption(buildOption(series, yName), { notMerge: true });
}

onMount(() => {
  initChart();

  const ro = new ResizeObserver(() => chart?.resize());
  ro.observe(host);

  function onThemeChange() {
    initChart();
  }
  document.addEventListener("boxdex:themechange", onThemeChange);

  return () => {
    ro.disconnect();
    document.removeEventListener("boxdex:themechange", onThemeChange);
    chart?.dispose();
    chart = null;
  };
});

$effect(() => {
  if (chart) {
    chart.setOption(buildOption(series, yName), { notMerge: true });
  }
});
</script>

<div bind:this={host} style="width:100%;height:{height}px;"></div>
