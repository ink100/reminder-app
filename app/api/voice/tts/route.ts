import type { NextRequest } from "next/server";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { z } from "zod";

import { requireApiSession } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TEXT_LENGTH = 8000;

const requestSchema = z.object({
  input: z.string().trim().min(1, "请输入要转换的文本内容").max(MAX_TEXT_LENGTH, `文本不能超过 ${MAX_TEXT_LENGTH} 个字符`),
  voice: z.string().trim().min(1).default("zh-CN-XiaoxiaoNeural"),
  speed: z.coerce.number().min(0.5).max(2).default(1),
  pitch: z.coerce.number().min(-50).max(50).default(0),
  volume: z.coerce.number().min(-100).max(100).default(0),
});

function toSignedPercent(value: number) {
  const rounded = Math.round(value);
  return rounded >= 0 ? `+${rounded}%` : `${rounded}%`;
}

function speedToRate(speed: number) {
  const percent = Math.round((speed - 1) * 100);
  return toSignedPercent(percent);
}

function pitchToHz(pitch: number) {
  const rounded = Math.round(pitch);
  return rounded >= 0 ? `+${rounded}Hz` : `${rounded}Hz`;
}

async function runEdgeTts(input: z.infer<typeof requestSchema>) {
  const tempDir = await mkdtemp(join(tmpdir(), "voice-tts-"));
  const inputPath = join(tempDir, "input.txt");
  const outputPath = join(tempDir, "speech.mp3");

  try {
    await writeFile(inputPath, input.input, "utf8");

    const args = [
      "-m",
      "edge_tts",
      "--file",
      inputPath,
      "--voice",
      input.voice,
      "--rate",
      speedToRate(input.speed),
      "--pitch",
      pitchToHz(input.pitch),
      "--volume",
      toSignedPercent(input.volume),
      "--write-media",
      outputPath,
    ];

    const { stderr } = await new Promise<{ stderr: string }>((resolve, reject) => {
      const child = spawn("python3", args, { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve({ stderr });
        } else {
          reject(new Error(stderr.trim() || `edge-tts 退出码 ${code}`));
        }
      });
    });

    if (stderr.toLowerCase().includes("error")) {
      console.warn("edge-tts stderr:", stderr);
    }

    return await readFile(outputPath);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let payload: unknown;
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      const fileText = file ? await file.text() : "";

      payload = {
        input: formData.get("input") || fileText,
        voice: formData.get("voice") || undefined,
        speed: formData.get("speed") || undefined,
        pitch: formData.get("pitch") || undefined,
        volume: formData.get("volume") || undefined,
      };
    } else {
      payload = await request.json();
    }

    const input = requestSchema.parse(payload);
    const audioBuffer = await runEdgeTts(input);

    return new Response(new Uint8Array(audioBuffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename="speech-${Date.now()}.mp3"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "语音生成失败";
    console.error("TTS 生成失败:", error);
    return Response.json({ error: message }, { status: 400 });
  }
}
