import { flushPromises, mount } from "@vue/test-utils";
import ElementPlus, { ElMessageBox } from "element-plus";
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StoreAccountManager from "@/app/components/license-key/StoreAccountManager.vue";
import AppSettingsForm from "@/app/components/settings/AppSettingsForm.vue";
import R2SettingsCard from "@/app/components/settings/R2SettingsCard.vue";
import BotSettings from "@/app/components/settings/BotSettings.vue";
import SslStatus from "@/app/components/operations/SslStatus.vue";

const apiFetch = vi.fn();
const global = { plugins: [ElementPlus], stubs: { NuxtLink: { template: "<a><slot /></a>" }, PaymentQrManager: { template: "<div>qr-manager</div>" } } };

beforeEach(() => {
  apiFetch.mockReset();
  Object.assign(globalThis, { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick });
  vi.stubGlobal("useApi", () => ({ apiFetch }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function button(wrapper: ReturnType<typeof mount>, text: string) { return wrapper.findAll("button").find(item => item.text().includes(text))!; }

describe("Nuxt license, payment and settings migration", () => {
  it("uses atomic store-account endpoints for create and delete", async () => {
    apiFetch.mockResolvedValueOnce({ items: [{ id:"a1",shopName:"演示店",phone:"100",remoteCode:"remote",remotePassword:"password",isOtherAccount:false,expiresAt:"2030-01-01T00:00:00.000Z",activationCode:"activation",reminderId:"r1",reminder:{id:"r1",title:"提醒"} }] });
    const wrapper = mount(StoreAccountManager, { global }); await flushPromises();
    expect(apiFetch).toHaveBeenCalledWith("/api/license/store-accounts");
    const inputs = wrapper.findAll("input"); await inputs[1]!.setValue("新店"); await inputs[2]!.setValue("123"); await inputs[3]!.setValue("remote-code"); await inputs[4]!.setValue("remote-password");
    await wrapper.find("textarea").setValue("activation-code"); apiFetch.mockResolvedValueOnce({ item:{} }).mockResolvedValueOnce({items:[]}); await wrapper.findAll("form")[1]!.trigger("submit"); await flushPromises();
    expect(apiFetch).toHaveBeenCalledWith("/api/license/store-accounts", expect.objectContaining({ method:"POST" }));
    vi.spyOn(ElMessageBox,"confirm").mockResolvedValue(undefined as never); apiFetch.mockResolvedValueOnce({items:[{ id:"a1",shopName:"演示店",phone:"100",remoteCode:"remote",remotePassword:"password",isOtherAccount:false,expiresAt:"2030-01-01",activationCode:"activation",reminderId:null,reminder:null }]}); await (wrapper.vm as any).load(); await flushPromises(); apiFetch.mockResolvedValueOnce({success:true}).mockResolvedValueOnce({items:[]}); await button(wrapper,"删除").trigger("click"); await flushPromises();
    expect(apiFetch).toHaveBeenCalledWith("/api/license/store-accounts/a1", {method:"DELETE"});
  });

  it("never renders R2 credentials and preserves them when blank", async () => {
    const hiddenCredential = "fixture-value-not-a-production-key";
    apiFetch.mockResolvedValueOnce({ endpoint:"https://storage.invalid",accessKey:hiddenCredential,secretKey:hiddenCredential,bucket:"bucket",publicUrl:"https://cdn.invalid",cacheControl:"public" });
    const wrapper=mount(R2SettingsCard,{global});await flushPromises();
    expect(wrapper.text()).not.toContain(hiddenCredential); expect(wrapper.findAll("input").every(input=>input.element.value!==hiddenCredential)).toBe(true);
    apiFetch.mockResolvedValueOnce({success:true});await button(wrapper,"保存 R2 配置").trigger("click");await flushPromises();
    expect(apiFetch).toHaveBeenLastCalledWith("/api/settings/r2",expect.objectContaining({method:"PUT",body:expect.objectContaining({accessKey:hiddenCredential,secretKey:hiddenCredential})}));
  });

  it("keeps SMTP password blank and supports mail test", async()=>{
    apiFetch.mockResolvedValueOnce({item:{appName:"App",timezone:"Asia/Shanghai",emailNotificationsEnabled:true,notificationEmail:"mail@example.test",smtpHost:"smtp.example.test",smtpPort:587,smtpUser:"mailer",smtpFromEmail:"mail@example.test",smtpFromName:"App",smtpPasswordConfigured:true,reminderEmailEnabled:true,reminderEmailInterval:1800,notifyStartHour:9,notifyEndHour:22},taskLogs:[]});
    const wrapper=mount(AppSettingsForm,{global});await flushPromises();expect(wrapper.text()).toContain("留空保持不变");expect((wrapper.find('input[type="password"]').element as HTMLInputElement).value).toBe("");
    apiFetch.mockResolvedValueOnce({sentTo:"mail@example.test"});await button(wrapper,"发送测试邮件").trigger("click");await flushPromises();expect(apiFetch).toHaveBeenLastCalledWith("/api/settings/test-email",{method:"POST",body:{email:"mail@example.test"}});
    apiFetch.mockResolvedValueOnce({item:{smtpPasswordConfigured:true}});await button(wrapper,"保存配置").trigger("click");await flushPromises();expect(apiFetch).toHaveBeenLastCalledWith("/api/settings",expect.objectContaining({method:"PUT",body:expect.objectContaining({smtpPass:"",clearSmtpPass:false})}));
  });

  it("loads Bot status without exposing token and manages bindings",async()=>{
    apiFetch.mockResolvedValueOnce({item:{enabled:true,chatId:"42",tokenConfigured:true,botName:"Bot",botUsername:"demo_bot",lastTestAt:null,lastTestStatus:null}}).mockResolvedValueOnce({items:[]});
    const wrapper=mount(BotSettings,{global});await flushPromises();expect(apiFetch).toHaveBeenCalledWith("/api/settings/bot/bindings");expect((wrapper.find('input[type="password"]').element as HTMLInputElement).value).toBe("");
    apiFetch.mockResolvedValueOnce({code:"123456",expiresAt:"2030-01-01T00:00:00Z",instructions:"bind"});await button(wrapper,"生成绑定码").trigger("click");await flushPromises();expect(apiFetch).toHaveBeenLastCalledWith("/api/settings/bot/bindings",{method:"POST",body:{action:"create-code"}});
    apiFetch.mockResolvedValueOnce({item:{tokenConfigured:true}});await button(wrapper,"保存 Bot 配置").trigger("click");await flushPromises();expect(apiFetch).toHaveBeenLastCalledWith("/api/settings/bot",expect.objectContaining({method:"PUT",body:expect.objectContaining({token:"",clearToken:false})}));
  });

  it("loads and refreshes SSL certificate status",async()=>{
    const status={status:{lastRenew:null,lastResult:0,expiry:"2030-01-01",updated:null,daysRemaining:300,isExpired:false,subject:"example.test",issuer:"Test CA",serialNumber:"01"},acmeList:"entry",logs:"ok",certPath:"/cert",renewScript:"/renew"};apiFetch.mockResolvedValue(status);
    const wrapper=mount(SslStatus,{global});await flushPromises();expect(apiFetch).toHaveBeenCalledWith("/api/ssl");expect(wrapper.text()).toContain("正常");await button(wrapper,"刷新").trigger("click");await flushPromises();expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});
