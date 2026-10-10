export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  readonly id: string;
  readonly role: ChatRole;
  readonly content: string;
  /**
   * True while a streamed assistant reply is still arriving. Cleared on
   * terminal `finish`; a failed stream keeps partial text with the flag
   * cleared and an error shown separately.
   */
  readonly isStreaming?: boolean | undefined;
}

export type ChatStatus = "idle" | "loading" | "error";

export interface ChatErrorInfo {
  readonly code: string;
  readonly message: string;
}
