<script lang="ts">
import { clickOutside } from "../lib/click-outside";
import { getClientTranslations } from "../lib/locale-client";

interface Props {
  onCsv?: () => void;
  onJson?: () => void;
  onPrint?: () => void;
  disabled?: boolean;
}

const { onCsv, onJson, onPrint, disabled = false }: Props = $props();
const t = getClientTranslations();

let open = $state(false);

function run(fn?: () => void) {
  open = false;
  fn?.();
}
</script>

<div class="export-menu no-print" use:clickOutside={() => (open = false)}>
  <button class="export-btn" {disabled} onclick={() => (open = !open)} aria-haspopup="menu" aria-expanded={open}>
    {t.exportMenu.export} {open ? "▴" : "▾"}
  </button>
  {#if open}
    <div class="menu" role="menu">
      {#if onCsv}
        <button role="menuitem" onclick={() => run(onCsv)}>{t.exportMenu.csv}</button>
      {/if}
      {#if onJson}
        <button role="menuitem" onclick={() => run(onJson)}>{t.exportMenu.json}</button>
      {/if}
      {#if onPrint}
        <button role="menuitem" onclick={() => run(onPrint)}>{t.exportMenu.pdf}</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .export-menu {
    position: relative;
    display: inline-block;
  }

  .export-btn {
    background: none;
    border: 1px solid var(--line);
    color: var(--muted);
    border-radius: 4px;
    padding: 0.3rem 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
  }

  .export-btn:hover:not(:disabled),
  .export-btn[aria-expanded="true"] {
    border-color: var(--accent);
    color: var(--accent);
  }

  .export-btn:disabled {
    opacity: 0.5;
  }

  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    z-index: 10;
    display: flex;
    flex-direction: column;
    min-width: 7rem;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 4px;
    overflow: hidden;
  }

  .menu button {
    background: none;
    border: none;
    text-align: left;
    color: var(--text);
    padding: 0.4rem 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
  }

  .menu button:hover {
    background: var(--surface-subtle);
    color: var(--accent);
  }
</style>
