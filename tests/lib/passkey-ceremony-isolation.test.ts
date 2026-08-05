import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyRegistrationResponse = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  webAuthnChallenge: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() },
  webAuthnCredential: { create: vi.fn() },
  pendingTotpEnrollment: { findMany: vi.fn(), deleteMany: vi.fn() },
  loginThrottle: { findMany: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: vi.fn(), verifyRegistrationResponse,
  generateAuthenticationOptions: vi.fn(), verifyAuthenticationResponse: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/env", () => ({ env: { SESSION_SECRET: "test-secret-at-least-sixteen" } }));

import { createWebAuthnCeremony, getWebAuthnCeremony, hashCeremonyCookie } from "@/lib/webauthn-ceremonies";
import { verifyRegResponse } from "@/lib/webauthn";

describe("passkey ceremony isolation and registration atomicity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (work: (tx: typeof prismaMock) => unknown) => work(prismaMock));
    prismaMock.webAuthnChallenge.findMany.mockResolvedValue([]);
    prismaMock.webAuthnChallenge.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.webAuthnChallenge.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.webAuthnChallenge.create.mockImplementation(async ({ data }: { data: unknown }) => data);
    prismaMock.webAuthnChallenge.findFirst.mockResolvedValue({ id: "ceremony", challenge: "expected" });
    verifyRegistrationResponse.mockResolvedValue({ verified: true, registrationInfo: { credential: { id: "cred", publicKey: new Uint8Array([1]), counter: 0 } } });
  });

  it("supersedes all prior authentication attempts for the browser and flow", async () => {
    await createWebAuthnCeremony({ challenge: "new", flow: "AUTHENTICATION", browserToken: "browser" });
    expect(prismaMock.webAuthnChallenge.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ browserTokenHash: hashCeremonyCookie("browser"), flow: "AUTHENTICATION", consumedAt: null }),
      data: { consumedAt: expect.any(Date) },
    });
  });

  it("registration cap includes userId", async () => {
    await createWebAuthnCeremony({ challenge: "new", flow: "REGISTRATION", userId: "user-b", browserToken: "browser" });
    expect(prismaMock.webAuthnChallenge.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "user-b", flow: "REGISTRATION" }),
    }));
  });

  it("looks up the exact ceremony id with browser, flow, user and state constraints", async () => {
    await getWebAuthnCeremony({ ceremonyId: "ceremony", flow: "REGISTRATION", userId: "u1", browserToken: "browser" });
    expect(prismaMock.webAuthnChallenge.findFirst).toHaveBeenCalledWith({ where: {
      id: "ceremony", flow: "REGISTRATION", userId: "u1", browserTokenHash: hashCeremonyCookie("browser"),
      consumedAt: null, expiresAt: { gt: expect.any(Date) },
    } });
  });

  it("does not consume registration on failed cryptographic verification", async () => {
    verifyRegistrationResponse.mockResolvedValue({ verified: false });
    await expect(verifyRegResponse("u1", {} as never, "browser", "ceremony")).rejects.toThrow(/失败/);
    expect(prismaMock.webAuthnChallenge.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("puts registration consume and credential create in one transaction", async () => {
    prismaMock.webAuthnCredential.create.mockRejectedValue(new Error("credential insert failed"));
    await expect(verifyRegResponse("u1", {} as never, "browser", "ceremony")).rejects.toThrow("credential insert failed");
    expect(prismaMock.webAuthnChallenge.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "ceremony" }) }));
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});
