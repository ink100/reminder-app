"use client";

import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";

const VOICES = [
  { group: "中文女声", items: [
    ["zh-CN-XiaoxiaoNeural", "晓晓 · 温柔自然"],
    ["zh-CN-XiaoyiNeural", "晓伊 · 甜美活泼"],
    ["zh-CN-XiaochenNeural", "晓辰 · 知性清晰"],
    ["zh-CN-XiaohanNeural", "晓涵 · 优雅柔和"],
    ["zh-CN-XiaomoNeural", "晓墨 · 文艺沉稳"],
    ["zh-CN-XiaoruiNeural", "晓睿 · 成熟可靠"],
    ["zh-CN-XiaoshuangNeural", "晓双 · 儿童活力"],
    ["zh-CN-XiaoxuanNeural", "晓萱 · 新闻自然"],
    ["zh-CN-XiaoyanNeural", "晓颜 · 柔美标准"],
    ["zh-CN-XiaoyouNeural", "晓悠 · 儿童亲切"],
  ]},
  { group: "中文男声", items: [
    ["zh-CN-YunxiNeural", "云希 · 清朗青年"],
    ["zh-CN-YunyangNeural", "云扬 · 专业播报"],
    ["zh-CN-YunjianNeural", "云健 · 稳重成熟"],
    ["zh-CN-YunfengNeural", "云枫 · 磁性自然"],
    ["zh-CN-YunhaoNeural", "云皓 · 豪迈有力"],
    ["zh-CN-YunyeNeural", "云野 · 低沉叙事"],
  ]},
  { group: "英文", items: [
    ["en-US-JennyNeural", "Jenny · 美式女声"],
    ["en-US-GuyNeural", "Guy · 美式男声"],
    ["en-US-AriaNeural", "Aria · 多风格女声"],
    ["en-GB-SoniaNeural", "Sonia · 英式女声"],
    ["en-GB-RyanNeural", "Ryan · 英式男声"],
  ]},
  { group: "日韩/欧洲", items: [
    ["ja-JP-NanamiNeural", "Nanami · 日语女声"],
    ["ja-JP-KeitaNeural", "Keita · 日语男声"],
    ["ko-KR-SunHiNeural", "SunHi · 韩语女声"],
    ["ko-KR-InJoonNeural", "InJoon · 韩语男声"],
    ["fr-FR-DeniseNeural", "Denise · 法语女声"],
    ["de-DE-KatjaNeural", "Katja · 德语女声"],
    ["es-ES-ElviraNeural", "Elvira · 西语女声"],
    ["ru-RU-SvetlanaNeural", "Svetlana · 俄语女声"],
  ]},
] as const;

const AUDIO_TYPES = ".mp3,.wav,.m4a,.flac,.aac,.ogg,.webm,.amr,.3gp";

type Mode = "tts" | "stt";
type TtsInputMode = "text" | "file";
type TokenMode = "default" | "custom";

