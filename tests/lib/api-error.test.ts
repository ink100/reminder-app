import { describe, expect, it } from "vitest";
import { z } from "zod";

import { toApiErrorResponse } from "@/lib/api-error";

describe("toApiErrorResponse", () => {
  it("maps zod validation errors to 400", async () => {
    const schema = z.object({ name: z.string().min(1) });
    let error: unknown;

    try {
      schema.parse({ name: "" });
    } catch (caught) {
      error = caught;
    }

    const response = toApiErrorResponse(error, {
      defaultMessage: "请求参数不合法",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "请求参数不合法" });
  });

  it("maps not found database errors to 404", async () => {
    const response = toApiErrorResponse({ code: "P2025" }, { notFoundMessage: "Not found" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });

  it("maps unknown errors to 500", async () => {
    const response = toApiErrorResponse(new Error("boom"), {
      internalMessage: "Internal server error",
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Internal server error" });
  });
});
