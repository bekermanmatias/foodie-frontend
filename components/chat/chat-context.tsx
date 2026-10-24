"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { logChatActivity, serializeChatError } from "./chat-activity-service";
import { useChatAuth } from "./chat-auth";
import { loadLinkedConversation } from "./chat-deep-link-service";
import { chatService, type Chat, type Message } from "./chat-service";
import { chatSseService } from "./chat-sse-service";

type ChatContextValue = {
  chats: Chat[];
  activeChat: Chat | null;
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  setActiveChat: (chat: Chat | null) => void;
  toggleChatMode: (chatId: string) => void;
  sendMessage: (content: string) => Promise<void>;
  sendMediaMessage: (file: File, caption?: string) => Promise<void>;
  takeChatControl: (chatId: string) => void;
  deleteMessage: (messageId: string) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  refreshChats: () => void;
  loadMoreChats: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  openChatById: (chatId: string, signal?: AbortSignal) => Promise<void>;
  navigateToChatByPhone: (phoneNumber: string) => Promise<boolean>;
  searchChats: (query: string) => void;
  clearSearch: () => void;
  isSearching: boolean;
  searchResults: Chat[];
  isSearchActive: boolean;
  searchHint: string | null;
};

const ChatContext = createContext<ChatContextValue | null>(null);
const CHAT_PAGE_LIMIT = 50;

function getMessageKey(message: Message) {
  return message.id || message._id || `${message.chatId}-${message.sender}-${message.timestamp}-${message.content}`;
}

