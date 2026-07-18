// Pure, testable logic for the enclosure detail page's inline lightbox <script>.

// Wraps an index into [0, length) so prev/next can cycle past either end.
export function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}

// Fills a "{n} / {total}" style format string with 1-based position and total count.
export function formatCounter(format: string, n: number, total: number): string {
  return format.replace("{n}", String(n)).replace("{total}", String(total));
}
