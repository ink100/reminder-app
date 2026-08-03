import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const excludedDirectories = new Set([
  "node_modules", ".git", "build", "release", ".nuxt", ".output", ".next", "coverage",
]);
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".vue"]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return sourceExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

describe("React and Next framework removal", () => {
  const root = resolve(process.cwd());

  it("contains no TSX or JSX source files", () => {
    const legacyFiles = sourceFiles(root)
      .filter((file) => /\.(?:tsx|jsx)$/.test(file))
      .map((file) => relative(root, file));
    expect(legacyFiles).toEqual([]);
  });

  it("contains no Next or React imports in source", () => {
    const legacyImports = sourceFiles(root).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return /(?:from\s*|import\s*\(|require\s*\()\s*["'](?:next(?:\/[^"']*)?|react(?:-dom)?(?:\/[^"']*)?)["']/.test(source)
        ? [relative(root, file)]
        : [];
    });
    expect(legacyImports).toEqual([]);
  });

  it("declares no direct React or Next dependencies", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const direct = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
    const forbidden = [
      "next", "react", "react-dom", "@radix-ui/react-alert-dialog", "lucide-react", "clsx",
      "tailwind-merge", "@testing-library/react", "@types/react", "@types/react-dom",
      "@vitejs/plugin-react", "eslint-config-next",
    ];
    expect(forbidden.filter((name) => name in direct)).toEqual([]);
  });

  it("contains no legacy Next production commands", () => {
    const operationalFiles = ["package.json", "start.sh", "scripts/reminder-app.service"];
    const legacyCommands = operationalFiles.filter((file) => {
      const source = readFileSync(join(root, file), "utf8");
      return /(?:node_modules\/\.bin\/next|\bnext\s+(?:dev|build|start)\b)/.test(source);
    });
    expect(legacyCommands).toEqual([]);
  });
});
