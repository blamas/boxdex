<script lang="ts">
import { onMount } from "svelte";
import { type EChartsInstance, echarts, getActiveTheme } from "../lib/echarts";

interface Props {
  // Builder, not a plain object: it is re-invoked on theme change so options that
  // embed theme values (accent colour, radar theme spread) pick up the new theme.
  option: () => object;
  height?: number;
  // Hook to attach instance-level handlers (e.g. chart.on("click", …)); runs again
  // after every re-init.
  onInit?: (chart: EChartsInstance) => void;
}

const { option, height = 380, onInit }: Props = $props();

let host: HTMLDivElement;
let chart: EChartsInstance | null = null;

function init() {
  chart?.dispose();
  chart = echarts.init(host, getActiveTheme().theme);
  onInit?.(chart);
  chart.setOption(option(), { notMerge: true });
}

onMount(() => {
  init();

  const ro = new ResizeObserver(() => chart?.resize());
  ro.observe(host);

  const onThemeChange = () => init();
  document.addEventListener("boxdex:themechange", onThemeChange);

  return () => {
    ro.disconnect();
    document.removeEventListener("boxdex:themechange", onThemeChange);
    chart?.dispose();
    chart = null;
  };
});

// Re-applies whenever reactive state read inside the option builder changes.
$effect(() => {
  const opt = option();
  chart?.setOption(opt, { notMerge: true });
});
</script>

<div bind:this={host} style="width:100%;height:{height}px;"></div>
