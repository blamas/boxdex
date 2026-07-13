<script module>
let comboboxSeq = 0;
</script>

<script lang="ts" generics="T">
import { tick } from "svelte";
import { clickOutside } from "../lib/click-outside";

interface Props {
  items: T[];
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  value?: string;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  maxVisible?: number;
  searchable?: boolean;
  compact?: boolean;
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
  searchable = true,
  compact = false,
  onselect,
}: Props = $props();

let query = $state("");
let open = $state(false);
let inputEl: HTMLInputElement | undefined = $state();
let listEl: HTMLDivElement | undefined = $state();
let wrapperEl: HTMLDivElement | undefined = $state();
let activeIdx = $state(-1);
let listStyle = $state("");

const listboxId = `combobox-${comboboxSeq++}`;
const activeOptionId = $derived(activeIdx >= 0 ? `${listboxId}-opt-${activeIdx}` : undefined);

const selectedItem = $derived(value ? items.find((i) => getId(i) === value) : undefined);
const selectedLabel = $derived(selectedItem ? getLabel(selectedItem) : "");
// role="combobox" doesn't allow name-from-content per the accname spec, so the trigger's
// visible text (which mirrors this) isn't picked up as its accessible name without aria-label.
const triggerLabel = $derived(
  selectedLabel || (emptyLabel !== undefined && value === "" ? emptyLabel : placeholder)
);

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

// Position the list with `position: fixed` (computed from the wrapper's viewport
// rect) instead of relying on CSS `position: absolute`, so it isn't clipped when
// a caller mounts the combobox inside a scrollable ancestor (e.g. a table cell).
function updateListPosition() {
  if (!wrapperEl) return;
  const rect = wrapperEl.getBoundingClientRect();
  listStyle = searchable
    ? `position:fixed; top:${rect.bottom}px; left:${rect.left}px; width:${rect.width}px;`
    : `position:fixed; top:${rect.bottom}px; left:${rect.left}px; min-width:${rect.width}px;`;
}

$effect(() => {
  if (!open) return;
  updateListPosition();
  window.addEventListener("scroll", updateListPosition, true);
  window.addEventListener("resize", updateListPosition);
  return () => {
    window.removeEventListener("scroll", updateListPosition, true);
    window.removeEventListener("resize", updateListPosition);
  };
});

async function openDropdown() {
  if (disabled) return;
  open = true;
  query = "";
  activeIdx = -1;
  if (searchable) {
    await tick();
    inputEl?.focus();
  }
}

function closeDropdown() {
  open = false;
  query = "";
  activeIdx = -1;
}

function toggleDropdown() {
  if (open) {
    closeDropdown();
  } else {
    openDropdown();
  }
}

function selectItem(id: string) {
  onselect(id);
  closeDropdown();
}

function scrollActive() {
  if (!listEl || activeIdx < 0) return;
  (listEl.children[activeIdx] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
}

// Shared by the search input (searchable mode) and the trigger button itself
// (non-searchable mode, which has no input to receive these keys).
function onListKeydown(e: KeyboardEvent) {
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

function onTriggerKeydown(e: KeyboardEvent) {
  if (open) {
    onListKeydown(e);
    return;
  }
  if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
    e.preventDefault();
    openDropdown();
  }
}
</script>

{#snippet optionList()}
  <div
    class="combobox-list"
    class:combobox-list-compact={compact}
    style={listStyle}
    bind:this={listEl}
    id={listboxId}
    role="listbox"
  >
    {#each displayItems as item, idx}
      <button
        class="combobox-item"
        class:combobox-item-active={activeIdx === idx}
        class:combobox-item-selected={item.id === value}
        id={`${listboxId}-opt-${idx}`}
        role="option"
        tabindex="-1"
        aria-selected={item.id === value}
        onmouseenter={() => { activeIdx = idx; }}
        onmousedown={(e) => e.preventDefault()}
        onclick={() => selectItem(item.id)}
      >{item.label}</button>
    {/each}
  </div>
{/snippet}

<div
  class="combobox"
  class:combobox-full={searchable}
  class:combobox-fit={!searchable}
  bind:this={wrapperEl}
  use:clickOutside={() => open && closeDropdown()}
>
  {#if open && searchable}
    <input
      bind:this={inputEl}
      bind:value={query}
      class="combobox-search"
      type="text"
      role="combobox"
      aria-controls={listboxId}
      aria-expanded={open}
      aria-activedescendant={activeOptionId}
      {placeholder}
      onkeydown={onListKeydown}
      autocomplete="off"
      spellcheck={false}
    />
    {@render optionList()}
  {:else}
    <button
      class="combobox-trigger"
      class:combobox-compact={compact}
      {disabled}
      role="combobox"
      aria-label={triggerLabel}
      aria-haspopup="listbox"
      aria-controls={open && !searchable ? listboxId : undefined}
      aria-expanded={open}
      aria-activedescendant={!searchable ? activeOptionId : undefined}
      onclick={toggleDropdown}
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
    {#if open && !searchable}
      {@render optionList()}
    {/if}
  {/if}
</div>
