import { AI_PLUGIN_MANIFEST } from "@/lib/ai-openapi";

export const dynamic = "force-static";

export function GET() {
  return Response.json(AI_PLUGIN_MANIFEST, {
    headers: { "cache-control": "public, max-age=3600" },
  });
}
