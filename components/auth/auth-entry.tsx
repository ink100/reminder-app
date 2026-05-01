import { OtpLoginForm } from "@/components/auth/otp-login-form";
import { OtpSetupCard } from "@/components/auth/otp-setup-card";

type AuthEntryProps = {
  otpConfigured: boolean;
  redirectTo?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
};

export function AuthEntry({
  otpConfigured,
  redirectTo = "/inventory",
  eyebrow = "库存通知登录",
  title = "进入库存通知页前先做 OTP 验证",
  description = "如果后台还没有配置 OTP 密钥，首次进入将显示二维码完成绑定；配置完成后，每次访问都要输入一次动态验证码，避免其他人直接进入库存通知页面。",
}: AuthEntryProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4 py-10 md:px-6">
      <div className="grid w-full gap-8 md:grid-cols-[1.1fr_0.9fr]">
        <section className="flex flex-col justify-center rounded-3xl bg-slate-950 p-8 text-white shadow-xl">
          <p className="text-sm uppercase tracking-[0.25em] text-slate-300">{eyebrow}</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight">{title}</h1>
          <p className="mt-4 max-w-lg text-sm leading-7 text-slate-300">{description}</p>
        </section>
        <section>{otpConfigured ? <OtpLoginForm redirectTo={redirectTo} /> : <OtpSetupCard redirectTo={redirectTo} />}</section>
      </div>
    </main>
  );
}