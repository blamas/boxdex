<script lang="ts" generics="T">
import { tick } from "svelte";

interface Props {
  items: T[];
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  value?: string;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  maxVisible?: number;
  onselect: (id: string) => void;
}

const {
  items,
  getId,
  getLabel,
  value = "",
  placeholder = "Search…",
  emptyLabel,
  disabled = false,
  maxVisible = 50,
  onselect,
}: Props = $props();

let query = $state("");
let open = $state(false);
let inputEl: HTMLInputElement | undefined = $state();
let listEl: HTMLDivElement | undefined = $state();
let activeIdx = $state(-1);

const selectedItem = $derived(value ? items.find((i) => getId(i) === value) : undefined);
const selectedLabel = $derived(selectedItem ? getLabel(selectedItem) : "");

const matchedItems = $derived.by(() => {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice(0, maxVisible);
  return items.filter((i) => getLabel(i).toLowerCase().includes(q)).slice(0, maxVisible);
});

const displayItems = $derived([
  ...(emptyLabel !== undefined ? [{ id: "", label: emptyLabel }] : []),
  ...matchedItems.map((i) => ({ id: getId(i), label: getLabel(i) })),
]);

$effect(() => {
  void query;
  activeIdx = -1;
});

async function openDropdown() {
  if (disabled) return;
  open = true;
  query = "";
  activeIdx = -1;
  await tick();
  inputEl?.focus();
}

function closeDropdown() {
  open = false;
  query = "";
  activeIdx = -1;
}

function selectItem(id: string) {
  onselect(id);
  closeDropdown();
}

function scrollActive() {
  if (!listEl || activeIdx < 0) return;
  (listEl.children[activeIdx] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
}

function onTriggerKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
    e.preventDefault();
    openDropdown();
  }
}

function onSearchKeydown(e: KeyboardEvent) {
  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, displayItems.length - 1);
      scrollActive();
      break;
    case "ArrowUp":
      e.preventDefault();
      activeIdx = activeIdx <= 0 ? displayItems.length - 1 : activeIdx - 1;
      scrollActive();
      break;
    case "Enter":
      e.preventDefault();
      if (activeIdx >= 0 && activeIdx < displayItems.length) {
        selectItem(displayItems[activeIdx].id);
      }
      break;
    case "Escape":
      e.preventDefault();
      closeDropdown();
      break;
  }
}

function clickOutside(node: HTMLElement) {
  function handler(e: MouseEvent) {
    if (!open || node.contains(e.target as Node)) return;
    closeDropdown();
  }
  document.addEventListener("mousedown", handler);
  return {
    destroy() {
      document.removeEventListener("mousedown", handler);
    },
  };
}
</script>

<div class="combobox" use:clickOutside>
  {#if open}
    <input
      bind:this={inputEl}
      bind:value={query}
      class="combobox-search"
      type="text"
      {placeholder}
      onkeydown={onSearchKeydown}
      autocomplete="off"
      spellcheck={false}
    />
    <div class="combobox-list" bind:this={listEl} role="listbox">
      {#each displayItems as item, idx}
        <button
          class="combobox-item"
          class:combobox-item-active={activeIdx === idx}
          class:combobox-item-selected={item.id === value}
          role="option"
          aria-selected={item.id === value}
          onmouseenter={() => { activeIdx = idx; }}
          onmousedown={(e) => e.preventDefault()}
          onclick={() => selectItem(item.id)}
        >{item.label}</button>
      {/each}
    </div>
  {:else}
    <button
      class="combobox-trigger"
      {disabled}
      onclick={openDropdown}
      onkeydown={onTriggerKeydown}
    >
      <span class="combobox-value">
        {#if selectedLabel}
          {selectedLabel}
        {:else if emptyLabel !== undefined && value === ""}
          <span class="combobox-dim">{emptyLabel}</span>
        {:else}
          <span class="combobox-dim">{placeholder}</span>
        {/if}
      </span>
      <span class="combobox-arrow" aria-hidden="true">▾</span>
    </button>
  {/if}
</div>

<style>
  .combobox {
    position: relative;
    display: block;
    width: 100%;
  }

  .combobox-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    background: var(--bg);
    border: 1px solid var(--line);
    color: var(--text);
    padding: 0.3rem 0.5rem;
    font-family: var(--font-mono);
    font-size: 0.875rem;
    border-radius: 3px;
    cursor: pointer;
    text-align: left;
  }

  .combobox-trigger:hover:not(:disabled) {
    border-color: var(--muted);
  }

  .combobox-trigger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .combobox-value {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .combobox-dim {
    color: var(--muted);
  }

  .combobox-arrow {
    color: var(--muted);
    font-size: 0.75rem;
    flex-shrink: 0;
  }

  .combobox-search {
    display: block;
    width: 100%;
    background: var(--bg);
    border: 1px solid var(--accent);
    border-bottom: none;
    color: var(--text);
    padding: 0.3rem 0.5rem;
    font-family: var(--font-mono);
    font-size: 0.875rem;
    border-radius: 3px 3px 0 0;
    outline: none;
    box-sizing: border-box;
  }

  .combobox-list {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 100;
    background: var(--bg);
    border: 1px solid var(--accent);
    border-radius: 0 0 3px 3px;
    max-height: 220px;
    overflow-y: auto;
  }

  .combobox-item {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    border-bottom: 1px solid var(--line);
    padding: 0.35rem 0.5rem;
    font-family: var(--font-mono);
    font-size: 0.875rem;
    color: var(--text);
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .combobox-item:last-child {
    border-bottom: none;
  }

  .combobox-item-active,
  .combobox-item:hover {
    background: var(--panel);
    color: var(--accent);
  }

  .combobox-item-selected {
    color: var(--accent);
  }
</style>
