import { describe, expect, it } from "vitest";

import {
  deleteResponseCookie,
  getRequestCookie,
  getResponseCookies,
  setResponseCookie,
} from "@/lib/http/cookies";
import { runWithRequestContext } from "@/server/context/request-context";

describe("framework-neutral cookies", () => {
  it("reads encoded request cookies and keeps concurrent writes isolated", async () => {
    const read = (value: string) => runWithRequestContext(
      new Request("https://example.test", { headers: { cookie: `name=${value}` } }),
      async () => {
        await Promise.resolve();
        setResponseCookie("seen", value);
        return [getRequestCookie("name"), getResponseCookies()];
      },
    );

    await expect(Promise.all([read("alpha"), read("beta")])).resolves.toEqual([
      ["alpha", ["seen=alpha"]],
      ["beta", ["seen=beta"]],
    ]);
  });

  it("serializes attributes, preserves multiple cookies, overwrites the same name/path, and deletes", () => {
    runWithRequestContext(new Request("https://example.test"), () => {
      setResponseCookie("session", "old", { path: "/", httpOnly: true });
      setResponseCookie("ceremony", "token", {
        path: "/api/auth",
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        maxAge: 300,
      });
      setResponseCookie("session", "new", { path: "/", httpOnly: true });
      deleteResponseCookie("ceremony", { path: "/api/auth", httpOnly: true, sameSite: "lax", secure: true });

      expect(getResponseCookies()).toEqual([
        "session=new; Path=/; HttpOnly",
        "ceremony=; Path=/api/auth; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
      ]);
    });
  });
});
