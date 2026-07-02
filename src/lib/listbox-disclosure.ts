// Vanilla-JS mirror of Combobox.svelte's non-searchable open/close/keyboard
// behavior, for the header locale switcher, which lives outside any Svelte
// island (transition:persist regions can't host client:only islands).
// Not unit-tested: pure DOM glue, excluded from coverage like url-state.ts.
export interface ListboxDisclosureOptions {
  onSelect?: (item: HTMLElement) => void;
}

export function initListboxDisclosure(
  trigger: HTMLElement,
  list: HTMLElement,
  options: ListboxDisclosureOptions = {}
) {
  const items = Array.from(list.querySelectorAll<HTMLElement>('[role="option"]'));
  let activeIdx = -1;

  function isOpen() {
    return !list.hidden;
  }

  function setActive(idx: number) {
    activeIdx = idx;
    for (const [i, item] of items.entries()) {
      item.classList.toggle("combobox-item-active", i === idx);
    }
    if (idx >= 0) items[idx].scrollIntoView({ block: "nearest" });
  }

  function open() {
    list.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  }

  function close(focusTrigger: boolean) {
    list.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    setActive(-1);
    if (focusTrigger) trigger.focus();
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isOpen()) close(false);
    else open();
  });

  trigger.addEventListener("keydown", (e) => {
    if (!isOpen()) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        open();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive(Math.min(activeIdx + 1, items.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive(activeIdx <= 0 ? items.length - 1 : activeIdx - 1);
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(items.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (activeIdx >= 0) items[activeIdx].click();
        break;
      case "Escape":
        e.preventDefault();
        close(true);
        break;
    }
  });

  for (const item of items) {
    item.addEventListener("click", () => {
      options.onSelect?.(item);
      close(false);
    });
  }

  document.addEventListener("click", (e) => {
    if (isOpen() && !trigger.contains(e.target as Node) && !list.contains(e.target as Node)) {
      close(false);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) close(true);
  });

  return {
    close: () => close(false),
  };
}
