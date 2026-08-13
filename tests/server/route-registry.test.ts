import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { dispatchRequest } from "@/server/http/dispatcher";
import { routeRegistry } from "@/server/http/route-registry";

type ManifestEntry = { source: string; path: string; methods: string[] };

const fixture = JSON.parse(readFileSync(resolve("tests/fixtures/contracts/route-manifest.json"), "utf8")) as ManifestEntry[];
const normalize = (path: string) => path.replace(/\[([^\]]+)\]/g, ":$1");

describe("static route registry", () => {
  it("is bidirectionally equal to the frozen 71 path / 106 method manifest", () => {
    const expected = fixture.flatMap((entry) => entry.methods.map((method) => `${method} ${normalize(entry.path)}`)).sort();
    const actual = routeRegistry.map((entry) => `${entry.method} ${entry.path}`).sort();

    expect(routeRegistry).toHaveLength(106);
    expect(new Set(routeRegistry.map((entry) => entry.path)).size).toBe(71);
    expect(actual).toEqual(expected);
  });

  it("covers decoded dynamic and non-/api routes", () => {
    expect(routeRegistry.find((entry) => entry.method === "POST" && entry.path === "/queue/retry/:job_id")?.match("/queue/retry/job%2Fpart")).toEqual({ job_id: "job/part" });
    expect(routeRegistry.some((entry) => entry.path === "/.well-known/ai-plugin.json")).toBe(true);
    expect(routeRegistry.some((entry) => entry.path === "/notify")).toBe(true);
  });

  it("dispatches the existing stateless OpenAPI and public plugin handlers", async () => {
    const openapi = await dispatchRequest(new Request("https://example.test/api/openapi.json"));
    expect(openapi?.status).toBe(200);
    expect(openapi?.headers.get("cache-control")).toBe("public, max-age=3600");
    expect((await openapi?.json())?.openapi).toBeTruthy();

    const plugin = await dispatchRequest(new Request("https://example.test/.well-known/ai-plugin.json"));
    expect(plugin?.status).toBe(200);
    expect((await plugin?.json())?.schema_version).toBeTruthy();
  });

  it("contains static imports and no runtime filesystem discovery", () => {
    const source = readFileSync(resolve("server/http/route-registry.ts"), "utf8");
    expect(source).not.toMatch(/node:fs|readdir|glob\(/);
    expect(source.match(/^import \* as route\d+ from /gm)?.length).toBe(71);
  });
});
