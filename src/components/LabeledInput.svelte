<script lang="ts" generics="T extends string | number | null">
import { getContext } from "svelte";
import { CONTRIBUTE_VALIDATION_CONTEXT } from "../lib/contribute-i18n";

// type="number" binds null when empty, so callers omit absent optionals without string parsing.
let {
  label,
  value = $bindable(),
  type = "text",
  min,
  max,
  minlength,
  maxlength,
  placeholder,
  errors = [],
}: {
  label: string;
  value?: T;
  type?: "text" | "url" | "number";
  min?: number;
  max?: number;
  minlength?: number;
  maxlength?: number;
  placeholder?: string;
  errors?: string[];
} = $props();

const validationContext = getContext<{ validation: Record<string, string> }>(
  CONTRIBUTE_VALIDATION_CONTEXT
);

// A number input that can't parse what was typed (a stray letter, an incomplete "1e",
// a bad paste) reflects value as null: indistinguishable from "empty" by value alone, so
// track the native validity state to tell "unfilled" apart from "unparseable".
let badInput = $state(false);
function onNumberInput(e: Event) {
  badInput = (e.currentTarget as HTMLInputElement).validity.badInput;
}

// A required field with no value reads as "unfilled" (red), one with a value (or bad native
// input) that still fails validation reads as "wrong" (amber). Both derive from the errors
// list plus badInput so no caller needs to separately declare which fields are required.
const isEmpty = $derived(value === null || value === undefined || value === "");
const missing = $derived(!badInput && errors.length > 0 && isEmpty);
const invalid = $derived(badInput || (errors.length > 0 && !isEmpty));
const displayErrors = $derived(
  badInput ? [validationContext?.validation?.notANumber ?? "Enter a valid number"] : errors
);
</script>

<label class="field">
  <span>{label}</span>
  {#if type === "number"}
    <input
      type="number"
      {min}
      {max}
      bind:value
      oninput={onNumberInput}
      class:field-missing={missing}
      class:field-invalid={invalid}
    />
  {:else if type === "url"}
    <input type="url" {placeholder} bind:value class:field-missing={missing} class:field-invalid={invalid} />
  {:else}
    <input
      type="text"
      {placeholder}
      {minlength}
      {maxlength}
      bind:value
      class:field-missing={missing}
      class:field-invalid={invalid}
    />
  {/if}
  {#each displayErrors as m}<span class="err">{m}</span>{/each}
</label>
