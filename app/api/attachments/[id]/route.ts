import { NextRequest, NextResponse } from "next/server";
import { isPaymentQrAttachmentType } from "@/lib/payment-qr";
import { supabaseModels } from "@/lib/reminders/store";
import { requireApiSession } from "@/lib/auth";
import { deleteFromR2 } from "@/lib/r2-storage";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const attachment = await supabaseModels.attachment.findUnique({ where: { id } });

    if (!attachment || attachment.deletedAt) {
      return NextResponse.json({ error: "附件不存在" }, { status: 404 });
    }
    if (attachment.licenseStoreAccountId && isPaymentQrAttachmentType(attachment.attachmentType)) {
      return NextResponse.json({ error: "店铺收款二维码请在对应店铺记录中删除" }, { status: 409 });
    }

    await deleteFromR2(attachment.r2Key);

    await supabaseModels.attachment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除附件失败:", error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
