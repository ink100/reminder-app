
import { requireApiSession } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_AUDIO_SIZE = 10 * 1024 * 1024;
const SUPPORTED_AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/m4a",
  "audio/flac",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
  "audio/amr",
  "audio/3gpp",
]);

function isSupportedAudio(file: File) {
  if (SUPPORTED_AUDIO_TYPES.has(file.type)) {
    return true;
  }

  return /\.(mp3|wav|m4a|flac|aac|ogg|webm|amr|3gp)$/i.test(file.name);
}

export async function POST(request: Request) {
  const session = await requireApiSession(request);

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const customToken = String(formData.get("token") || "").trim();
    const token = customToken || process.env.SILICONFLOW_API_KEY || process.env.SILICONFLOW_TOKEN || "";

    if (!file) {
      return Response.json({ error: "请选择要转录的音频文件" }, { status: 400 });
    }

    if (file.size > MAX_AUDIO_SIZE) {
      return Response.json({ error: "音频文件不能超过 10MB" }, { status: 400 });
    }

    if (!isSupportedAudio(file)) {
      return Response.json({ error: "仅支持 mp3、wav、m4a、flac、aac、ogg、webm、amr、3gp 音频格式" }, { status: 400 });
    }

    if (!token) {
      return Response.json({ error: "未配置硅基流动 API Token，请输入自定义 Token 或在环境变量中配置 SILICONFLOW_API_KEY" }, { status: 400 });
    }

    const upstreamForm = new FormData();
    upstreamForm.append("file", file, file.name || "audio.mp3");
    upstreamForm.append("model", "FunAudioLLM/SenseVoiceSmall");

    const response = await fetch("https://api.siliconflow.cn/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: upstreamForm,
    });

    const text = await response.text();

    if (!response.ok) {
      let message = text || "语音转文字失败";
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
        message = typeof parsed.error === "string" ? parsed.error : parsed.error?.message || parsed.message || message;
      } catch {
        // keep raw message
      }

      return Response.json({ error: message }, { status: response.status });
    }

    try {
      const result = JSON.parse(text) as { text?: string };
      return Response.json({ text: result.text || "", raw: result });
    } catch {
      return Response.json({ text });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "语音转文字失败";
    console.error("语音转文字失败:", error);
    return Response.json({ error: message }, { status: 400 });
  }
}
