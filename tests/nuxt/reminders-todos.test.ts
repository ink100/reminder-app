import { mount } from "@vue/test-utils";
import { computed, defineComponent, h, nextTick, reactive, ref, watch } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TodoList from "@/app/components/todos/TodoList.vue";
import ReminderDashboard from "@/app/components/reminders/ReminderDashboard.vue";
import { isoToLegacyDateTimeValue, legacyDateTimeValueToIso, reminderGroup, riskLevel } from "@/app/components/reminders/reminder";

const apiFetch = vi.fn();
const ElInput = defineComponent({
  props: { modelValue: String }, emits: ["update:modelValue"],
  setup(props, { emit, attrs }) { return () => h("input", { ...attrs, value: props.modelValue, onInput: (event: Event) => emit("update:modelValue", (event.target as HTMLInputElement).value), onKeyup: attrs.onKeyup }); },
});
const ElButton = defineComponent({
  props: { disabled: Boolean },
  setup(props, { slots, attrs }) { return () => h("button", { ...attrs, disabled: props.disabled }, slots.default?.()); },
});
const ElCheckbox = defineComponent({
  props: { modelValue: Boolean }, emits: ["change"],
  setup(props, { emit, attrs }) { return () => h("input", { ...attrs, type: "checkbox", checked: props.modelValue, onChange: () => emit("change", !props.modelValue) }); },
});

beforeEach(() => {
  apiFetch.mockReset();
  vi.stubGlobal("ref", ref); vi.stubGlobal("reactive", reactive); vi.stubGlobal("computed", computed); vi.stubGlobal("watch", watch);
  vi.stubGlobal("useApi", () => ({ apiFetch }));
  vi.stubGlobal("useRoute", () => ({ path: "/reminders", fullPath: "/reminders?search=证书", query: {} }));
  vi.stubGlobal("useRouter", () => ({ replace: vi.fn() }));
  vi.stubGlobal("ElMessage", { success: vi.fn(), error: vi.fn(), warning: vi.fn() });
  vi.stubGlobal("ElMessageBox", { confirm: vi.fn().mockResolvedValue(undefined) });
});
afterEach(() => vi.unstubAllGlobals());

const global = { stubs: { ElInput, ElButton, ElCheckbox, ElEmpty: { template: "<div>empty</div>" } } };

describe("Vue todo interactions", () => {
  it("creates, completes, edits and deletes todos through the legacy API contract", async () => {
    apiFetch
      .mockResolvedValueOnce({ item: { id: "2", title: "新增项", completedAt: null, createdAt: "2026-01-01T00:00:00.000Z" } })
      .mockResolvedValueOnce({ item: { id: "2", title: "新增项", completedAt: "2026-01-02T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" } })
      .mockResolvedValueOnce({ item: { id: "2", title: "修改项", completedAt: "2026-01-02T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" } })
      .mockResolvedValueOnce({ ok: true });
    const wrapper = mount(TodoList, { props: { initialTodos: [] }, global });
    const input = wrapper.get("input[aria-label='新待办标题']");
    await input.setValue("  新增项  ");
    await wrapper.get("button").trigger("click"); await nextTick();
    expect(apiFetch).toHaveBeenNthCalledWith(1, "/api/todos", { method: "POST", body: { title: "新增项" } });
    expect(wrapper.text()).toContain("新增项");

    await wrapper.get("input[type='checkbox']").trigger("change"); await nextTick();
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/api/todos/2", { method: "PATCH", body: { completed: true } });
    await wrapper.get("button.todo-title").trigger("click");
    const edit = wrapper.get("input[aria-label='编辑待办标题']");
    await edit.setValue("修改项"); await edit.trigger("keyup", { key: "Enter" }); await nextTick();
    expect(apiFetch).toHaveBeenNthCalledWith(3, "/api/todos/2", { method: "PATCH", body: { title: "修改项" } });
    const deleteButton = wrapper.findAll("button").find(button => button.attributes("aria-label") === "删除")!;
    await deleteButton.trigger("click"); await nextTick();
    expect(apiFetch).toHaveBeenNthCalledWith(4, "/api/todos/2", { method: "DELETE" });
  });
});

describe("Vue reminder rules", () => {
  it("completes an active reminder and asks the page to refresh", async () => {
    apiFetch.mockResolvedValueOnce({ item: { id: "r1" }, recurrenceAdvanced: false });
    const wrapper = mount(ReminderDashboard, {
      props: { items: [{ id: "r1", title: "证书续期", description: null, activationContact: null, dueAt: "2099-01-01T00:00:00.000Z", priority: "high", category: "SSL证书", completedAt: null, remindBeforeDays: 3 }] },
      global: { stubs: {
        ElButton, ElInput, ElEmpty: { template: "<div><slot /></div>" }, ElTag: { template: "<span><slot /></span>" },
        ElSegmented: { template: "<div />" }, ElSelect: { template: "<select><slot /></select>" }, ElOption: { template: "<option />" },
        NuxtLink: { props: ["to"], template: "<a><slot /></a>" },
      } },
    });
    await wrapper.get("button[aria-label='完成']").trigger("click"); await nextTick();
    expect(apiFetch).toHaveBeenCalledWith("/api/reminders/r1/complete", { method: "POST", body: {} });
    expect(wrapper.emitted("refresh")).toHaveLength(1);
  });

  it("keeps grouping, risk, recurrence date serialization and timezone semantics compatible", () => {
    expect(reminderGroup("SSL证书")).toBe("服务器与证书");
    expect(riskLevel({ id: "1", title: "x", description: null, activationContact: null, dueAt: "2026-01-01T11:00:00.000Z", priority: "high", category: null, completedAt: null, remindBeforeDays: 3 }, new Date("2026-01-01T12:00:00.000Z"))).toBe("overdue");
    expect(isoToLegacyDateTimeValue("2026-03-04T05:06:00.000Z")).toBe("2026-03-04T05:06");
    expect(legacyDateTimeValueToIso("2026-03-04T05:06")).toBe(new Date("2026-03-04T05:06").toISOString());
  });
});
