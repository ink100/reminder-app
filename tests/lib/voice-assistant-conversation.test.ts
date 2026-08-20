import { describe, expect, it } from "vitest";

import { buildVoiceAssistantRequestMessages, type VoiceAssistantChatMessage } from "@/lib/voice/conversation";

describe("voice assistant conversation requests", () => {
  it("does not mutate history when preparing a new transcript", () => {
    const history: VoiceAssistantChatMessage[] = [{ role: "user", content: "旧问题" }, { role: "assistant", content: "旧回答" }];
    const request = buildVoiceAssistantRequestMessages(history, "新问题");
    expect(history).toHaveLength(2);
    expect(request.at(-1)).toEqual({ role: "user", content: "新问题" });
  });

  it("keeps requests below the server limit and never starts with an orphaned assistant reply", () => {
    const history: VoiceAssistantChatMessage[] = Array.from({ length: 40 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: String(index),
    }));
    const request = buildVoiceAssistantRequestMessages(history, "latest");
    expect(request.length).toBeLessThanOrEqual(29);
    expect(request[0]?.role).toBe("user");
    expect(request.at(-1)).toEqual({ role: "user", content: "latest" });
  });
});
