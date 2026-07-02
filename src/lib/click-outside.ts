// Svelte action: call onOutside when a pointer-down lands outside the node. Listens on
// mousedown (not click) so the interaction that opened the popover can't immediately
// close it, and so pressing inside then releasing outside doesn't count as outside.
// Not unit-tested: pure DOM glue, excluded from coverage like listbox-disclosure.ts.
export function clickOutside(node: HTMLElement, onOutside: () => void) {
  function handler(e: MouseEvent) {
    if (!node.contains(e.target as Node)) onOutside();
  }
  document.addEventListener("mousedown", handler);
  return {
    destroy() {
      document.removeEventListener("mousedown", handler);
    },
  };
}
