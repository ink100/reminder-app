export function isActivationReminder(activationCode: string | null | undefined) {
  return Boolean(activationCode?.trim());
}

export function getReminderKindLabel(activationCode: string | null | undefined) {
  return isActivationReminder(activationCode) ? "激活码通知" : "普通提醒";
}
