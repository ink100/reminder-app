import { PasskeyManager } from "@/components/settings/passkey-manager";
import { TrustedDevicesCard } from "@/components/settings/trusted-devices-card";

export default function AccountPage() {
  return (
    <div className="min-w-0 space-y-6">
      <div>
        <p className="text-sm text-slate-500">个人账户</p>
        <h1 className="text-2xl font-semibold text-slate-950">账户安全</h1>
      </div>
      <PasskeyManager />
      <TrustedDevicesCard />
    </div>
  );
}
