<script lang="ts">
import { onMount } from "svelte";
import type { Translations } from "../i18n";
import { CATEGORY_FILTERS, type CategoryFilter } from "../lib/category";
import { humanize } from "../lib/format";
import {
  AXIS_FIELDS,
  type EnclosureRecord,
  filterByCategory,
  type MetricKey,
  sortRecords,
} from "../lib/metrics";
import { BASE } from "../lib/site";
import { decodeStack, encodeStack } from "../lib/stack";
import LoadMore from "./LoadMore.svelte";

interface Props {
  t: Translations["catalogGrid"];
  localeBase: string;
  categoryLabels: Translations["categoryLabels"];
  axisLabels: Translations["axisLabels"];
}

const { t, localeBase, categoryLabels, axisLabels }: Props = $props();

let records = $state<EnclosureRecord[]>([]);
let category = $state<CategoryFilter>("all");
let sortKey = $state<MetricKey | "name">("name");

let addedSlugs = $state(new Set<string>());

onMount(async () => {
  const res = await fetch(`${BASE}/api/manifest.json`);
  records = await res.json();
});

function addToStack(slug: string, e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  try {
    const raw = localStorage.getItem("boxdex-stack") ?? "";
    const { state, cov } = decodeStack(raw);
    localStorage.setItem("boxdex-stack", encodeStack([...state, { slug, qty: 1 }], cov));
  } catch (_) {}
  addedSlugs = new Set([...addedSlugs, slug]);
  setTimeout(() => {
    addedSlugs = new Set([...addedSlugs].filter((s) => s !== slug));
  }, 1200);
}

const displayed = $derived.by(() => sortRecords(filterByCategory(records, category), sortKey));

const ROW_LIMIT = 100;
let limit = $state(ROW_LIMIT);
const visibleCards = $derived(displayed.slice(0, limit));
</script>

<div class="catalog-controls">
  <div class="cat-buttons">
    {#each CATEGORY_FILTERS as cat}
      <button class:active={category === cat} onclick={() => (category = cat)}>
        {cat === "all" ? t.all : (categoryLabels[cat as keyof typeof categoryLabels] ?? cat)}
      </button>
    {/each}
  </div>
  <label class="sort-label">
    <span>{t.sort}</span>
    <select bind:value={sortKey}>
      <option value="name">{t.nameAZ}</option>
      {#each AXIS_FIELDS as f}
        <option value={f.key}>{axisLabels[f.key as keyof typeof axisLabels] ?? f.label} ({f.unit})</option>
      {/each}
    </select>
  </label>
  <span class="count">{displayed.length} {displayed.length === 1 ? t.design : t.designs}</span>
</div>

{#if displayed.length === 0}
  <div class="empty-state">{t.emptyState}</div>
{:else}
  <div class="grid">
    {#each visibleCards as rec (rec.slug)}
      <article class="card">
        <div class="card-header">
          <span class="badge badge-{rec.category}">{rec.category}</span>
          <span class="badge badge-{rec.provenance}">{rec.provenance}</span>
          {#if rec.verified}<span class="badge badge-verified">{t.verified}</span>{/if}
          <button
            class="add-btn"
            class:add-btn-done={addedSlugs.has(rec.slug)}
            onclick={(e) => addToStack(rec.slug, e)}
          >{addedSlugs.has(rec.slug) ? t.added : t.addToStack}</button>
        </div>
        <h2 class="card-name">
          <a href="{localeBase}/enclosures/{rec.slug}" class="card-link">{rec.name}</a>
        </h2>
        <p class="topology">
          {humanize(rec.topology)}
          {#if rec.topologyVariant} · {rec.topologyVariant}{/if}
          {#if rec.ways !== undefined} · {rec.ways}-way{/if}
        </p>
        <dl class="specs">
          <dt>{t.volume}</dt>
          <dd>{rec.metrics.volumeL !== undefined ? `${rec.metrics.volumeL} L` : ""}</dd>
          <dt>{t.f3}</dt>
          <dd>{rec.metrics.f3Hz !== undefined ? `${rec.metrics.f3Hz} Hz` : ""}</dd>
          {#if rec.metrics.f3HzHigh !== undefined}
            <dt>{t.f3High}</dt>
            <dd>{rec.metrics.f3HzHigh} Hz</dd>
          {/if}
          {#if rec.metrics.maxSplDb !== undefined}
            <dt>{t.maxSpl}</dt>
            <dd>{rec.metrics.maxSplDb} dB</dd>
          {/if}
          <dt>{t.drivers}</dt>
          <dd>
            {#if rec.driverSizes.length === 0 && rec.compressionExits.length === 0}
              {rec.driverCount}
            {:else}
              {@const coneCount = rec.driverCount - rec.compressionExits.length}
              {@const parts = [
                ...(coneCount > 0 && rec.driverSizes.length > 0 ? [`${coneCount}×${rec.driverSizes.map((s) => `${s}"`).join("+")}`] : []),
                ...rec.compressionExits.map((e) => `1×${e}"`),
              ]}
              <span class="driver-size">{parts.join(" + ")}</span>
            {/if}
          </dd>
        </dl>
        {#if rec.recommendedFor.length > 0}
          <ul class="tag-list">
            {#each rec.recommendedFor as tag}
              <li class="tag">{tag}</li>
            {/each}
          </ul>
        {/if}
      </article>
    {/each}
  </div>
  <LoadMore remaining={displayed.length - visibleCards.length} onmore={() => (limit += ROW_LIMIT)} />
{/if}

<style>
  .catalog-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 1.5rem;
  }

  .cat-buttons {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 4px;
    overflow: hidden;
  }

  .cat-buttons button {
    background: var(--panel);
    border: none;
    border-right: 1px solid var(--line);
    color: var(--muted);
    padding: 0.35rem 0.85rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .cat-buttons button:last-child {
    border-right: none;
  }

  .cat-buttons button.active {
    background: var(--bg);
    color: var(--accent);
  }

  .sort-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--muted);
  }

  .count {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--muted);
  }

  .card-link {
    text-decoration: none;
    color: inherit;
  }

  .card-link::after {
    content: "";
    position: absolute;
    inset: 0;
  }

  .card {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .card-header {
    display: flex;
    gap: 0.4rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .card-header .add-btn {
    margin-left: auto;
    position: relative;
    z-index: 1;
  }

  .card-name {
    font-size: 1.1rem;
    margin-bottom: 0.25rem;
    color: var(--text);
  }

  .topology {
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 0.8rem;
    margin: 0 0 0.75rem;
    text-transform: capitalize;
  }

  .specs {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.2rem 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    margin: 0;
  }

  dt {
    color: var(--muted);
  }

  dd {
    margin: 0;
    color: var(--text);
  }

  .driver-size {
    color: var(--text);
    margin-left: 0.2rem;
  }


  .tag-list {
    list-style: none;
    padding: 0;
    margin: 0.75rem 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .tag {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
    background: var(--surface-subtle);
    border: 1px solid var(--line);
    color: var(--muted);
  }

  .add-btn {
    background: none;
    border: 1px solid var(--line);
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    padding: 0.2rem 0.6rem;
    border-radius: 3px;
    cursor: pointer;
    transition: border-color 0.1s, color 0.1s;
  }

  .add-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .add-btn-done {
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
