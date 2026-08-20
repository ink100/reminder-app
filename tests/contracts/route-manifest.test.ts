import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { routeRegistry } from "@/server/http/route-registry";

type RouteManifestEntry = {
  source: string;
  path: string;
  methods: string[];
};

type RouteContract = { source: string; path: string; method: string };

function manifestContracts(routes: RouteManifestEntry[]): RouteContract[] {
  return routes.flatMap((route) => route.methods.map((method) => ({
    source: route.source,
    path: route.path.replace(/\[([^\]]+)\]/g, ":$1"),
    method,
  }))).sort(compareContracts);
}

function registryContracts(): RouteContract[] {
  return routeRegistry.map(({ source, path, method }) => ({ source, path, method })).sort(compareContracts);
}

function compareContracts(left: RouteContract, right: RouteContract): number {
  return `${left.source}\0${left.path}\0${left.method}`.localeCompare(`${right.source}\0${right.path}\0${right.method}`);
}

describe("frozen route manifest", () => {
  const root = process.cwd();
  const fixturePath = resolve(root, "tests/fixtures/contracts/route-manifest.json");

  it("keeps every fixture source, path, and method in the route registry in both directions", () => {
    expect(existsSync(fixturePath), "route manifest fixture must exist").toBe(true);
    const expected = JSON.parse(readFileSync(fixturePath, "utf8")) as RouteManifestEntry[];
    const expectedContracts = manifestContracts(expected);
    const actualContracts = registryContracts();

    expect(actualContracts).toEqual(expectedContracts);
    expect(expected).toHaveLength(72);
    expect(actualContracts).toHaveLength(109);
  });

  it("contains no duplicate path and method contracts", () => {
    const routes = JSON.parse(readFileSync(fixturePath, "utf8")) as RouteManifestEntry[];
    const contracts = manifestContracts(routes).map(({ method, path }) => `${method} ${path}`);

    expect(new Set(contracts).size).toBe(contracts.length);
    expect(routes.every((route) => route.methods.length > 0)).toBe(true);
  });
});
