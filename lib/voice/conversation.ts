export type VoiceAssistantChatMessage = { role: "user" | "assistant"; content: string };

/** Keep requests below the server's 30-message limit without starting on an orphaned AI reply. */
export function buildVoiceAssistantRequestMessages(
  history: readonly VoiceAssistantChatMessage[],
  transcript: string,
): VoiceAssistantChatMessage[] {
  const recent = history.slice(-28);
  while (recent[0]?.role === "assistant") recent.shift();
  return [...recent, { role: "user", content: transcript }];
}
