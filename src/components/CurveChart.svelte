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

const {
  series,
  yName,
  height = 380,
}: { series: Series[]; yName: string; height?: number } = $props();

function buildOption() {
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
      name: yName,
      scale: true,
    },
    series: series.map((ser) => ({
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
</script>

<EChart option={buildOption} {height} />
