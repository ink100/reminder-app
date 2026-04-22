export function buildTestMail({
  appName,
  to,
  from,
}: {
  appName: string;
  to: string;
  from: string;
}) {
  return {
    to,
    from,
    subject: `${appName}｜测试邮件`,
    text: [
      `${appName} - 测试邮件`,
      "",
      "这是一封测试邮件，用于确认当前 SMTP 配置和收件地址可以正常工作。",
      "如果你收到了这封邮件，说明邮箱提醒链路已经打通。",
    ].join("\n"),
  };
}
