<script lang="ts">
import type { Category } from "../lib/category";
import { CATEGORY_UPPER_HZ } from "../lib/stack";

interface Slot {
  category: Category;
  f3Hz: number;
  upperHz: number;
  name: string;
}

const { slots }: { slots: Slot[] } = $props();

const W = 760;
const BAR_H = 22;
const BAR_GAP = 6;
const AXIS_H = 18;

const F_MIN = 20;
const F_MAX = 20000;
const LOG_MIN = Math.log10(F_MIN);
const LOG_MAX = Math.log10(F_MAX);

const TICKS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const TICK_LABELS: Record<number, string> = {
  20: "20",
  50: "50",
  100: "100",
  200: "200",
  500: "500",
  1000: "1k",
  2000: "2k",
  5000: "5k",
  10000: "10k",
  20000: "20k",
};

const CAT_COLORS: Record<Category, string> = {
  sub: "var(--accent)",
  kick: "var(--kick)",
  mid: "var(--mid)",
  top: "var(--accent-2)",
};

function logX(f: number): number {
  return ((Math.log10(Math.max(f, F_MIN)) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * W;
}

const svgHeight = $derived(slots.length * (BAR_H + BAR_GAP) + AXIS_H);

const bars = $derived(
  slots.map((s, i) => {
    const x = logX(s.f3Hz);
    const x2 = logX(Math.min(s.upperHz, F_MAX));
    return {
      x,
      width: Math.max(2, x2 - x),
      y: i * (BAR_H + BAR_GAP),
      color: CAT_COLORS[s.category],
      name: s.name,
    };
  })
);

const axisY = $derived(slots.length * (BAR_H + BAR_GAP));

// Gaps (uncovered bands) and overlaps between adjacent passbands, ordered by f3.
const regions = $derived.by(() => {
  const sorted = [...slots].sort((a, b) => a.f3Hz - b.f3Hz);
  const out: { kind: "gap" | "overlap"; x: number; width: number; mid: number }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prevUpper = sorted[i - 1].upperHz;
    const nextLower = sorted[i].f3Hz;
    if (nextLower > prevUpper) {
      const x = logX(prevUpper);
      out.push({ kind: "gap", x, width: Math.max(2, logX(nextLower) - x), mid: x });
    } else if (nextLower < prevUpper) {
      const x = logX(nextLower);
      out.push({ kind: "overlap", x, width: Math.max(2, logX(prevUpper) - x), mid: x });
    }
  }
  return out;
});
</script>

{#if slots.length > 0}
  <div class="strip">
    <svg viewBox="0 0 {W} {svgHeight}" width="100%" aria-label="Frequency range strip">
      {#each regions as r}
        <rect
          x={r.x}
          y={0}
          width={r.width}
          height={axisY}
          fill={r.kind === "gap" ? "var(--danger)" : "var(--muted)"}
          fill-opacity={r.kind === "gap" ? 0.18 : 0.1}
        />
        {#if r.kind === "gap"}
          <text
            x={r.x + r.width / 2}
            y={10}
            text-anchor="middle"
            font-size="8"
            fill="var(--danger)"
            font-family="monospace"
          >gap</text>
        {/if}
      {/each}

      {#each TICKS as f}
        {@const x = logX(f)}
        <line x1={x} y1={0} x2={x} y2={axisY} stroke="var(--line)" stroke-width="0.5" />
        <text
          x={x}
          y={axisY + AXIS_H - 3}
          text-anchor="middle"
          font-size="9"
          fill="var(--muted)"
          font-family="monospace"
        >{TICK_LABELS[f]}</text>
      {/each}

      {#each bars as bar}
        <rect
          x={bar.x}
          y={bar.y}
          width={bar.width}
          height={BAR_H}
          fill={bar.color}
          fill-opacity="0.2"
          stroke={bar.color}
          stroke-width="1"
          rx="2"
        />
        <text
          x={bar.x + 4}
          y={bar.y + BAR_H - 6}
          font-size="8"
          fill={bar.color}
          font-family="monospace"
        >{bar.name}</text>
      {/each}
    </svg>
  </div>
{/if}

<style>
  .strip {
    width: 100%;
    overflow: hidden;
  }
</style>
