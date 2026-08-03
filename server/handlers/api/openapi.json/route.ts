import { AI_OPENAPI_DOCUMENT } from "@/lib/ai-openapi";

export const dynamic = "force-static";

export function GET() {
  return Response.json(AI_OPENAPI_DOCUMENT, {
    headers: { "cache-control": "public, max-age=3600" },
  });
}
