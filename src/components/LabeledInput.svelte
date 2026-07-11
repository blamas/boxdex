<script lang="ts" generics="T extends string | number | null">
// One labelled input for text/url/number fields with inline errors. type="number" binds
// null when empty, so callers omit absent optionals without string parsing. Styling
// comes from the global .field/.err classes and input rules.
let {
  label,
  value = $bindable(),
  type = "text",
  min,
  max,
  placeholder,
  errors = [],
}: {
  label: string;
  value?: T;
  type?: "text" | "url" | "number";
  min?: number;
  max?: number;
  placeholder?: string;
  errors?: string[];
} = $props();
</script>

<label class="field">
  <span>{label}</span>
  {#if type === "number"}
    <input type="number" {min} {max} bind:value />
  {:else if type === "url"}
    <input type="url" {placeholder} bind:value />
  {:else}
    <input type="text" {placeholder} bind:value />
  {/if}
  {#each errors as m}<span class="err">{m}</span>{/each}
</label>
