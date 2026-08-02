import { NextResponse } from "next/server";
import { supabaseModels } from "@/lib/reminders/store";
import { z } from "zod";

import { requireAdminApi } from "@/lib/admin-api";
import { normalizeClientKey } from "@/lib/license-key";

const generateLicenseSchema = z.object({
  clientKey: z.string().transform(normalizeClientKey).pipe(z.string().min(1, "激活码不能为空")),
  validDays: z.coerce.number().int().positive("有效天数必须大于 0"),
  reminderId: z.string().trim().min(1).optional(),
});

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function buildDueAtFromValidDays(validDays: number) {
  return new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;

  const parsed = generateLicenseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "参数错误" }, { status: 400 });
  }

  const linkedReminder = parsed.data.reminderId
    ? await supabaseModels.reminder.findFirst({
        where: { id: parsed.data.reminderId, deletedAt: null },
        select: { id: true },
      })
    : null;

  if (parsed.data.reminderId && !linkedReminder) {
    return NextResponse.json({ error: "关联提醒不存在或已删除" }, { status: 404 });
  }

  const baseUrl = process.env.HRB_LICENSE_API_BASE_URL;
  if (!baseUrl) {
    return NextResponse.json(
      { error: "授权生成服务未配置：请设置 HRB_LICENSE_API_BASE_URL，例如 http://127.0.0.1:63457" },
      { status: 503 },
    );
  }

  try {
    const upstream = await fetch(`${normalizeBaseUrl(baseUrl)}/api/license/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientKey: parsed.data.clientKey,
        validDays: parsed.data.validDays,
      }),
    });

    if (!upstream.ok) {
      const error = (await upstream.json().catch(() => null)) as { error?: string } | null;
      return NextResponse.json({ error: error?.error ?? "授权生成服务返回错误" }, { status: upstream.status });
    }

    const bytes = await upstream.arrayBuffer();
    const headers = new Headers();
    headers.set("content-type", upstream.headers.get("content-type") ?? "application/octet-stream");
    headers.set(
      "content-disposition",
      upstream.headers.get("content-disposition") ?? `attachment; filename="license_${Date.now()}.key"`,
    );

    if (linkedReminder) {
      const dueAt = buildDueAtFromValidDays(parsed.data.validDays);
      await supabaseModels.reminder.update({
        where: { id: linkedReminder.id },
        data: {
          activationCode: parsed.data.clientKey,
          dueAt,
          completedAt: null,
          upcomingNotifiedAt: null,
          overdueNotifiedAt: null,
        },
      });
      headers.set("x-linked-reminder-id", linkedReminder.id);
      headers.set("x-linked-reminder-due-at", dueAt.toISOString());
    }

    return new Response(bytes, { status: 200, headers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? `授权生成服务连接失败：${error.message}` : "授权生成服务连接失败" },
      { status: 502 },
    );
  }
}
