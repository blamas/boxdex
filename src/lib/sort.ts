// Shared raw-value comparator and "missing sorts last" wrapper for catalog.ts and metrics.ts,
// plus the column-header helpers. State stays in each island: they reset it on different
// signals (category vs tab).

export function nextSortState<K>(activeKey: K | undefined, asc: boolean, key: K) {
  return activeKey === key ? { key, asc: !asc } : { key, asc: true };
}

export function sortIndicator<K>(activeKey: K | undefined, asc: boolean, key: K): string {
  if (activeKey !== key) return "";
  return asc ? " ↑" : " ↓";
}

export function ariaSortFor<K>(
  activeKey: K | undefined,
  asc: boolean,
  key: K
): "ascending" | "descending" | "none" {
  if (activeKey !== key) return "none";
  return asc ? "ascending" : "descending";
}

export type SortableValue = number | string | boolean | undefined;

export function compareValues(va: SortableValue, vb: SortableValue): number {
  if (va === undefined || vb === undefined) return 0;
  return va < vb ? -1 : va > vb ? 1 : 0;
}

// Sorts by a value getter; items missing the value sort last regardless of direction.
export function sortByValueMissingLast<T>(
  items: T[],
  getValue: (item: T) => SortableValue,
  asc: boolean
): T[] {
  return [...items].sort((a, b) => {
    const va = getValue(a);
    const vb = getValue(b);
    if (va === undefined && vb === undefined) return 0;
    if (va === undefined) return 1;
    if (vb === undefined) return -1;
    const cmp = compareValues(va, vb);
    return asc ? cmp : -cmp;
  });
}
