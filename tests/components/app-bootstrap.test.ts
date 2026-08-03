import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import App from "@/app/app.vue";
import ErrorPage from "@/app/error.vue";

describe("Nuxt app bootstrap", () => {
  it("renders the Nuxt page outlet", () => {
    const wrapper = mount(App, {
      global: { stubs: { NuxtPage: { template: "<main>page outlet</main>" } } },
    });

    expect(wrapper.text()).toContain("page outlet");
  });

  it("renders a safe recoverable error without leaking details", () => {
    const wrapper = mount(ErrorPage, {
      props: {
        error: {
          statusCode: 500,
          statusMessage: "Internal Server Error",
          stack: "secret stack trace",
        },
      },
      global: { stubs: { ElButton: { template: "<button><slot /></button>" } } },
    });

    expect(wrapper.text()).toContain("500");
    expect(wrapper.text()).not.toContain("secret stack trace");
    expect(wrapper.find("button").exists()).toBe(true);
  });
});