function formatSize(size: number) {
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

export function VoiceConverter() {
  const [mode, setMode] = useState<Mode>("tts");
  const [ttsInputMode, setTtsInputMode] = useState<TtsInputMode>("text");
  const [text, setText] = useState("欢迎使用在线语音转换工具，这里可以把文字转换成自然流畅的语音。");
  const [voice, setVoice] = useState("zh-CN-XiaoxiaoNeural");
  const [speed, setSpeed] = useState(1);
  const [pitch, setPitch] = useState(0);
  const [volume, setVolume] = useState(0);
  const [txtFile, setTxtFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("speech.mp3");
  const [transcription, setTranscription] = useState("");
  const [tokenMode, setTokenMode] = useState<TokenMode>("default");
  const [customToken, setCustomToken] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const textLength = useMemo(() => text.trim().length, [text]);

  function resetMessage() {
    setMessage(null);
  }

  async function handleTxtFileChange(event: ChangeEvent<HTMLInputElement>) {
    resetMessage();
    const file = event.target.files?.[0] || null;
    setTxtFile(file);

    if (!file) return;

    if (!/\.txt$/i.test(file.name) && file.type !== "text/plain") {
      setMessage({ type: "error", text: "请选择 txt 文本文件" });
      return;
    }

    if (file.size > 500 * 1024) {
      setMessage({ type: "error", text: "文本文件不能超过 500KB" });
      return;
    }

    const content = await file.text();
    setText(content.slice(0, 8000));
    setMessage({ type: "success", text: `已读取 ${file.name}` });
  }

  function handleAudioFileChange(event: ChangeEvent<HTMLInputElement>) {
    resetMessage();
    const file = event.target.files?.[0] || null;
    setAudioFile(file);
  }

  async function handleTtsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetMessage();

    if (!text.trim()) {
      setMessage({ type: "error", text: "请输入要转换的文本内容" });
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: text, voice, speed, pitch, volume }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "生成失败" }));
        throw new Error(data.error || "生成失败");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const name = `speech-${Date.now()}.mp3`;
      setAudioUrl(url);
      setDownloadName(name);
      setMessage({ type: "success", text: "语音生成成功，可以播放或下载 MP3 文件" });
      setTimeout(() => audioRef.current?.play().catch(() => undefined), 100);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "生成失败" });
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleTranscriptionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetMessage();

    if (!audioFile) {
      setMessage({ type: "error", text: "请选择要转录的音频文件" });
      return;
    }

    if (audioFile.size > 10 * 1024 * 1024) {
      setMessage({ type: "error", text: "音频文件不能超过 10MB" });
      return;
    }

    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("file", audioFile);
      if (tokenMode === "custom" && customToken.trim()) {
        formData.append("token", customToken.trim());
      }

      const response = await fetch("/api/voice/transcriptions", {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "转录失败");
      }

      setTranscription(data.text || "");
      setMessage({ type: "success", text: "语音转文字完成" });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "转录失败" });
    } finally {
      setIsTranscribing(false);
    }
  }

  async function copyTranscription() {
    if (!transcription.trim()) return;
    await navigator.clipboard.writeText(transcription);
    setMessage({ type: "success", text: "已复制转录文本" });
  }

  function useTranscriptionForTts() {
    if (!transcription.trim()) return;
    setText(transcription);
    setMode("tts");
    setTtsInputMode("text");
    setMessage({ type: "info", text: "已填入文字转语音输入框" });
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-600">VoiceCraft</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">语音转换</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              参照 tts.wangwangit.com 的双向语音处理：Microsoft Edge 在线 TTS 生成 MP3，硅基流动 SenseVoice 语音转文字。
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 text-sm font-medium max-[379px]:grid-cols-1 lg:w-auto">
            <button
              type="button"
              onClick={() => setMode("tts")}
              className={`min-h-11 rounded-xl px-4 py-2 transition md:min-h-0 ${mode === "tts" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}
            >
              🎙️ 文字转语音
            </button>
            <button
              type="button"
              onClick={() => setMode("stt")}
              className={`min-h-11 rounded-xl px-4 py-2 transition md:min-h-0 ${mode === "stt" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}
            >
              🎧 语音转文字
            </button>
          </div>
        </div>
      </section>

      {message && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          message.type === "error" ? "border-red-200 bg-red-50 text-red-700" :
          message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
          "border-blue-200 bg-blue-50 text-blue-700"
        }`}>
          <span className="break-words">{message.text}</span>
        </div>
      )}

      {mode === "tts" ? (
        <form onSubmit={handleTtsSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-4 flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-sm">
              <button
                type="button"
                onClick={() => setTtsInputMode("text")}
                className={`min-h-11 flex-1 rounded-md px-3 py-2 md:min-h-0 ${ttsInputMode === "text" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}`}
              >
                手动输入
              </button>
              <button
                type="button"
                onClick={() => setTtsInputMode("file")}
                className={`min-h-11 flex-1 rounded-md px-3 py-2 md:min-h-0 ${ttsInputMode === "file" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}`}
              >
                上传 txt
              </button>
            </div>

            {ttsInputMode === "file" && (
              <label className="mb-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center hover:border-blue-300 hover:bg-blue-50/40">
                <span className="text-2xl">📄</span>
                <span className="mt-2 text-sm font-medium text-slate-700">点击选择 txt 文件</span>
                <span className="mt-1 text-xs text-slate-400">最大 500KB，读取后会填入下方文本框</span>
                <input className="hidden" type="file" accept=".txt,text/plain" onChange={handleTxtFileChange} />
                {txtFile && <span className="mt-2 max-w-full break-all text-xs text-blue-600">{txtFile.name} · {formatSize(txtFile.size)}</span>}
              </label>
            )}

            <label className="mb-2 block text-sm font-medium text-slate-700">输入文本</label>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, 8000))}
              placeholder="请输入要转换成语音的文字..."
              className="min-h-72 w-full rounded-xl border border-slate-200 p-4 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
              <span>支持中英日韩等多语言文本</span>
              <span>{textLength}/8000</span>
            </div>
          </section>

          <aside className="space-y-4 min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">语音选择</label>
              <select
                value={voice}
                onChange={(event) => setVoice(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:min-h-0"
              >
                {VOICES.map((group) => (
                  <optgroup key={group.group} label={group.group}>
                    {group.items.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 flex justify-between text-sm font-medium text-slate-700"><span>语速</span><span>{speed.toFixed(1)}x</span></label>
              <div className="flex min-h-11 items-center md:min-h-0">
                <input type="range" min="0.5" max="2" step="0.1" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} className="w-full accent-blue-600" />
              </div>
            </div>
            <div>
              <label className="mb-2 flex justify-between text-sm font-medium text-slate-700"><span>音调</span><span>{pitch}Hz</span></label>
              <div className="flex min-h-11 items-center md:min-h-0">
                <input type="range" min="-50" max="50" step="1" value={pitch} onChange={(event) => setPitch(Number(event.target.value))} className="w-full accent-blue-600" />
              </div>
            </div>
            <div>
              <label className="mb-2 flex justify-between text-sm font-medium text-slate-700"><span>音量</span><span>{volume}%</span></label>
              <div className="flex min-h-11 items-center md:min-h-0">
                <input type="range" min="-100" max="100" step="1" value={volume} onChange={(event) => setVolume(Number(event.target.value))} className="w-full accent-blue-600" />
              </div>
            </div>

            <button
              type="submit"
              disabled={isGenerating}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? "生成中..." : "🎙️ 开始生成语音"}
            </button>

            {audioUrl && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <audio ref={audioRef} src={audioUrl} controls className="w-full" />
                <a href={audioUrl} download={downloadName} className="mt-3 flex min-h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 md:min-h-0">
                  📥 下载 MP3
                </a>
              </div>
            )}
          </aside>
        </form>
      ) : (
        <form onSubmit={handleTranscriptionSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <label className="flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center hover:border-blue-300 hover:bg-blue-50/40 sm:px-6">
              <span className="text-4xl">🎧</span>
              <span className="mt-3 text-base font-semibold text-slate-800">拖拽/点击选择音频文件</span>
              <span className="mt-2 text-sm text-slate-500">支持 mp3、wav、m4a、flac、aac、ogg、webm、amr、3gp，最大 10MB</span>
              <input className="hidden" type="file" accept={AUDIO_TYPES} onChange={handleAudioFileChange} />
              {audioFile && <span className="mt-4 max-w-full break-all rounded-xl bg-blue-100 px-3 py-2 text-sm text-blue-700">{audioFile.name} · {formatSize(audioFile.size)}</span>}
            </label>

            {transcription && (
              <div className="mt-6">
                <div className="mb-2 flex flex-col gap-2 min-[380px]:flex-row min-[380px]:items-center min-[380px]:justify-between">
                  <label className="text-sm font-medium text-slate-700">转录结果</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={copyTranscription} className="min-h-11 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 md:min-h-0">复制</button>
                    <button type="button" onClick={useTranscriptionForTts} className="min-h-11 rounded-lg border border-blue-200 px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 md:min-h-0">转为语音</button>
                  </div>
                </div>
                <textarea
                  value={transcription}
                  onChange={(event) => setTranscription(event.target.value)}
                  className="min-h-56 w-full rounded-xl border border-slate-200 p-4 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            )}
          </section>

          <aside className="space-y-4 min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">API Token 配置</label>
              <div className="grid gap-2 text-sm">
                <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 md:min-h-0 ${tokenMode === "default" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}>
                  <input type="radio" checked={tokenMode === "default"} onChange={() => setTokenMode("default")} />
                  使用服务器默认 Token
                </label>
                <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 md:min-h-0 ${tokenMode === "custom" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}>
                  <input type="radio" checked={tokenMode === "custom"} onChange={() => setTokenMode("custom")} />
                  使用自定义硅基流动 Token
                </label>
              </div>
              {tokenMode === "custom" && (
                <input
                  type="password"
                  value={customToken}
                  onChange={(event) => setCustomToken(event.target.value)}
                  placeholder="sk-..."
                  className="mt-3 min-h-11 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:min-h-0"
                />
              )}
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-700">
              STT 使用硅基流动 FunAudioLLM/SenseVoiceSmall。若服务器未配置默认 Token，请选择自定义 Token。
            </div>

            <button
              type="submit"
              disabled={isTranscribing}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isTranscribing ? "转录中..." : "🎧 开始语音转文字"}
            </button>
          </aside>
        </form>
      )}
    </div>
  );
}
