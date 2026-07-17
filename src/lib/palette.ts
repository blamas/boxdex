// Fixed palette for multi-series charts (theme accents cover only the first two slots;
// series counts beyond that need stable, distinguishable colors in both themes). Kept out
// of echarts.ts so importing the palette doesn't pull in the ECharts registration bundle.
export const SERIES_COLORS: string[] = [
  "#39ff14", // signal-green (accent)
  "#ffb300", // amber (accent-2)
  "#4fc3f7", // sky
  "#ef5350", // red
  "#ab47bc", // purple
  "#26a69a", // teal
  "#ff7043", // deep-orange
  "#78909c", // blue-grey
];
