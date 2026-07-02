<script lang="ts">
import type { Snippet } from "svelte";
import { getClientTranslations } from "../lib/locale-client";

const { children }: { children?: Snippet } = $props();
const t = getClientTranslations();

let copyDone = $state(false);

async function copyLink() {
  await navigator.clipboard.writeText(window.location.href);
  copyDone = true;
  setTimeout(() => {
    copyDone = false;
  }, 1500);
}
</script>

<div class="page-header no-print">
  <button class="link-btn" onclick={copyLink}>{copyDone ? t.pageActions.copied : t.pageActions.share}</button>
  {@render children?.()}
</div>

<style>
  .page-header {
    position: absolute;
    top: 0;
    right: 1.5rem;
    display: flex;
    gap: 0.5rem;
  }

  .link-btn {
    background: none;
    border: 1px solid var(--line);
    color: var(--muted);
    border-radius: 4px;
    padding: 0.3rem 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    cursor: pointer;
  }

  .link-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  @media (max-width: 640px) {
    .page-header {
      position: static;
      justify-content: flex-start;
      margin-bottom: 0.75rem;
    }
  }
</style>
