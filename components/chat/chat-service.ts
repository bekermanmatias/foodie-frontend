"use client";

import { chatApi, CHAT_API_BASE_URL } from "./chat-api";

export interface Chat {
  chatId: string;
  clientId: string;
  lastMessage: string;
  lastMessageTimestamp: string;
  phoneNumber: string;
  contactName: string;
  unreadCount: number;
  chatStatus: "bot" | "human";
  statusChangeTime?: string;
  tags: string[];
  assignedAdvisorId?: string | null;
  assignedAdvisorName?: string | null;
}

export interface Message {
  id: string;
  chatId: string;
  sender: "user" | "bot";
  content: string;
  timestamp: string;
  status: "sent" | "delivered" | "read";
  /**
   * Pupuia keeps manually sent outbound messages under `sender: "bot"` for
   * transport compatibility, and identifies their actual origin separately.
   */
  sentBy?: string | null;
  outboundOrigin?: string | null;
  mediaUrl?: string | null;
  mediaType?: "image" | "video" | "audio" | "document" | null;
  fileName?: string | null;
  mimeType?: string | null;
  _id?: string;
}

export function getMessageAuthorLabel(message: Message): "Bot" | "Manual" | null {
  if (message.sender !== "bot") return null;

  const sentBy = message.sentBy?.trim().toLowerCase();
  const outboundOrigin = message.outboundOrigin?.trim().toLowerCase();

  return sentBy === "manual" || outboundOrigin === "human" || outboundOrigin === "manual" ? "Manual" : "Bot";
}

export interface ChatWithMessages {
  chat: Chat;
  messages: Message[];
}

export const chatService = {
  async getChats(clientId: string | undefined, skip: number, limit: number): Promise<Chat[]> {
    const params: Record<string, string | number> = { skip, limit };
    if (clientId) params.clientId = clientId;
    const response = await chatApi.get("/chats", { params });
    return response.data;
  },

  async getChatWithMessages(chatId: string, signal?: AbortSignal): Promise<ChatWithMessages> {
    const response = await chatApi.get(`/chats/${encodeURIComponent(chatId)}`, { signal });
    return response.data;
  },

  async changeChatStatus(chatId: string, status: "bot" | "human"): Promise<Chat> {
    const response = await chatApi.post(`/chats/${chatId}/status`, { status });
    return response.data;
  },

  async sendMessage(chatId: string, content: string): Promise<Message> {
    const response = await chatApi.post(`/chats/${chatId}/message`, { content });
    return response.data.message;
  },

  async sendMediaMessage(chatId: string, file: File, caption?: string): Promise<Message> {
    const formData = new FormData();
    formData.append("file", file);
    if (caption) formData.append("content", caption);

    const response = await chatApi.post(`/chats/${chatId}/message`, formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });
    return response.data.message;
  },

  getMediaUrl(messageId: string) {
    return `${CHAT_API_BASE_URL}/chats/media/${messageId}`;
  },

  async findChatByPhone(phoneNumber: string, clientId?: string): Promise<Chat | null> {
    try {
      const params: Record<string, string> = { phoneNumber };
      if (clientId) params.clientId = clientId;
      const response = await chatApi.get("/chats/search/phone", { params });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) return null;
      throw error;
    }
  },

  async searchChats(query: string, clientId?: string, signal?: AbortSignal): Promise<Chat[]> {
    try {
      const params: Record<string, string> = { query };
      if (clientId) params.clientId = clientId;
      const response = await chatApi.get("/chats/search", { params, signal });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) return [];
      throw error;
    }
  },

  async assignChatToAdvisor(chatId: string, advisorId: string | null): Promise<Chat> {
    const response = await chatApi.put(`/chats/${chatId}/assign-advisor`, { advisorId });
    return response.data.chat;
  },

  async deleteMessage(messageId: string) {
    await chatApi.delete(`/chats/messages/${messageId}`);
  },

  async deleteChat(chatId: string) {
    await chatApi.delete(`/chats/${chatId}`);
  }
};
