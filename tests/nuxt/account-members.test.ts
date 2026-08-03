import { flushPromises, mount } from "@vue/test-utils";
import ElementPlus, { ElMessageBox } from "element-plus";
import { computed, onMounted, reactive, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PasskeyManager from "@/app/components/account/PasskeyManager.vue";
import OtpResetCard from "@/app/components/account/OtpResetCard.vue";
import TrustedDevicesCard from "@/app/components/account/TrustedDevicesCard.vue";
import MemberManagement from "@/app/components/members/MemberManagement.vue";

const apiFetch = vi.fn();

beforeEach(() => {
  apiFetch.mockReset();
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("reactive", reactive);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("onMounted", onMounted);
  vi.stubGlobal("useApi", () => ({ apiFetch }));
  vi.stubGlobal("useAuth", () => ({ clearAuth: vi.fn(), fetchStatus: vi.fn() }));
  vi.stubGlobal("navigateTo", vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const global = {
  plugins: [ElementPlus],
  stubs: { PasskeyRegister: { template: "<div>register</div>" } },
};

describe("Nuxt account security", () => {
  it("loads passkeys and prevents deleting the last authentication factor", async () => {
    apiFetch.mockResolvedValueOnce({ items: [{
      id: "key-1", credentialId: "credential", deviceName: "MacBook", authenticatorType: "platform",
      createdAt: "2026-01-01T00:00:00.000Z", lastUsedAt: null,
    }] });
    const wrapper = mount(PasskeyManager, { props: { otpConfigured: false }, global });
    await flushPromises();

    expect(apiFetch).toHaveBeenCalledWith("/api/auth/passkey/list");
    expect(wrapper.text()).toContain("MacBook");
    expect(wrapper.text()).toContain("唯一登录凭证不可删除");
    expect(wrapper.get("button.el-button--danger").attributes()).toHaveProperty("disabled");
    expect(wrapper.emitted("count")?.[0]).toEqual([1]);
  });

  it("confirms and deletes a passkey when another factor exists", async () => {
    apiFetch.mockResolvedValueOnce({ items: [{ id: "key-1", credentialId: "c", deviceName: "Key", authenticatorType: "platform", createdAt: "2026-01-01", lastUsedAt: null }] });
    vi.spyOn(ElMessageBox, "confirm").mockResolvedValue(undefined as never);
    const wrapper = mount(PasskeyManager, { props: { otpConfigured: true }, global });
    await flushPromises();
    apiFetch.mockResolvedValueOnce({ success: true });

    await wrapper.get("button.el-button--danger").trigger("click");
    await flushPromises();
    expect(ElMessageBox.confirm).toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledWith("/api/auth/passkey/key-1", { method: "DELETE" });
  });

  it("protects OTP reset when no other factor exists", () => {
    const wrapper = mount(OtpResetCard, { props: { hasOtherFactor: false }, global });
    expect(wrapper.text()).toContain("唯一登录方式");
    expect(wrapper.get("button").attributes()).toHaveProperty("disabled");
  });

  it("loads and confirms revocation of a trusted device", async () => {
    apiFetch.mockResolvedValueOnce({ devices: [{ id: "device-1", deviceName: "Phone", userAgent: "Chrome/120", ipAddress: null, expiresAt: "2026-12-01", lastUsedAt: null, createdAt: "2026-01-01" }] });
    vi.spyOn(ElMessageBox, "confirm").mockResolvedValue(undefined as never);
    const wrapper = mount(TrustedDevicesCard, { global });
    await flushPromises();
    apiFetch.mockResolvedValueOnce({ success: true });

    await wrapper.get("button.el-button--danger").trigger("click");
    await flushPromises();
    expect(apiFetch).toHaveBeenCalledWith("/api/auth/trusted/devices", { method: "DELETE", body: { id: "device-1" } });
  });
});

describe("Nuxt member management", () => {
  it("loads members and disables self-lock and last-admin actions in the UI", async () => {
    apiFetch.mockResolvedValueOnce({ members: [
      { id: "me", username: "admin", displayName: "我", role: "ADMIN", status: "ACTIVE" },
      { id: "member-1", username: "member", displayName: "成员", role: "MEMBER", status: "ACTIVE" },
    ], invitations: [] });
    const wrapper = mount(MemberManagement, { props: { actorId: "me" }, global });
    await flushPromises();

    expect(apiFetch).toHaveBeenCalledWith("/api/admin/members");
    const selfRow = wrapper.findAll("article").find((row) => row.text().includes("当前账户"));
    expect(selfRow).toBeTruthy();
    expect(selfRow!.findAll("button").find((button) => button.text().includes("撤销访问"))?.attributes()).toHaveProperty("disabled");
    expect(selfRow!.findAll(".el-select__wrapper").every((select) => select.classes().includes("is-disabled"))).toBe(true);
  });

  it("uses a dangerous confirmation before revoking another member", async () => {
    apiFetch.mockResolvedValueOnce({ members: [
      { id: "me", username: "admin", displayName: "我", role: "ADMIN", status: "ACTIVE" },
      { id: "admin-2", username: "admin2", displayName: "管理员二", role: "ADMIN", status: "ACTIVE" },
      { id: "member-1", username: "member", displayName: "成员", role: "MEMBER", status: "ACTIVE" },
    ], invitations: [] });
    vi.spyOn(ElMessageBox, "confirm").mockResolvedValue(undefined as never);
    const wrapper = mount(MemberManagement, { props: { actorId: "me" }, global });
    await flushPromises();
    apiFetch.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ members: [], invitations: [] });
    const row = wrapper.findAll("article").find((item) => item.text().includes("member"))!;
    const revoke = row.findAll("button").find((button) => button.text().includes("撤销访问"))!;
    await revoke.trigger("click");
    await flushPromises();

    expect(ElMessageBox.confirm).toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledWith("/api/admin/members/member-1/revoke-access", { method: "POST" });
  });
});
