import { getCollection } from "astro:content";
import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
  const entries = await getCollection("drivers");
  // Group cones first (sorted by size), then compression drivers (sorted by exit).
  const drivers = entries
    .map((e) => ({ id: e.id, ...e.data }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "cone" ? -1 : 1;
      if (a.type === "cone" && b.type === "cone") {
        return a.sizeInch - b.sizeInch || a.impedanceOhm - b.impedanceOhm;
      }
      if (a.type === "compression" && b.type === "compression") {
        return a.exitInch - b.exitInch || a.impedanceOhm - b.impedanceOhm;
      }
      return 0;
    });
  return Response.json(drivers);
};
