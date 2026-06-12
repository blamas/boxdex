<script lang="ts">
// Infinite-scroll sentinel: sits under a capped list and calls `onmore` each time it
// scrolls into view. Unmounts (and disconnects) once nothing remains.

interface Props {
  remaining: number;
  onmore: () => void;
}

const { remaining, onmore }: Props = $props();

function sentinel(el: HTMLElement) {
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) onmore();
  });
  io.observe(el);
  return { destroy: () => io.disconnect() };
}
</script>

{#if remaining > 0}
  <div class="sentinel" use:sentinel>{remaining} more…</div>
{/if}

<style>
  .sentinel {
    padding: 1rem;
    text-align: center;
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 0.8rem;
  }
</style>
