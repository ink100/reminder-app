import { describe, expect, it } from "vitest";

import {
  getRequestContext,
  runWithRequestContext,
} from "@/server/context/request-context";

describe("request context", () => {
  it("isolates concurrent requests and their response cookies", async () => {
    let releaseFirst!: () => void;
    const firstMayFinish = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const first = runWithRequestContext(new Request("https://example.test/", {
      headers: { cookie: "actor=first; shared=one" },
    }), async () => {
      expect(getRequestContext().requestCookies.get("actor")).toBe("first");
      getRequestContext().responseCookies.push("result=first; Path=/");
      await firstMayFinish;
      expect(getRequestContext().requestCookies.get("actor")).toBe("first");
      return [...getRequestContext().responseCookies];
    });

    const second = runWithRequestContext(new Request("https://example.test/", {
      headers: { cookie: "actor=second; shared=two" },
    }), async () => {
      expect(getRequestContext().requestCookies.get("actor")).toBe("second");
      getRequestContext().responseCookies.push("result=second; Path=/");
      releaseFirst();
      return [...getRequestContext().responseCookies];
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      ["result=first; Path=/"],
      ["result=second; Path=/"],
    ]);
  });

  it("throws outside a dispatched request", () => {
    expect(() => getRequestContext()).toThrow(/request context/i);
  });
});
