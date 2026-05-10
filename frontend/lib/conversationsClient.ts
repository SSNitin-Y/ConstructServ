// frontend/lib/conversationsClient.ts

import { api } from "./api";
import type { Conversation, AskRequest, AskResponse } from "@/types/conversation";

export async function fetchConversation(mediaId: string): Promise<Conversation> {
  return api.get<Conversation>(`/media/${mediaId}/conversation`);
}

export async function askMediaQuestion(
  mediaId: string,
  payload: AskRequest
): Promise<AskResponse> {
  return api.post<AskResponse>(`/media/${mediaId}/conversation/ask`, payload);
}
