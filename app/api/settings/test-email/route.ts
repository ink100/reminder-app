import type { NextRequest } from "next/server";
import { z } from "zod";

import { requireApiSession } from "@/lib/auth";
import { createMailTransport, getMailFrom } from "@/lib/mailer";
import { appSettingStore } from "@/lib/app-settings/store";
import { buildTestMail } from "@/lib/test-mail";

const inputSchema = z.object({
  email: z.email().optional().nullable(),
});

export async function POST(request: NextRequest) {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const input = inputSchema.parse(await request.json());
    const settings = await appSettingStore.findUnique({ where: { id: 1 } });

    if (!settings) {
      return Response.json({ error: "配置不存在" }, { status: 404 });
    }

    const targetEmail = input.email ?? settings.notificationEmail;

    if (!targetEmail) {
      return Response.json({ error: "请先填写测试邮箱或提醒接收邮箱" }, { status: 400 });
    }

    const transport = createMailTransport(settings);
    const mail = buildTestMail({
      appName: settings.appName,
      to: targetEmail,
      from: getMailFrom(settings),
    });

    await transport.sendMail(mail);

    return Response.json({ success: true, sentTo: targetEmail });
  } catch (error) {
    const message = error instanceof Error ? error.message : "测试邮件发送失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
