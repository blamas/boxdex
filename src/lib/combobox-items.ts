export interface ComboboxItem {
  id: string;
  label: string;
}

// Prepend an "all" sentinel option to a mapped item list, the shape every
// filter dropdown with an unfiltered/all-values state needs.
export function withAll<T>(
  items: T[],
  toItem: (item: T) => ComboboxItem,
  allLabel: string
): ComboboxItem[] {
  return [{ id: "all", label: allLabel }, ...items.map(toItem)];
}
