import { LicenseKeyForm } from "@/components/license-key/license-key-form";
import { LicenseStoreAccountTable } from "@/components/license-key/license-store-account-table";
import { supabaseModels } from "@/lib/reminders/store";

type LicenseKeyPageProps = {
  searchParams: Promise<{ reminderId?: string | string[]; validDays?: string | string[] }>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LicenseKeyPage({ searchParams }: LicenseKeyPageProps) {
  const params = await searchParams;
  const requestedReminderId = firstValue(params.reminderId)?.trim() ?? "";
  const reminder = requestedReminderId
    ? await supabaseModels.reminder.findFirst({ where: { id: requestedReminderId, deletedAt: null } })
    : null;
  const linkedReminderId = reminder?.activationCode ? reminder.id : "";

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <div>
        <p className="text-sm text-slate-500">授权工具</p>
        <h1 className="text-xl font-semibold text-slate-950 sm:text-2xl">生成激活密匙文件</h1>
        <p className="mt-2 text-sm text-slate-500">
          输入激活码 / Client Key 和有效天数，生成 HRB 授权 .key 文件；当前暂不需要 OTP 验证码。
        </p>
      </div>
      <LicenseKeyForm
        initialClientKey={reminder?.activationCode ?? ""}
        reminderId={linkedReminderId}
        initialValidDays={firstValue(params.validDays)}
      />
      <LicenseStoreAccountTable />
    </div>
  );
}
