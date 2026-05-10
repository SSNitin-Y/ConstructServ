// frontend/types/conversation.ts

export type ConversationRole = "user" | "assistant" | "system" | "tool";

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  content: string;
  meta?: Record<string, any> | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  media_id: string;
  created_at: string;
  messages: ConversationMessage[];
}

export interface AskRequest {
  prompt: string;
  model?: string;
  system?: string;
  report_summary?: string | null;
  job_id?: string | null;
}

export interface AskResponse {
  conversation_id: string;
  user_message: ConversationMessage;
  assistant_message: ConversationMessage;
}
