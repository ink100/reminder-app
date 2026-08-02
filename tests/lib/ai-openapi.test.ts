import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { AI_OPENAPI_DOCUMENT, AI_PLUGIN_MANIFEST } from "@/lib/ai-openapi";

const methods = ["get", "post", "put", "patch", "delete"] as const;
const root = path.resolve(process.cwd(), "app");
const identityOrCredentialRoute = /^api\/(?:auth|invite|admin\/(?:members|member-invitations)|notification-center\/api-keys)(?:\/|$)/;

function routePath(file: string) {
  return `/${path.relative(root, path.dirname(file)).replaceAll(path.sep, "/").replace(/\[([^\]]+)\]/g, "{$1}")}`;
}

function walk(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const item = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(item) : entry.name === "route.ts" ? [item] : [];
  });
}

describe("AI OpenAPI surface", () => {
  it("is OpenAPI 3.0.3, excludes identity routes, and has unique stable operationIds", () => {
    expect(AI_OPENAPI_DOCUMENT.openapi).toBe("3.0.3");
    const documentedPaths = Object.keys(AI_OPENAPI_DOCUMENT.paths);
    expect(documentedPaths.some((item) => /(^|\/)auth(\/|$)|(^|\/)invite(\/|$)|otp|reset|admin\/(members|member-invitations)|notification-center\/api-keys/i.test(item))).toBe(false);

    const operationIds = Object.values(AI_OPENAPI_DOCUMENT.paths).flatMap((pathItem) =>
      methods.flatMap((method) => {
        const operation = (pathItem as Record<string, { operationId?: string }>)[method];
        return operation?.operationId ? [operation.operationId] : [];
      }),
    );
    expect(operationIds.length).toBeGreaterThan(50);
    expect(new Set(operationIds).size).toBe(operationIds.length);
    expect(operationIds.every((id) => /^[a-z][A-Za-z0-9]+$/.test(id))).toBe(true);
  });

  it("documents every guarded machine-enabled business route and method", () => {
    const missing: string[] = [];
    for (const file of walk(root)) {
      const source = fs.readFileSync(file, "utf8");
      const relative = path.relative(root, file).replaceAll(path.sep, "/");
      if (identityOrCredentialRoute.test(relative) || relative === "api/settings/otp/reset/route.ts") continue;
      const machineEnabled = /require(?:ApiSession|AdminApi|AdminMemberApi)\((?:_?request)\)/.test(source)
        || relative === "notify/route.ts";
      if (!machineEnabled) continue;
      const openapiPath = routePath(file);
      for (const match of source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\s*\(/g)) {
        const method = match[1].toLowerCase();
        if (!(AI_OPENAPI_DOCUMENT.paths as Record<string, Record<string, unknown>>)[openapiPath]?.[method]) {
          missing.push(`${match[1]} ${openapiPath}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("keeps identity routes cookie-only while business guards receive Request explicitly", () => {
    const identityFiles = walk(root).filter((file) => {
      const relative = path.relative(root, file).replaceAll(path.sep, "/");
      return identityOrCredentialRoute.test(relative) || relative === "api/settings/otp/reset/route.ts";
    });
    for (const file of identityFiles) {
      const source = fs.readFileSync(file, "utf8");
      expect(source).not.toMatch(/require(?:ApiSession|AdminApi|AdminMemberApi)\((?:_?request)\)/);
    }

    const unguarded: string[] = [];
    for (const file of walk(root)) {
      const source = fs.readFileSync(file, "utf8");
      const relative = path.relative(root, file).replaceAll(path.sep, "/");
      if (identityOrCredentialRoute.test(relative) || relative === "api/settings/otp/reset/route.ts") continue;
      if (/require(?:ApiSession|AdminApi|AdminMemberApi)\(\)/.test(source)) unguarded.push(relative);
    }
    expect(unguarded).toEqual([]);
  });

  it("passes Request through notification-center compatibility wrappers", () => {
    for (const relative of [
      "api/notification-center/channels/route.ts",
      "api/notification-center/groups/route.ts",
      "api/notification-center/templates/route.ts",
    ]) {
      const source = fs.readFileSync(path.join(root, relative), "utf8");
      expect(source).toMatch(/return get[A-Za-z]+\(request\)/);
    }
  });

  it("describes creation status codes and partial-update schemas accurately", () => {
    const paths = AI_OPENAPI_DOCUMENT.paths as Record<string, Record<string, {
      responses?: Record<string, unknown>;
      requestBody?: { content?: Record<string, { schema?: { required?: string[] } }> };
    }>>;
    for (const [pathName, method] of [
      ["/api/images", "post"],
      ["/api/reminders", "post"],
      ["/api/medicines", "post"],
      ["/api/license/store-accounts", "post"],
      ["/api/todos", "post"],
      ["/channels", "post"],
      ["/groups", "post"],
      ["/templates", "post"],
    ]) {
      expect(paths[pathName][method].responses).toHaveProperty("201");
    }
    expect(paths["/api/notification-center/groups/{id}"].patch.requestBody?.content?.["application/json"].schema?.required).toBeUndefined();
    expect(paths["/api/notification-center/templates/{id}"].patch.requestBody?.content?.["application/json"].schema?.required).toBeUndefined();
  });

  it("publishes a plugin manifest pointing at the OpenAPI endpoint", () => {
    expect(AI_PLUGIN_MANIFEST.schema_version).toBe("v1");
    expect(AI_PLUGIN_MANIFEST.api).toMatchObject({ type: "openapi", url: "/api/openapi.json" });
    expect(AI_PLUGIN_MANIFEST.logo_url).toBe("/favicon.ico");
  });
});
