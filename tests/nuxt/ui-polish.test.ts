import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { getNavigationItems } from "@/app/composables/useNavigation";

describe("application UI polish contract", () => {
  it("gives every navigation destination a stable visual icon", async () => {
    const items = getNavigationItems("ADMIN");
    const [sideNav, mobileNav] = await Promise.all([
      readFile("app/components/layout/SideNav.vue", "utf8"),
      readFile("app/components/layout/MobileNav.vue", "utf8"),
    ]);
    expect(items).toHaveLength(12);
    expect(items.every((item) => typeof item.icon === "string" && item.icon.length > 0)).toBe(true);
    expect(new Set(items.map((item) => item.icon)).size).toBe(items.length);
    expect(sideNav).not.toContain("import * as ElementIcons");
    expect(mobileNav).not.toContain("import * as ElementIcons");
  });

  it("keeps the mobile auth experience inside narrow viewports", async () => {
    const [entry, form, globalCss] = await Promise.all([
      readFile("app/components/auth/AuthEntry.vue", "utf8"),
      readFile("app/components/auth/OtpLoginForm.vue", "utf8"),
      readFile("app/assets/css/main.css", "utf8"),
    ]);

    expect(globalCss).toContain("overflow-x: clip");
    expect(entry).toContain("min-width: 0");
    expect(entry).toContain("width: 100%");
    expect(entry).toContain("min-height: 48px");
    expect(entry).toContain(".el-segmented__item.is-selected");
    expect(entry).toContain("color: white");
    expect(entry).toContain("text-wrap: balance");
    expect(form).toContain("min-height: 48px");
    expect(form).toContain("验证并登录");
  });

  it("marks More active when a secondary mobile destination is open", async () => {
    const mobileNav = await readFile("app/components/layout/MobileNav.vue", "utf8");
    expect(mobileNav).toContain("moreActive");
    expect(mobileNav).toContain(":class=\"{ active: moreActive }\"");
    expect(mobileNav).toContain(":aria-current=\"moreActive ? 'page' : undefined\"");
  });

  it("allows long desktop navigation to scroll without clipping logout", async () => {
    const sideNav = await readFile("app/components/layout/SideNav.vue", "utf8");
    expect(sideNav).toContain("overflow-y: auto");
    expect(sideNav).toContain("position: sticky");
  });
});
