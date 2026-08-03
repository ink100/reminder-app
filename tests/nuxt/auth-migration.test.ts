import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import InvitationEnrollment from "@/app/components/auth/InvitationEnrollment.vue";
import OtpLoginForm from "@/app/components/auth/OtpLoginForm.vue";
import PasskeyLogin from "@/app/components/auth/PasskeyLogin.vue";

const webauthn = vi.hoisted(() => ({
  browserSupportsWebAuthn: vi.fn(() => true),
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}));
vi.mock("@simplewebauthn/browser", () => webauthn);

const navigateTo = vi.fn();
const fetchMock = vi.fn();
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

const stubs = {
  ElCard: { template: "<section><slot /></section>" },
  ElForm: { emits: ["submit"], template: "<form @submit='$emit(\"submit\", $event)'><slot /></form>" },
  ElFormItem: { template: "<label><slot /></label>" },
  ElInput: {
    props: ["modelValue", "name", "placeholder"],
    emits: ["update:modelValue"],
    template: "<input :name='name' :placeholder='placeholder' :value='modelValue' @input='$emit(\"update:modelValue\", $event.target.value)' />",
  },
  ElCheckbox: {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: "<label><input type='checkbox' :checked='modelValue' @change='$emit(\"update:modelValue\", $event.target.checked)' /><slot /></label>",
  },
  ElButton: {
    props: ["disabled", "loading", "type", "nativeType"],
    emits: ["click"],
    template: "<button :type='nativeType || \"button\"' :disabled='disabled || loading' @click='$emit(\"click\")'><slot /></button>",
  },
  ElAlert: { props: ["title"], template: "<div role='alert'>{{ title }}</div>" },
  ElSteps: { template: "<div><slot /></div>" },
  ElStep: { template: "<span />" },
  ElSegmented: {
    props: ["modelValue", "options", "disabled"],
    emits: ["update:modelValue"],
    template: "<div><button v-for='option in options' :key='option.value' :disabled='disabled' @click='$emit(\"update:modelValue\", option.value)'>{{ option.label }}</button></div>",
  },
};

function mountWithElement(component: Parameters<typeof mount>[0], props: Record<string, unknown> = {}) {
  return mount(component, { props, global: { stubs } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("navigateTo", navigateTo);
});
afterEach(() => vi.unstubAllGlobals());

describe("Vue authentication migration", () => {
  it("normalizes OTP input, preserves rememberDevice and displays the API's 429 message", async () => {
    fetchMock.mockResolvedValue(response({ error: "用户名或验证码错误" }, 429));
    const wrapper = mountWithElement(OtpLoginForm, { redirectTo: "/todos?state=open" });
    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("alice");
    await inputs[1].setValue("12a34567");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/otp/login", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ username: "alice", code: "123456", rememberDevice: true }),
    }));
    expect(wrapper.get("[role=alert]").text()).toBe("用户名或验证码错误");
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("runs passkey authentication in the client and verifies its response", async () => {
    webauthn.startAuthentication.mockResolvedValue({ id: "credential", response: {} });
    fetchMock
      .mockResolvedValueOnce(response({ challenge: "challenge", rpId: "example.test" }))
      .mockResolvedValueOnce(response({ verified: true, userId: "u1" }));
    const wrapper = mountWithElement(PasskeyLogin, { redirectTo: "/reminders" });
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text().includes("手机扫码登录"))!.trigger("click");
    await flushPromises();

    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/passkey/login?mode=hybrid");
    expect(webauthn.startAuthentication).toHaveBeenCalledWith({ optionsJSON: expect.objectContaining({ challenge: "challenge" }) });
    const verify = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(verify).toMatchObject({ id: "credential", rememberDevice: true });
    expect(navigateTo).toHaveBeenCalledWith("/reminders", { replace: true });
  });

  it("uses invitation TOTP setup and verify contracts without putting secrets in a URL", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ secret: "TOP-SECRET", qrCodeDataUrl: "data:image/png;base64,AA", enrollmentId: "enroll-1" }))
      .mockResolvedValueOnce(response({ error: "请求过于频繁" }, 429));
    const wrapper = mountWithElement(InvitationEnrollment, { token: "token / value" });
    await wrapper.findAll("button").find((button) => button.text().includes("生成独立验证密钥"))!.trigger("click");
    await flushPromises();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/invite/token%20%2F%20value/totp/setup");
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("TOP-SECRET");

    await wrapper.get("input[placeholder='123456']").setValue("654321");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({ code: "654321", enrollmentId: "enroll-1" });
    expect(wrapper.get("[role=alert]").text()).toBe("请求过于频繁");
  });

  it("requests invitation passkey options, invokes WebAuthn, then verifies", async () => {
    webauthn.startRegistration.mockResolvedValue({ id: "new-passkey", response: {} });
    fetchMock
      .mockResolvedValueOnce(response({ challenge: "registration-challenge", user: { id: "u1" } }))
      .mockResolvedValueOnce(response({ error: "Unable to complete invitation" }, 400));
    const wrapper = mountWithElement(InvitationEnrollment, { token: "invite-token" });
    await wrapper.findAll("button").find((button) => button.text() === "通行密匙")!.trigger("click");
    await wrapper.findAll("button").find((button) => button.text().includes("创建通行密匙并激活"))!.trigger("click");
    await flushPromises();

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/invite/invite-token/passkey/options",
      "/api/invite/invite-token/passkey/verify",
    ]);
    expect(webauthn.startRegistration).toHaveBeenCalled();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({ id: "new-passkey" });
    expect(wrapper.get("[role=alert]").text()).toBe("无法接受邀请，请重新打开邀请链接后再试");
  });
});
