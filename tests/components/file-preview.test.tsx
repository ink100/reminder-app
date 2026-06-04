import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FileGallery } from "@/components/images/image-gallery";
import { FileUpload } from "@/components/ui/file-upload";

const imageAttachment = {
  id: "att_image",
  filename: "receipt.png",
  originalName: "收据.png",
  mimetype: "image/png",
  size: 2048,
  url: "https://img.example.com/receipt.png",
  createdAt: "2026-06-04T10:00:00.000Z",
};

const pdfAttachment = {
  id: "att_pdf",
  filename: "contract.pdf",
  originalName: "合同.pdf",
  mimetype: "application/pdf",
  size: 4096,
  url: "https://img.example.com/contract.pdf",
  createdAt: "2026-06-04T10:00:00.000Z",
};

describe("attachment image preview", () => {
  it("shows thumbnail and opens preview dialog for image reminder attachments", async () => {
    const user = userEvent.setup();

    render(<FileUpload attachments={[imageAttachment, pdfAttachment]} />);

    expect(screen.getByAltText("收据.png")).toHaveAttribute("src", imageAttachment.url);
    expect(screen.queryByAltText("合同.pdf")).not.toBeInTheDocument();

    expect(screen.getAllByRole("button", { name: "复制" })).toHaveLength(2);
    expect(screen.getAllByText("下载")).toHaveLength(2);
    expect(screen.getAllByText("删除")).toHaveLength(2);

    await user.click(screen.getByTitle("点击图片放大"));

    const dialog = screen.getByRole("dialog", { name: "图片附件预览" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getAllByAltText("收据.png")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog", { name: "图片附件预览" })).not.toBeInTheDocument();
  });

  it("opens preview dialog from file gallery image cards", async () => {
    const user = userEvent.setup();

    render(<FileGallery files={[imageAttachment]} onDelete={vi.fn()} />);

    expect(screen.getByRole("button", { name: "复制" })).toBeInTheDocument();
    expect(screen.getByText("下载")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument();

    await user.click(screen.getByTitle("预览图片"));

    const dialog = screen.getByRole("dialog", { name: "图片预览" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getAllByAltText("收据.png")).toHaveLength(2);

    await user.click(dialog);
    expect(screen.queryByRole("dialog", { name: "图片预览" })).not.toBeInTheDocument();
  });
});
