// Single source of truth for enclosure categories. Add one here and every
// filter, label and type picks it up.

export const CATEGORIES = ["sub", "kick", "mid", "top"] as const;
export type Category = (typeof CATEGORIES)[number];

// "all" pseudo-category used by catalog/explorer filters.
export const CATEGORY_FILTERS = ["all", ...CATEGORIES] as const;
export type CategoryFilter = (typeof CATEGORY_FILTERS)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  sub: "Subwoofer",
  kick: "Kick bin",
  mid: "Midrange",
  top: "Top",
};
