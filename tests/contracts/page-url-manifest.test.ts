import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";

type PageManifestEntry = { source: string; url: string };

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function pageUrl(source: string): string {
  const segments = source
    .replace(/^app\/pages\//, "")
    .replace(/\.vue$/, "")
    .split("/")
    .filter((segment) => segment !== "index")
    .map((segment) => segment.replace(/^\[([^\]]+)\]$/, ":$1"));
  return segments.length ? `/${segments.join("/")}` : "/";
}

function discoverPages(root: string): PageManifestEntry[] {
  return walk(resolve(root, "app/pages"))
    .filter((file) => file.endsWith(`${sep}.vue`) || file.endsWith(".vue"))
    .map((file) => {
      const source = relative(root, file).split(sep).join("/");
      return { source, url: pageUrl(source) };
    })
    .sort((left, right) => left.source.localeCompare(right.source));
}

describe("frozen Nuxt page URL manifest", () => {
  const root = process.cwd();
  const fixturePath = resolve(root, "tests/fixtures/contracts/page-urls.json");

  it("freezes all 19 Nuxt page sources and public URLs", () => {
    expect(existsSync(fixturePath), "page URL fixture must exist").toBe(true);
    const expected = JSON.parse(readFileSync(fixturePath, "utf8")) as PageManifestEntry[];
    const actual = discoverPages(root);

    expect(actual).toEqual(expected);
    expect(actual).toHaveLength(19);
    expect(new Set(actual.map((page) => page.url)).size).toBe(19);
  });
});
