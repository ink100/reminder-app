import { describe, expect, it } from "vitest";
import { createApp, eventHandler, toNodeListener } from "h3";
import { fetchNodeRequestHandler } from "node-mock-http";

import { setResponseCookie } from "@/lib/http/cookies";
import { compileRoute } from "@/server/http/compile-route";
import { dispatchEvent, dispatchRequest } from "@/server/http/dispatcher";
import type { UncompiledRouteDefinition } from "@/server/http/types";

function routes(...definitions: UncompiledRouteDefinition[]) {
  return definitions.map((definition) => compileRoute(definition));
}

function setCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return headers.getSetCookie?.() ?? [response.headers.get("set-cookie")!].filter(Boolean);
}

describe("Web Request/Response dispatcher", () => {
  it("passes body, duplicate query, headers and decoded dynamic params to a handler", async () => {
    const registry = routes({
      source: "test",
      path: "/api/items/:id",
      method: "POST",
      handler: async (request, { params }) => {
        const resolvedParams = await params;
        const form = await request.formData();
        return Response.json({
          id: resolvedParams.id,
          tags: new URL(request.url).searchParams.getAll("tag"),
          values: request.headers.get("x-value"),
          field: form.get("field"),
        }, { status: 201, statusText: "Made", headers: { "x-result": "yes" } });
      },
    });
    const form = new FormData();
    form.set("field", "payload");
    const request = new Request("https://example.test/api/items/a%252Fb?tag=one&tag=two", {
      method: "POST",
      headers: [["x-value", "one"], ["x-value", "two"]],
      body: form,
    });

    const response = await dispatchRequest(request, registry);
    expect(response?.status).toBe(201);
    expect(response?.statusText).toBe("Made");
    expect(response?.headers.get("x-result")).toBe("yes");
    await expect(response?.json()).resolves.toEqual({
      id: "a%2Fb",
      tags: ["one", "two"],
      values: "one, two",
      field: "payload",
    });
  });

  it("preserves empty, binary and streaming response bodies", async () => {
    const registry = routes(
      { source: "empty", path: "/empty", method: "GET", handler: () => new Response(null, { status: 204 }) },
      { source: "binary", path: "/binary", method: "GET", handler: () => new Response(new Uint8Array([0, 1, 255]), { headers: { "content-type": "application/octet-stream" } }) },
      { source: "stream", path: "/stream", method: "GET", handler: () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("first")); controller.enqueue(new TextEncoder().encode("second")); controller.close(); } })) },
    );

    expect((await dispatchRequest(new Request("https://example.test/empty"), registry))?.body).toBeNull();
    await expect((await dispatchRequest(new Request("https://example.test/binary"), registry))?.arrayBuffer().then((body) => Array.from(new Uint8Array(body)))).resolves.toEqual([0, 1, 255]);
    await expect((await dispatchRequest(new Request("https://example.test/stream"), registry))?.text()).resolves.toBe("firstsecond");
  });

  it("falls through for unknown paths and method mismatches", async () => {
    const registry = routes({ source: "known", path: "/known", method: "GET", handler: () => new Response("ok") });
    await expect(dispatchRequest(new Request("https://example.test/missing"), registry)).resolves.toBeUndefined();
    await expect(dispatchRequest(new Request("https://example.test/known", { method: "POST" }), registry)).resolves.toBeUndefined();
  });

  it("maps exceptions safely and emits handler plus context Set-Cookie values separately", async () => {
    const registry = routes(
      { source: "error", path: "/error", method: "GET", handler: () => { throw new Error("secret stack value"); } },
      { source: "cookies", path: "/cookies", method: "GET", handler: () => {
        setResponseCookie("contextA", "one", { path: "/", httpOnly: true });
        setResponseCookie("contextB", "two", { sameSite: "strict" });
        const headers = new Headers();
        headers.append("set-cookie", "handler=value; Path=/");
        return new Response("ok", { headers });
      } },
    );

    const failed = await dispatchRequest(new Request("https://example.test/error"), registry);
    expect(failed?.status).toBe(500);
    expect(await failed?.text()).not.toContain("secret stack value");

    const response = await dispatchRequest(new Request("https://example.test/cookies"), registry);
    expect(setCookies(response!)).toEqual([
      "handler=value; Path=/",
      "contextA=one; Path=/; HttpOnly",
      "contextB=two; SameSite=Strict",
    ]);
  });

  it("preserves status, headers, body and separate cookies across the H3/Web boundary", async () => {
    const registry = routes({
      source: "boundary",
      path: "/boundary",
      method: "POST",
      handler: async (request) => {
        setResponseCookie("context", "two", { path: "/" });
        const headers = new Headers({
          "content-type": "application/octet-stream",
          "x-request": request.headers.get("x-request") ?? "",
        });
        headers.append("set-cookie", "handler=one; Path=/");
        return new Response(await request.arrayBuffer(), {
          status: 202,
          statusText: "Accepted Here",
          headers,
        });
      },
    });
    const app = createApp();
    app.use(eventHandler((event) => dispatchEvent(event, registry)));
    const listener = toNodeListener(app);

    const response = await fetchNodeRequestHandler(listener as unknown as Parameters<typeof fetchNodeRequestHandler>[0], "https://example.test/boundary?item=one&item=two", {
      method: "POST",
      headers: { "content-type": "application/octet-stream", "x-request": "kept" },
      body: new Uint8Array([4, 5, 6]),
    });

    expect(response.status).toBe(202);
    expect(response.statusText).toBe("Accepted Here");
    expect(response.headers.get("x-request")).toBe("kept");
    expect(setCookies(response)).toEqual(["handler=one; Path=/", "context=two; Path=/"]);
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([4, 5, 6]);
  });
});
