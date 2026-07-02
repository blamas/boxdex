<script lang="ts">
const { text }: { text: string } = $props();
</script>

<button type="button" class="tip" aria-label={text}>
  ⓘ<span class="tip-bubble">{text}</span>
</button>

<style>
  .tip {
    position: relative;
    display: inline;
    padding: 0;
    background: none;
    border: none;
    border-bottom: 1px dotted var(--muted);
    font: inherit;
    cursor: help;
    color: var(--muted);
    outline: none;
  }

  /* Hosts include uppercase mono labels: reset text-transform/letter-spacing so the
     bubble reads as a sentence regardless of the surrounding label styling. */
  .tip-bubble {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    z-index: 10;
    width: max-content;
    max-width: 260px;
    padding: 0.5rem 0.6rem;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 4px;
    color: var(--text);
    font-size: 0.7rem;
    line-height: 1.4;
    text-transform: none;
    letter-spacing: normal;
    box-shadow: var(--shadow-md);
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.12s;
  }

  .tip:hover .tip-bubble,
  .tip:focus-visible .tip-bubble {
    opacity: 1;
    visibility: visible;
  }
</style>
