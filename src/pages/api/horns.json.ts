import { getCollection } from "astro:content";

export async function GET() {
  const entries = await getCollection("horns");
  const horns = entries
    .map((e) => ({ id: e.id, ...e.data }))
    .sort(
      (a, b) =>
        a.exitInch - b.exitInch ||
        a.coverageHorizontalDeg - b.coverageHorizontalDeg ||
        a.brand.localeCompare(b.brand)
    );
  return Response.json(horns);
}
