<script lang="ts">
import { tt } from "../i18n";
import { getClientTranslations } from "../lib/locale-client";

interface Props {
  remaining: number;
  onmore: () => void;
}

const { remaining, onmore }: Props = $props();
const t = getClientTranslations();

function sentinel(el: HTMLElement) {
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) onmore();
  });
  io.observe(el);
  return { destroy: () => io.disconnect() };
}
</script>

{#if remaining > 0}
  <div class="sentinel" use:sentinel>{tt(t.loadMore.more, { n: remaining })}</div>
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
