import { mount } from "@vue/test-utils";
import { computed, defineComponent, h, ref, toValue, watch } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MobileNav from "@/app/components/layout/MobileNav.vue";
import { getApiErrorMessage, safeReturnUrl, useApi } from "@/app/composables/useApi";
import { getNavigationItems } from "@/app/composables/useNavigation";

const navigateTo = vi.fn();
const route = { path: "/reminders", fullPath: "/reminders?view=open" };

beforeEach(() => {
  navigateTo.mockReset();
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("toValue", toValue);
  vi.stubGlobal("useRoute", () => route);
  vi.stubGlobal("navigateTo", navigateTo);
});

afterEach(() => vi.unstubAllGlobals());

describe("Nuxt shell navigation", () => {
  it("preserves the legacy URLs and fails unknown roles closed", () => {
    expect(getNavigationItems("MEMBER").map(({ href }) => href)).toEqual([
      "/reminders", "/todos", "/medicines", "/images", "/voice", "/account",
    ]);
    expect(getNavigationItems("ADMIN").map(({ href }) => href)).toEqual([
      "/reminders", "/todos", "/medicines", "/images", "/voice", "/account",
      "/members", "/notification-center", "/push-ledger", "/license-key", "/ssl", "/bot", "/settings",
    ]);
    expect(getNavigationItems("UNKNOWN")).toEqual([]);
  });

  it("shows the AI voice assistant in the mobile more navigation", () => {
    expect(getNavigationItems("MEMBER").find(({ href }) => href === "/voice")).toMatchObject({
      label: "语音调用 AI",
      shortLabel: "语音 AI",
    });
  });

  it("opens the mobile Element Plus drawer", async () => {
    vi.stubGlobal("useNavigation", () => ({
      items: computed(() => getNavigationItems("MEMBER")),
      isActive: (href: string) => route.path === href,
    }));

    const Drawer = defineComponent({
      name: "ElDrawer",
      props: { modelValue: Boolean },
      setup(props, { slots }) {
        return () => h("section", { "data-open": String(props.modelValue) }, slots.default?.());
      },
    });
    const wrapper = mount(MobileNav, {
      props: { role: "MEMBER" },
      global: {
        stubs: {
          ElDrawer: Drawer,
          ElMenu: { template: "<div><slot /></div>" },
          ElMenuItem: { template: "<div><slot /></div>" },
          NuxtLink: { props: ["to"], template: "<a :href='to'><slot /></a>" },
        },
      },
    });

    expect(wrapper.get("section").attributes("data-open")).toBe("false");
    await wrapper.get("button[aria-label='打开更多导航']").trigger("click");
    expect(wrapper.get("section").attributes("data-open")).toBe("true");
    expect(wrapper.get("button").attributes("aria-expanded")).toBe("true");
  });
});

describe("Nuxt API foundation", () => {
  it("redirects a 401 to auth with a relative return URL", async () => {
    vi.stubGlobal("$fetch", vi.fn().mockRejectedValue({ statusCode: 401, data: { error: "Unauthorized" } }));

    await expect(useApi().apiFetch("/api/reminders")).rejects.toMatchObject({
      statusCode: 401,
      message: "Unauthorized",
    });
    expect(navigateTo).toHaveBeenCalledWith({
      path: "/auth",
      query: { returnUrl: "/reminders?view=open" },
    });
  });

  it("parses legacy API errors and rejects open redirects", () => {
    expect(getApiErrorMessage({ error: "保存失败" })).toBe("保存失败");
    expect(getApiErrorMessage({ data: { message: "字段无效" } })).toBe("字段无效");
    expect(getApiErrorMessage({ errors: [{ message: "名称必填" }] })).toBe("名称必填");
    expect(safeReturnUrl("https://evil.example/steal")).toBe("/reminders");
    expect(safeReturnUrl("//evil.example/steal")).toBe("/reminders");
    expect(safeReturnUrl("/todos?state=open")).toBe("/todos?state=open");
  });
});