function sortMessages(messages: Message[]) {
  return messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function appendUniqueMessage(current: Message[], nextMessage: Message) {
  const nextKey = getMessageKey(nextMessage);
  if (current.some((message) => getMessageKey(message) === nextKey)) return current;
  return sortMessages([...current, nextMessage]);
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user } = useChatAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Chat[]>([]);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchHint, setSearchHint] = useState<string | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchRequestRef = useRef(0);

  const token = typeof window !== "undefined" ? window.localStorage.getItem("auth_token") : "";

  const refreshChats = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const clientId = user.role === "admin" ? undefined : user.clientId;
      const chatList = await chatService.getChats(clientId, 0, CHAT_PAGE_LIMIT);
      setChats(chatList);
      setSkip(chatList.length);
      setHasMore(chatList.length === CHAT_PAGE_LIMIT);
    } catch (err: any) {
      setError(err.response?.data?.message || "Error al cargar chats");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const loadChatMessages = useCallback(async (chat: Chat) => {
    try {
      const chatWithMessages = await chatService.getChatWithMessages(chat.chatId);
      const uniqueMessages = Array.from(new Map(chatWithMessages.messages.map((message) => [getMessageKey(message), message])).values());
      const sorted = sortMessages(uniqueMessages);
      setMessages(sorted);
    } catch (err: any) {
      setError(err.response?.data?.message || "Error al cargar mensajes");
    }
  }, []);

  const handleNewMessage = useCallback(
    (data: any) => {
      const { chatId, sender, content, timestamp } = data;
      if (activeChat && activeChat.chatId === chatId) {
        loadChatMessages(activeChat);
      }
      setChats((current) => {
        const existing = current.find((chat) => chat.chatId === chatId);
        if (!existing) {
          void refreshChats();
          return current;
        }
        return [
          {
            ...existing,
            lastMessage: content,
            lastMessageTimestamp: timestamp,
            unreadCount: activeChat?.chatId === chatId || sender !== "user" ? existing.unreadCount : existing.unreadCount + 1
          },
          ...current.filter((chat) => chat.chatId !== chatId)
        ];
      });
    },
    [activeChat, loadChatMessages, refreshChats]
  );

  const handleChatStatusChanged = useCallback(
    (data: any) => {
      const { chatId, chatStatus, statusChangeTime } = data;
      setChats((current) => current.map((chat) => (chat.chatId === chatId ? { ...chat, chatStatus, statusChangeTime } : chat)));
      if (activeChat?.chatId === chatId) {
        setActiveChat((current) => (current ? { ...current, chatStatus, statusChangeTime } : null));
      }
    },
    [activeChat]
  );

  const handleChatUpdated = useCallback(
    (data: any) => {
      setChats((current) => current.map((chat) => (chat.chatId === data.chatId ? { ...chat, ...data } : chat)));
      if (activeChat?.chatId === data.chatId) {
        setActiveChat((current) => (current ? { ...current, ...data } : null));
      }
    },
    [activeChat]
  );

  useEffect(() => {
    if (!user || !token) return;
    chatSseService.connect(token);
    const unsubscribe = chatSseService.subscribe((event) => {
      if (event.type === "new_message") handleNewMessage(event.data);
      if (event.type === "chat_status_changed") handleChatStatusChanged(event.data);
      if (event.type === "chat_updated") handleChatUpdated(event.data);
    });
    return () => {
      unsubscribe();
      chatSseService.disconnect();
    };
  }, [user, token, handleNewMessage, handleChatStatusChanged, handleChatUpdated]);

  useEffect(() => {
    if (user) void refreshChats();
  }, [user, refreshChats]);

  useEffect(() => {
    if (activeChat) {
      void loadChatMessages(activeChat);
    } else {
      setMessages([]);
    }
  }, [activeChat, loadChatMessages]);

  const loadMoreChats = useCallback(async () => {
    if (isLoading || isLoadingMore || !hasMore || !user) return;
    setIsLoadingMore(true);
    setError(null);
    try {
      const clientId = user.role === "admin" ? undefined : user.clientId;
      const newChats = await chatService.getChats(clientId, skip, CHAT_PAGE_LIMIT);
      if (newChats.length > 0) {
        setChats((current) => [...current, ...newChats]);
        setSkip((current) => current + newChats.length);
      }
      setHasMore(newChats.length === CHAT_PAGE_LIMIT);
    } catch (err: any) {
      setError(err.response?.data?.message || "Error al cargar mas chats");
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoading, isLoadingMore, skip, user]);

  const toggleChatMode = useCallback(async (chatId: string) => {
    const chat = chats.find((item) => item.chatId === chatId);
    if (!chat) return;
    try {
      const partialUpdate = await chatService.changeChatStatus(chatId, chat.chatStatus === "bot" ? "human" : "bot");
      setChats((current) => current.map((item) => (item.chatId === chatId ? { ...item, ...partialUpdate } : item)));
      if (activeChat?.chatId === chatId) {
        setActiveChat((current) => (current ? { ...current, ...partialUpdate } : null));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Error al cambiar modo del chat");
    }
  }, [activeChat, chats]);

  const sendMessage = useCallback(async (content: string) => {
    if (!activeChat) return;
    try {
      const newMessage = await chatService.sendMessage(activeChat.chatId, content);
      void logChatActivity({
        action: "message.sent",
        status: "success",
        chatId: activeChat.chatId,
        chatClientId: activeChat.clientId,
        contactName: activeChat.contactName,
        contactPhone: activeChat.phoneNumber,
        messageType: "text",
        messageContent: content,
        externalMessageId: newMessage.id || newMessage._id || null,
        externalResponse: newMessage,
        metadata: {
          chatStatus: activeChat.chatStatus,
          assignedAdvisorId: activeChat.assignedAdvisorId || null,
          assignedAdvisorName: activeChat.assignedAdvisorName || null,
          tags: activeChat.tags || []
        }
      });
      setMessages((current) => appendUniqueMessage(current, newMessage));
      setChats((current) =>
        current.map((chat) => (chat.chatId === activeChat.chatId ? { ...chat, lastMessage: content, lastMessageTimestamp: newMessage.timestamp } : chat))
      );
    } catch (err: any) {
      const serializedError = serializeChatError(err);
      void logChatActivity({
        action: "message.send_failed",
        status: "error",
        chatId: activeChat.chatId,
        chatClientId: activeChat.clientId,
        contactName: activeChat.contactName,
        contactPhone: activeChat.phoneNumber,
        messageType: "text",
        messageContent: content,
        errorMessage: serializedError.message,
        metadata: {
          chatStatus: activeChat.chatStatus,
          error: serializedError
        }
      });
      setError(err.response?.data?.message || "Error al enviar mensaje");
      throw err;
    }
  }, [activeChat]);

  const sendMediaMessage = useCallback(async (file: File, caption?: string) => {
    if (!activeChat) return;
    try {
      const newMessage = await chatService.sendMediaMessage(activeChat.chatId, file, caption);
      void logChatActivity({
        action: "media.sent",
        status: "success",
        chatId: activeChat.chatId,
        chatClientId: activeChat.clientId,
        contactName: activeChat.contactName,
        contactPhone: activeChat.phoneNumber,
        messageType: "media",
        messageContent: caption || null,
        fileName: file.name,
        fileMimeType: file.type || null,
        fileSize: file.size,
        externalMessageId: newMessage.id || newMessage._id || null,
        externalResponse: newMessage,
        metadata: {
          chatStatus: activeChat.chatStatus,
          lastModified: file.lastModified,
          mediaType: newMessage.mediaType || null,
          mediaUrl: newMessage.mediaUrl || null,
          tags: activeChat.tags || []
        }
      });
      setMessages((current) => appendUniqueMessage(current, newMessage));
      const displayText = caption || (file ? `Adjunto ${file.name}` : "[archivo]");
      setChats((current) =>
        current.map((chat) =>
          chat.chatId === activeChat.chatId ? { ...chat, lastMessage: displayText, lastMessageTimestamp: newMessage.timestamp } : chat
        )
      );
    } catch (err: any) {
      const serializedError = serializeChatError(err);
      void logChatActivity({
        action: "media.send_failed",
        status: "error",
        chatId: activeChat.chatId,
        chatClientId: activeChat.clientId,
        contactName: activeChat.contactName,
        contactPhone: activeChat.phoneNumber,
        messageType: "media",
        messageContent: caption || null,
        fileName: file.name,
        fileMimeType: file.type || null,
        fileSize: file.size,
        errorMessage: serializedError.message,
        metadata: {
          chatStatus: activeChat.chatStatus,
          lastModified: file.lastModified,
          error: serializedError
        }
      });
      setError(err.response?.data?.message || "Error al enviar archivo");
      throw err;
    }
  }, [activeChat]);

  const takeChatControl = useCallback(async (chatId: string) => {
    try {
      const partialUpdate = await chatService.changeChatStatus(chatId, "human");
      setChats((current) => current.map((chat) => (chat.chatId === chatId ? { ...chat, ...partialUpdate } : chat)));
      if (activeChat?.chatId === chatId) {
        setActiveChat((current) => (current ? { ...current, ...partialUpdate } : null));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Error al tomar control del chat");
    }
  }, [activeChat]);

  const deleteMessage = useCallback(async (messageId: string) => {
    await chatService.deleteMessage(messageId);
    setMessages((current) => current.filter((message) => message.id !== messageId && message._id !== messageId));
  }, []);

  const deleteChat = useCallback(async (chatId: string) => {
    await chatService.deleteChat(chatId);
    setChats((current) => current.filter((chat) => chat.chatId !== chatId));
    if (activeChat?.chatId === chatId) {
      setActiveChat(null);
      setMessages([]);
    }
  }, [activeChat]);

  const openChatById = useCallback(async (chatId: string, signal?: AbortSignal) => {
    const result = await loadLinkedConversation(chatId, user, signal);
    if (!result || signal?.aborted) return;
    const chat = result.chat;
    setActiveChat(chat);
    setMessages(sortMessages(Array.from(new Map(result.messages.map((message) => [getMessageKey(message), message])).values())));
    setChats((current) => [{ ...chat, unreadCount: 0 }, ...current.filter((item) => item.chatId !== chatId)]);
    setError(null);
  }, [user]);

  const navigateToChatByPhone = useCallback(async (phoneNumber: string) => {
    const normalize = (value: string) => value.replace(/[\s\-\(\)\+]/g, "");
    let matchingChat = chats.find((chat) => {
      const current = normalize(chat.phoneNumber);
      const incoming = normalize(phoneNumber);
      return current === incoming || current.endsWith(incoming) || incoming.endsWith(current) || current.includes(incoming) || incoming.includes(current);
    });
    if (!matchingChat) {
      const clientId = user?.role === "admin" ? undefined : user?.clientId;
      const found = await chatService.findChatByPhone(phoneNumber, clientId);
      if (found) matchingChat = found;
    }
    if (!matchingChat) return false;
    setActiveChat(matchingChat);
    setChats((current) => {
      const exists = current.some((chat) => chat.chatId === matchingChat.chatId);
      if (exists) {
        return current.map((chat) => (chat.chatId === matchingChat.chatId ? { ...chat, unreadCount: 0 } : chat));
      }
      return [{ ...matchingChat, unreadCount: 0 }, ...current];
    });
    return true;
  }, [chats, user]);

  const searchChats = useCallback(async (query: string) => {
    const requestId = ++searchRequestRef.current;
    searchAbortRef.current?.abort();
    const trimmedQuery = query.trim();
    if (!user || trimmedQuery.length === 0) {
      setSearchResults([]);
      setIsSearchActive(false);
      setSearchHint(null);
      setError(null);
      setIsSearching(false);
      return;
    }
    if (/^\d+$/.test(trimmedQuery) && trimmedQuery.length < 4) {
      setSearchResults([]);
      setIsSearchActive(true);
      setSearchHint("Ingresá al menos 4 dígitos para buscar por teléfono.");
      setError(null);
      setIsSearching(false);
      return;
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setIsSearching(true);
    setIsSearchActive(true);
    setSearchHint(null);
    setError(null);
    try {
      const clientId = user.role === "admin" ? undefined : user.clientId;
      const results = await chatService.searchChats(query, clientId, controller.signal);
      if (requestId !== searchRequestRef.current) return;
      setSearchResults(results);
    } catch (err: any) {
      if (err?.code === "ERR_CANCELED" || requestId !== searchRequestRef.current) return;
      setError(err.response?.data?.message || err.response?.data?.msg || "Error al buscar chats");
      setSearchResults([]);
    } finally {
      if (requestId === searchRequestRef.current) setIsSearching(false);
    }
  }, [user]);

  const clearSearch = useCallback(() => {
    searchRequestRef.current += 1;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setSearchResults([]);
    setIsSearchActive(false);
    setSearchHint(null);
    setError(null);
    setIsSearching(false);
  }, []);

  const handleSetActiveChat = useCallback((chat: Chat | null) => {
    setActiveChat(chat);
    if (!chat) return;
    setChats((current) => current.map((item) => (item.chatId === chat.chatId ? { ...item, unreadCount: 0 } : item)));
  }, []);

  return (
    <ChatContext.Provider
      value={{
        chats,
        activeChat,
        messages,
        isLoading,
        error,
        setActiveChat: handleSetActiveChat,
        toggleChatMode,
        sendMessage,
        sendMediaMessage,
        takeChatControl,
        deleteMessage,
        deleteChat,
        refreshChats,
        loadMoreChats,
        hasMore,
        isLoadingMore,
        openChatById,
        navigateToChatByPhone,
        searchChats,
        clearSearch,
        isSearching,
        searchResults,
        isSearchActive,
        searchHint
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) throw new Error("useChat must be used within ChatProvider");
  return context;
}
