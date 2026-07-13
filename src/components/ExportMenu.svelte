<script lang="ts">
import { tick } from "svelte";
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
let triggerEl: HTMLButtonElement | undefined = $state();
let menuEl: HTMLDivElement | undefined = $state();

function run(fn?: () => void) {
  open = false;
  fn?.();
}

function items(): HTMLButtonElement[] {
  return Array.from(menuEl?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
}

async function openMenu(focusLast = false) {
  open = true;
  await tick();
  const els = items();
  (focusLast ? els.at(-1) : els[0])?.focus();
}

function closeMenu() {
  open = false;
  triggerEl?.focus();
}

function onTriggerKeydown(e: KeyboardEvent) {
  if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    openMenu();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    openMenu(true);
  }
}

// APG menu-button pattern: arrow keys move focus among items, Home/End jump to the
// ends, Escape closes and returns focus to the trigger, Tab lets focus leave normally
// (clickOutside handles the resulting close on the next interaction elsewhere).
function onMenuKeydown(e: KeyboardEvent) {
  const els = items();
  const i = els.indexOf(document.activeElement as HTMLButtonElement);
  if (e.key === "ArrowDown") {
    e.preventDefault();
    els[(i + 1) % els.length]?.focus();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    els[(i - 1 + els.length) % els.length]?.focus();
  } else if (e.key === "Home") {
    e.preventDefault();
    els[0]?.focus();
  } else if (e.key === "End") {
    e.preventDefault();
    els.at(-1)?.focus();
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeMenu();
  }
}
</script>

<div
  class="export-menu no-print"
  use:clickOutside={() => (open = false)}
  onfocusout={(e) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) open = false;
  }}
>
  <button
    bind:this={triggerEl}
    class="export-btn"
    {disabled}
    onclick={() => (open ? (open = false) : openMenu())}
    onkeydown={onTriggerKeydown}
    aria-haspopup="menu"
    aria-expanded={open}
  >
    {t.exportMenu.export} {open ? "▴" : "▾"}
  </button>
  {#if open}
    <div class="menu" role="menu" bind:this={menuEl} onkeydown={onMenuKeydown}>
      {#if onCsv}
        <button role="menuitem" tabindex="-1" onclick={() => run(onCsv)}>{t.exportMenu.csv}</button>
      {/if}
      {#if onJson}
        <button role="menuitem" tabindex="-1" onclick={() => run(onJson)}>{t.exportMenu.json}</button>
      {/if}
      {#if onPrint}
        <button role="menuitem" tabindex="-1" onclick={() => run(onPrint)}>{t.exportMenu.pdf}</button>
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
