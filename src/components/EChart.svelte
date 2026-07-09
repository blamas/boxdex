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

// Deep-merge theme defaults under builder output so builder keys always win but
// axis/tooltip colors from the theme fill in anything the builder doesn't set.
function deepMerge(
  base: Record<string, unknown>,
  over: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const k of Object.keys(over)) {
    const b = base[k];
    const o = over[k];
    result[k] =
      b &&
      o &&
      typeof b === "object" &&
      typeof o === "object" &&
      !Array.isArray(b) &&
      !Array.isArray(o)
        ? deepMerge(b as Record<string, unknown>, o as Record<string, unknown>)
        : o;
  }
  return result;
}

function themeOption(): object {
  return deepMerge(
    getActiveTheme().theme as Record<string, unknown>,
    option() as Record<string, unknown>
  );
}

function init() {
  chart?.dispose();
  // No theme at init: all theming flows through themeOption() on every setOption call.
  chart = echarts.init(host);
  onInit?.(chart);
  chart.setOption(themeOption(), { notMerge: true });
}

onMount(() => {
  init();

  const ro = new ResizeObserver(() => chart?.resize());
  ro.observe(host);

  // On theme change: update option in place, no dispose, no canvas flash.
  const onThemeChange = () => {
    chart?.setOption(themeOption(), { notMerge: true });
  };
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
  chart?.setOption(themeOption(), { notMerge: true });
});
</script>

<div bind:this={host} style="width:100%;height:var(--echart-h,{height}px);"></div>
