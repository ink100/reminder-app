import nodemailer from "nodemailer";

import { resolveMailConfigWithEnvFallback } from "@/lib/mail-settings";

export function canSendMail(settings?: Parameters<typeof resolveMailConfigWithEnvFallback>[0]) {
  return Boolean(resolveMailConfigWithEnvFallback(settings));
}

export function createMailTransport(settings?: Parameters<typeof resolveMailConfigWithEnvFallback>[0]) {
  const mailConfig = resolveMailConfigWithEnvFallback(settings);

  if (!mailConfig) {
    throw new Error("SMTP 配置未完成");
  }

  return nodemailer.createTransport({
    host: mailConfig.host,
    port: mailConfig.port,
    secure: mailConfig.port === 465,
    auth: {
      user: mailConfig.user,
      pass: mailConfig.pass,
    },
  });
}

export function getMailFrom(settings?: Parameters<typeof resolveMailConfigWithEnvFallback>[0]) {
  const mailConfig = resolveMailConfigWithEnvFallback(settings);

  if (!mailConfig) {
    throw new Error("SMTP 配置未完成");
  }

  return mailConfig.fromName ? `${mailConfig.fromName} <${mailConfig.fromEmail}>` : mailConfig.fromEmail;
}
