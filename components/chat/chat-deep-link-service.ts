"use client";

import { chatService } from "./chat-service";

export async function loadLinkedConversation(chatId: string, user: { role: string; clientId?: string } | null, signal?: AbortSignal) {
  if (!user) throw new Error("No hay una sesión de chat disponible. Volvé a ingresar.");
  try {
    const result = await chatService.getChatWithMessages(chatId, signal);
    if (signal?.aborted) return null;
    const chat = result.chat;
    if (!chat || chat.chatId !== chatId || (user.role !== "admin" && (!user.clientId || chat.clientId !== user.clientId))) {
      throw new Error("La conversación no pertenece a tu sesión de chat.");
    }
    return result;
  } catch (err: any) {
    if (signal?.aborted) return null;
    if (err.response?.status === 404) throw new Error("La conversación ya no está disponible.");
    if (err.response?.status === 401) throw new Error("Tu sesión de chat venció. Volvé a ingresar.");
    if (err.response?.status === 403) throw new Error("No tenés permiso para abrir esta conversación.");
    throw new Error(err.response ? "No pudimos abrir la conversación. Intentá nuevamente." : (err.message || "No pudimos conectar con el chat."));
  }
}
