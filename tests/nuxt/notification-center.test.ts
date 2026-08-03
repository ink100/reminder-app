import { flushPromises, mount } from "@vue/test-utils";
import ElementPlus from "element-plus";
import { computed, onMounted, reactive, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import NotificationCenterDashboard from "@/app/components/notification-center/NotificationCenterDashboard.vue";
import PushLedgerDashboard from "@/app/components/notification-center/PushLedgerDashboard.vue";

const apiFetch = vi.fn();
const confirm = vi.fn();
const global = { plugins: [ElementPlus] };
const fakeWorkerKey = "fake_worker_key_for_vue_test_only";
const fakeAiKey = "fake_ai_key_for_vue_test_only";

beforeEach(() => {
  apiFetch.mockReset();
  confirm.mockReset();
  confirm.mockResolvedValue(undefined);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("reactive", reactive);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("onMounted", onMounted);
  vi.stubGlobal("useApi", () => ({ apiFetch }));
  vi.stubGlobal("ElMessageBox", { confirm });
  vi.stubGlobal("ElMessage", { success: vi.fn(), error: vi.fn() });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function notificationResponse(url: string) {
  if (url === "/api/notification-center/groups") return { items: [{ id: "group-1", name: "inventory", description: "库存", enabled: true }] };
  if (url === "/api/notification-center/channels") return { items: [{ id: "channel-1", name: "Telegram 主渠道", type: "Telegram", enabled: true, isDefault: true, configured: true, configKeys: ["chatId"] }] };
  if (url === "/api/notification-center/templates") return { items: [{ id: "template-1", name: "默认模板", channelType: "Telegram", content: "{{title}}", enabled: true, groupId: null, isDefault: true }] };
  if (url === "/api/notification-center/api-keys") return { items: [{ id: "key-1", name: "Worker", apiKey: fakeWorkerKey, enabled: true, scopes: ["notifications:send"] }, { id: "key-2", name: "AI", apiKey: fakeAiKey, enabled: true, scopes: ["ai:all", "notifications:send"] }] };
  if (url === "/notifications?limit=20") return { items: [] };
  if (url === "/queue/jobs?limit=200") return { items: [{ status: "RetryWaiting" }] };
  return { success: true };
}

describe("Nuxt notification center", () => {
  it("loads every management API and shows protected full fake keys with exact scopes", async () => {
    apiFetch.mockImplementation((url: string) => Promise.resolve(notificationResponse(url)));
    const wrapper = mount(NotificationCenterDashboard, { global });
    await flushPromises();

    expect(apiFetch).toHaveBeenCalledWith("/api/notification-center/groups");
    expect(apiFetch).toHaveBeenCalledWith("/api/notification-center/channels");
    expect(apiFetch).toHaveBeenCalledWith("/api/notification-center/templates");
    expect(apiFetch).toHaveBeenCalledWith("/api/notification-center/api-keys");
    expect(apiFetch).toHaveBeenCalledWith("/notifications?limit=20");
    expect(apiFetch).toHaveBeenCalledWith("/queue/jobs?limit=200");

    const apiTab = wrapper.findAll(".el-tabs__item").find(item => item.text().includes("API Keys"))!;
    await apiTab.trigger("click");
    expect(wrapper.text()).toContain(fakeWorkerKey);
    expect(wrapper.text()).toContain(fakeAiKey);
    expect(wrapper.text()).toContain("Scopes: notifications:send");
    expect(wrapper.text()).toContain("Scopes: ai:all, notifications:send");
  });

  it("requires dangerous confirmation before dispatching", async () => {
    apiFetch.mockImplementation((url: string) => Promise.resolve(notificationResponse(url)));
    const wrapper = mount(NotificationCenterDashboard, { global });
    await flushPromises();
    const button = wrapper.get(".page-head button.el-button");
    await button.trigger("click");
    await flushPromises();
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("将立即处理当前队列"), "手动派发队列", expect.objectContaining({ type: "warning" }));
    expect(apiFetch).toHaveBeenCalledWith("/api/notification-center/dispatch", { method: "POST", body: {} });
  });
});

describe("Nuxt push ledger", () => {
  const failedItem = {
    id: "ledger-1", notification_id: "notification-1", queue_job_id: "job/failed", channel_id: "channel-1", channel_type: "Telegram", channel_name: "Telegram 主渠道",
    target: "test-target", title: "假值测试推送", content: "测试内容", business_type: "inventory", business_id: "business-1", status: "DeadLetter",
    retry_count: 3, attempt_count: 4, error: "fake failure", duration_ms: 120, queued_at: "2026-01-01T00:00:00.000Z", started_at: null, sent_at: null,
    failed_at: "2026-01-01T00:01:00.000Z", last_retry_at: null, created_at: "2026-01-01T00:00:00.000Z",
  };

  it("supports API filtering, pagination data and confirmed retry", async () => {
    apiFetch.mockImplementation((url: string, options?: unknown) => {
      if (url.startsWith("/api/push-ledger?")) {
        const params = new URL(url, "https://test.invalid").searchParams;
        return Promise.resolve({ items: params.get("limit") === "20" && !params.get("status") ? [failedItem] : [], total: params.get("status") === "DeadLetter" ? 1 : (params.get("status") ? 0 : 1), limit: Number(params.get("limit")), offset: Number(params.get("offset")) });
      }
      if (url === "/queue/retry/job%2Ffailed" && options) return Promise.resolve({ success: true });
      return Promise.resolve({ success: true });
    });
    const wrapper = mount(PushLedgerDashboard, { global });
    await flushPromises();

    expect(apiFetch.mock.calls.some(([url]) => String(url).includes("limit=20") && String(url).includes("offset=0"))).toBe(true);
    expect(wrapper.text()).toContain("假值测试推送");
    expect(wrapper.text()).toContain("最终失败");
    expect(wrapper.text()).toContain("失败/死信");

    const retry = wrapper.get(".main button.el-button--danger");
    await retry.trigger("click");
    await flushPromises();
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("请确认失败原因已处理"), "重试推送任务", expect.objectContaining({ type: "warning" }));
    expect(apiFetch).toHaveBeenCalledWith("/queue/retry/job%2Ffailed", { method: "POST" });
  });
});
