import { Suspense } from "react";

import { LicenseKeyForm } from "@/components/license-key/license-key-form";

export default function LicenseKeyPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">授权工具</p>
        <h1 className="text-2xl font-semibold text-slate-950">生成激活密匙文件</h1>
        <p className="mt-2 text-sm text-slate-500">
          输入激活码 / Client Key 和有效天数，生成 HRB 授权 .key 文件；当前暂不需要 OTP 验证码。
        </p>
      </div>
      <Suspense fallback={<div className="rounded-xl border border-slate-200 p-6 text-sm text-slate-500">加载中...</div>}>
        <LicenseKeyForm />
      </Suspense>
    </div>
  );
}
