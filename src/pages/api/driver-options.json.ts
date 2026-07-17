import { getCollection } from "astro:content";
import type { APIRoute } from "astro";

// Trimmed driver list for label pickers (Compare, ContributeBox): id + brand/model/type only,
// so those pages don't download the full T/S dataset just to fill a combobox.
export const GET: APIRoute = async () => {
  const entries = await getCollection("drivers");
  const options = entries.map((e) => ({
    id: e.id,
    type: e.data.type,
    brand: e.data.brand,
    model: e.data.model,
  }));
  return Response.json(options);
};
