import { createFromSource } from "fumadocs-core/search/server";
import { source } from "@/lib/source";

const search = createFromSource(source, {
  language: "english",
});

export async function GET(request: Request): Promise<Response> {
  const response = await search.GET(request);
  response.headers.set("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return response;
}
