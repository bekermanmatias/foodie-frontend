"use client";

import { format, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Download,
  FileIcon,
  Film,
  Image,
  Loader2,
  Mic,
  MoreHorizontal,
  Paperclip,
  Phone,
  RefreshCw,
  Search,
  Send,
  Tag,
  Trash2,
  User,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { ConfirmDialog } from "../confirm-dialog";
import { useChatAuth } from "./chat-auth";
import { useChat } from "./chat-context";
import { ChatExportModal } from "./chat-export-modal";
import { chatService, getMessageAuthorLabel, type Chat, type Message } from "./chat-service";
import { ATTENTION_TAG_NAME, isAttentionTag, normalizeChatTagName, useChatTagService } from "./chat-tag-service";
import { ChatTagBadge } from "./chat-tag-badge";
import { ChatTagFilter } from "./chat-tag-filter";
import { ChatTagManagerModal } from "./chat-tag-manager-modal";
import { ChatTagSelector } from "./chat-tag-selector";
import { ChatTimer } from "./chat-timer";
import { ChatSearchBar } from "./chat-search-bar";

function formatTime(timestamp: string) {
  try {
    return new Date(timestamp).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatChatDate(timestamp: string) {
  try {
    const date = new Date(timestamp);
    if (isToday(date)) return formatTime(timestamp);
    if (isYesterday(date)) return "Ayer";
    return format(date, "dd/MM/yy");
  } catch {
    return "";
  }
}

function formatMessageDate(timestamp: string) {
  try {
    const date = new Date(timestamp);
    if (isToday(date)) return "Hoy";
    if (isYesterday(date)) return "Ayer";
    return format(date, "EEEE, dd MMMM yyyy", { locale: es });
  } catch {
    return "";
  }
}

function groupMessagesByDate(messages: Message[]) {
  const groups: Record<string, Message[]> = {};
  for (const message of messages) {
    try {
      const date = new Date(message.timestamp);
      const key = format(date, "yyyy-MM-dd");
      groups[key] ||= [];
      groups[key].push(message);
    } catch {}
  }
  Object.keys(groups).forEach((key) => {
    groups[key].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  });
  return groups;
}

function getMediaTypeIcon(mediaType?: string | null) {
  switch (mediaType) {
    case "image":
      return <Image className="h-4 w-4" />;
    case "video":
      return <Film className="h-4 w-4" />;
    case "audio":
      return <Mic className="h-4 w-4" />;
    default:
      return <FileIcon className="h-4 w-4" />;
  }
}

function getFileTypeLabel(file: File) {
  if (file.type.startsWith("image/")) return "Imagen";
  if (file.type.startsWith("video/")) return "Video";
  if (file.type.startsWith("audio/")) return "Audio";
  return "Documento";
}

function getAvatarText(chat: Chat) {
  const base = chat.contactName || chat.phoneNumber || "U";
  return base
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function ChatDashboard() {
  const { user } = useChatAuth();
  const {
    chats,
    activeChat,
    messages,
    isLoading,
    error,
    setActiveChat,
    toggleChatMode,
    sendMessage,
    sendMediaMessage,
    takeChatControl,
    refreshChats,
    loadMoreChats,
    hasMore,
    isLoadingMore,
    searchChats,
    clearSearch,
    isSearching,
    searchResults,
    isSearchActive,
    searchHint,
    deleteMessage,
    deleteChat
  } = useChat();
  const tagService = useChatTagService();
  const listRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileChatList, setShowMobileChatList] = useState(false);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; fileName?: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isSendingFile, setIsSendingFile] = useState(false);
  const [deleteChatDialog, setDeleteChatDialog] = useState<{ open: boolean; chatId: string }>({ open: false, chatId: "" });
  const [deleteMessageDialog, setDeleteMessageDialog] = useState<{ open: boolean; messageId: string }>({ open: false, messageId: "" });

  useEffect(() => {
    void tagService.loadUserTags();
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1280);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    setShowMobileChatList(!activeChat || isMobile);
  }, [activeChat, isMobile]);

  const handleAddTag = async (chatId: string, tagName: string) => {
    // Actualización optimista local
    if (activeChat?.chatId === chatId) {
      const currentTags = activeChat.tags || [];
      if (!currentTags.includes(tagName)) {
        setActiveChat({ ...activeChat, tags: [...currentTags, tagName] });
      }
    }

    try {
      const result = await tagService.addTagToChat(chatId, tagName);
      toast.success("Tag agregada", { description: `Se agregó "${tagName}" al chat` });
      if (result.metaEvent?.attempted) {
        if (result.metaEvent.success) {
          toast.success("Evento enviado a Meta", { description: result.metaEvent.eventName || "Evento enviado correctamente" });
        } else if (result.metaEvent.error) {
          toast.error("Error al enviar evento a Meta", { description: result.metaEvent.error });
        }
      }
      refreshChats();
    } catch (err: any) {
      // Revertir en caso de error
      if (activeChat?.chatId === chatId) {
        setActiveChat({ ...activeChat, tags: activeChat.tags?.filter(t => t !== tagName) || [] });
      }
      toast.error("No se pudo agregar la tag", { description: err.message || "Error inesperado" });
    }
  };

  const handleRemoveTag = async (chatId: string, tagName: string) => {
    // Actualización optimista local
    if (activeChat?.chatId === chatId) {
      const currentTags = activeChat.tags || [];
      setActiveChat({ ...activeChat, tags: currentTags.filter((t) => t !== tagName) });
    }

    try {
      await tagService.removeTagFromChat(chatId, tagName);
      toast.success("Tag removida", { description: `Se removió "${tagName}" del chat` });
      refreshChats();
    } catch (err: any) {
      // Revertir en caso de error
      if (activeChat?.chatId === chatId) {
        const currentTags = activeChat.tags || [];
        if (!currentTags.includes(tagName)) {
          setActiveChat({ ...activeChat, tags: [...currentTags, tagName] });
        }
      }
      toast.error("No se pudo remover la tag", { description: err.message || "Error inesperado" });
    }
  };

  const handleChatSelect = (chat: Chat) => {
    setActiveChat(chat);
    if (isMobile) setShowMobileChatList(false);
  };

  const handleDownloadFile = async (url: string, fileName?: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName || "descarga";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      toast.error("No se pudo descargar el archivo");
    }
  };

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (selectedFile) {
      void handleSendFileMessage();
      return;
    }
    if (!newMessage.trim()) return;
    const content = newMessage;
    try {
      await sendMessage(content);
      setNewMessage("");
    } catch {
      toast.error("No se pudo enviar el mensaje");
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      toast.error("Archivo demasiado grande", { description: "El tamano maximo es 100MB" });
      return;
    }
    setSelectedFile(file);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (loadEvent) => setFilePreview(loadEvent.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (let index = 0; index < items.length; index += 1) {
      if (items[index].kind !== "file") continue;
      const file = items[index].getAsFile();
      if (!file) continue;
      if (file.size > 100 * 1024 * 1024) {
        toast.error("Archivo demasiado grande", { description: "El tamano maximo es 100MB" });
        return;
      }
      let finalFile = file;
      if (file.type.startsWith("image/")) {
        const extension = file.type.split("/")[1] || "png";
        finalFile = new File([file], `Imagen_Pegada_${Date.now()}.${extension}`, { type: file.type });
      }
      setSelectedFile(finalFile);
      if (finalFile.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (loadEvent) => setFilePreview(loadEvent.target?.result as string);
        reader.readAsDataURL(finalFile);
      } else {
        setFilePreview(null);
      }
      event.preventDefault();
      break;
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSendFileMessage = async () => {
    if (!selectedFile) return;
    try {
      setIsSendingFile(true);
      await sendMediaMessage(selectedFile, newMessage.trim() || undefined);
      setNewMessage("");
      handleRemoveFile();
      toast.success("Archivo enviado");
    } catch {
      toast.error("No se pudo enviar el archivo");
    } finally {
      setIsSendingFile(false);
    }
  };

  const sortedChats = useMemo(() => {
    return [...chats].sort((a, b) => {
      if (!a.lastMessageTimestamp && !b.lastMessageTimestamp) return 0;
      if (!a.lastMessageTimestamp) return 1;
      if (!b.lastMessageTimestamp) return -1;
      return new Date(b.lastMessageTimestamp).getTime() - new Date(a.lastMessageTimestamp).getTime();
    });
  }, [chats]);

  const scopedChats = sortedChats;

  const availableTags = useMemo(() => {
    const tagMap = new Map<string, string>();
    scopedChats.forEach((chat) => {
      chat.tags?.forEach((tagName) => {
        const tag = tagService.getTag(tagName);
        const normalizedTagName = normalizeChatTagName(tagName);
        const displayName = isAttentionTag(tagName) ? ATTENTION_TAG_NAME : tag?.name || tagName.trim();
        if (displayName && !tagMap.has(normalizedTagName)) {
          tagMap.set(normalizedTagName, tag?.color || "#6B7280");
        }
      });
    });
    return Array.from(tagMap.entries()).map(([normalizedName, color]) => ({
      name: normalizedName === normalizeChatTagName(ATTENTION_TAG_NAME) ? ATTENTION_TAG_NAME : scopedChats.flatMap((chat) => chat.tags || []).find((tagName) => normalizeChatTagName(tagName) === normalizedName)?.trim() || normalizedName,
      color
    }));
  }, [scopedChats, tagService.tags]);

  const filteredChats = useMemo(() => {
    if (!selectedTagFilter) return scopedChats;
    const normalizedSelectedTag = normalizeChatTagName(selectedTagFilter);
    return scopedChats.filter((chat) => chat.tags?.some((tagName) => normalizeChatTagName(tagName) === normalizedSelectedTag));
  }, [scopedChats, selectedTagFilter]);

  const displayChats = useMemo(() => isSearchActive ? searchResults : filteredChats, [filteredChats, isSearchActive, searchResults]);

  const messageGroups = useMemo(() => groupMessagesByDate(messages), [messages]);

  const scrollMessagesToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    window.setTimeout(() => {
      container.scrollTop = container.scrollHeight;
    }, 0);
  }, []);

  useEffect(() => {
    if (!activeChat) return;
    scrollMessagesToBottom();
  }, [activeChat, messages, scrollMessagesToBottom, showMobileChatList]);

  const handleScroll = () => {
    const target = listRef.current;
    if (!target || !hasMore || isLoadingMore) return;
    const { scrollTop, scrollHeight, clientHeight } = target;
    if (scrollTop + clientHeight >= scrollHeight - 200) {
      loadMoreChats();
    }
  };

  const handleDeleteChat = async () => {
    if (!deleteChatDialog.chatId) return;
    try {
      await deleteChat(deleteChatDialog.chatId);
      toast.success("Chat eliminado");
    } catch (err: any) {
      toast.error("No se pudo eliminar el chat", { description: err.response?.data?.message || "Error inesperado" });
    } finally {
      setDeleteChatDialog({ open: false, chatId: "" });
    }
  };

  const handleDeleteMessage = async () => {
    if (!deleteMessageDialog.messageId) return;
    try {
      await deleteMessage(deleteMessageDialog.messageId);
      toast.success("Mensaje eliminado");
    } catch (err: any) {
      toast.error("No se pudo eliminar el mensaje", { description: err.response?.data?.message || "Error inesperado" });
    } finally {
      setDeleteMessageDialog({ open: false, messageId: "" });
    }
  };

  return (
    <div className="chat-dashboard h-[78vh] min-h-[420px] overflow-hidden rounded-[28px] border border-[#E9DED3] bg-[linear-gradient(180deg,#FFFCF9_0%,#F8F4EE_100%)] xl:h-full xl:min-h-0 xl:rounded-[22px]">
      <Toaster position="top-right" richColors />
      <div className="flex h-full min-h-[420px] flex-col xl:min-h-0 xl:flex-row">
        <section className={`chat-inbox ${isMobile && !showMobileChatList ? "hidden" : "flex"} w-full shrink-0 flex-col border-b border-brand-line bg-[#FBF7F2] xl:w-[280px] xl:border-b-0 xl:border-r 2xl:w-[320px]`}>
          <div className="chat-inbox-header border-b border-brand-line px-5 py-4 xl:px-4 xl:py-3">
            <div className="flex items-center justify-between gap-3 xl:gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-orange">Inbox operativo</p>
                <h2 className="mt-1 text-xl font-semibold text-brand-ink xl:text-lg">Conversaciones</h2>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setIsExportModalOpen(true)} className="rounded-full border border-[#E6D8CB] bg-[#FFF9F4] p-2 text-neutral-500 transition hover:border-[#D9C1AF] hover:bg-white hover:text-brand-ink" title="Exportar chats">
                  <Download className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setIsTagManagerOpen(true)} className="rounded-full border border-[#E6D8CB] bg-[#FFF9F4] p-2 text-neutral-500 transition hover:border-[#D9C1AF] hover:bg-white hover:text-brand-ink" title="Configurar tags">
                  <Tag className="h-4 w-4" />
                </button>
                <button type="button" onClick={refreshChats} disabled={isLoading} className="rounded-full border border-[#E6D8CB] bg-[#FFF9F4] p-2 text-neutral-500 transition hover:border-[#D9C1AF] hover:bg-white hover:text-brand-ink disabled:opacity-50" title="Actualizar chats">
                  <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>
          </div>

          <ChatSearchBar onSearch={searchChats} onClear={clearSearch} isSearching={isSearching} />
          <ChatTagFilter
            availableTags={availableTags}
            selectedTag={selectedTagFilter}
            onTagSelect={setSelectedTagFilter}
            chatCount={selectedTagFilter ? filteredChats.length : undefined}
          />

          <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
            {error ? <div className="m-4 rounded-2xl border border-[#F0C7B2] bg-[#FFF1EA] px-4 py-3 text-sm text-[#B65221]">{error}</div> : null}
            {searchHint ? <div className="m-4 rounded-2xl border border-[#D8E5F2] bg-[#F3F8FC] px-4 py-3 text-sm text-[#31546E]">{searchHint}</div> : null}
            {isSearchActive ? (
              <div className="border-b border-brand-line bg-[#F5FAFF] px-4 py-2 text-sm text-[#31546E]">
                {isSearching ? "Buscando..." : `${displayChats.length} resultado${displayChats.length !== 1 ? "s" : ""}`}
              </div>
            ) : null}

            {isLoading && chats.length === 0 ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-brand-orange" />
              </div>
            ) : (
              displayChats.map((chat) => (
                <div
                  key={chat.chatId}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleChatSelect(chat)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleChatSelect(chat);
                    }
                  }}
                  className={`chat-row group block w-full border-b border-[rgba(213,200,188,0.7)] px-4 py-4 text-left transition hover:bg-[#FFF8F1] xl:px-3 xl:py-3 ${activeChat?.chatId === chat.chatId ? "bg-[#FFF1E6]" : "bg-transparent"}`}
                >
                  <div className="flex items-start gap-3 xl:gap-2">
                    <div className="chat-contact-avatar flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F2ECE5] text-sm font-semibold text-brand-ink xl:h-10 xl:w-10 xl:rounded-xl xl:text-xs">
                      {getAvatarText(chat)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="chat-contact-name truncate text-sm font-semibold text-brand-ink xl:text-[13px]">{chat.contactName || chat.phoneNumber}</p>
                          <div className="chat-contact-phone mt-1 inline-flex items-center gap-1 text-xs text-neutral-500 xl:mt-0.5 xl:text-[11px]">
                            <Phone className="h-3 w-3" />
                            {chat.phoneNumber}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="chat-contact-time text-xs text-neutral-400 xl:text-[11px]">{formatChatDate(chat.lastMessageTimestamp)}</span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeleteChatDialog({ open: true, chatId: chat.chatId });
                            }}
                            className="rounded-full p-1 text-neutral-300 opacity-0 transition group-hover:opacity-100 hover:text-[#B65221]"
                            title="Eliminar chat"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <p className="chat-contact-preview mt-2 truncate text-sm text-neutral-500 xl:mt-1 xl:text-[13px]">{chat.lastMessage || "Sin mensajes recientes"}</p>
                      <div className="chat-row-metadata mt-3 flex flex-wrap items-center gap-2 xl:mt-2 xl:gap-1.5">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] xl:px-2 xl:py-0.5 xl:text-[10px] ${
                            chat.chatStatus === "bot" ? "bg-[#E8F4EC] text-[#2E6A46]" : "bg-[#FFF1EA] text-[#B65221]"
                          }`}
                        >
                          {chat.chatStatus === "bot" ? "Bot" : "Humano"}
                        </span>
                        {chat.assignedAdvisorName ? (
                          <span className="rounded-full bg-[#F2ECE5] px-2.5 py-1 text-[11px] font-medium text-brand-ink xl:px-2 xl:py-0.5 xl:text-[10px]">
                            {chat.assignedAdvisorName}
                          </span>
                        ) : null}
                        {chat.unreadCount > 0 ? (
                          <span className="rounded-full bg-brand-orange px-2.5 py-1 text-[11px] font-semibold text-white xl:px-2 xl:py-0.5 xl:text-[10px]">{chat.unreadCount}</span>
                        ) : null}
                      </div>
                      {chat.tags?.length ? (
                        <div className="chat-row-tags mt-3 flex flex-wrap gap-2 xl:mt-2 xl:gap-1.5">
                          {chat.tags.slice(0, 3).map((tagName) => {
                            const tag = tagService.getTag(tagName);
                            return <ChatTagBadge key={tagName} name={tagName} color={tag?.color || "#6B7280"} size="sm" />;
                          })}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
            {isLoadingMore ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-5 w-5 animate-spin text-brand-orange" />
              </div>
            ) : null}
          </div>
        </section>

        <section className={`${isMobile && showMobileChatList ? "hidden" : "flex"} min-w-0 flex-1 flex-col`}>
          {activeChat ? (
            <>
              <header className="chat-conversation-header relative z-10 border-b border-brand-line bg-[rgba(255,252,249,0.76)] px-4 py-4 backdrop-blur md:px-6 xl:px-4 xl:py-3">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between xl:gap-3">
                  <div className="flex min-w-0 items-start gap-3 xl:gap-2">
                    {isMobile ? (
                      <button
                        type="button"
                        onClick={() => setShowMobileChatList(true)}
                        className="mt-1 rounded-full border border-[#E6D8CB] bg-[#FFF9F4] p-2 text-brand-ink"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                    ) : null}
                    <div className="chat-active-avatar flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F2ECE5] text-sm font-semibold text-brand-ink xl:h-10 xl:w-10 xl:rounded-xl xl:text-xs">
                      {getAvatarText(activeChat)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="chat-active-name truncate text-lg font-semibold text-brand-ink xl:text-base">{activeChat.contactName || activeChat.phoneNumber}</h3>
                        <span
                          className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] xl:px-2.5 xl:py-0.5 xl:text-[10px] ${
                            activeChat.chatStatus === "bot" ? "bg-[#E8F4EC] text-[#2E6A46]" : "bg-[#FFF1EA] text-[#B65221]"
                          }`}
                        >
                          {activeChat.chatStatus === "bot" ? "Modo bot" : "Modo humano"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-neutral-500 xl:mt-0.5 xl:text-[13px]">{activeChat.phoneNumber}</p>
                      <div className="mt-3 flex flex-wrap gap-2 xl:mt-2 xl:gap-1.5">
                        {activeChat.tags?.map((tagName) => {
                          const tag = tagService.getTag(tagName);
                          return (
                            <ChatTagBadge
                              key={tagName}
                              name={tagName}
                              color={tag?.color || "#6B7280"}
                              size="sm"
                              onRemove={() => void handleRemoveTag(activeChat.chatId, tagName)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>

                    <div className="flex flex-col gap-3 xl:items-end xl:gap-2">
                      <div className="flex flex-wrap gap-2 xl:gap-1.5">
                        <ChatTagSelector
                          availableTags={tagService.tags}
                          selectedTags={activeChat.tags || []}
                        onTagAdd={(tagName) => void handleAddTag(activeChat.chatId, tagName)}
                          onTagRemove={(tagName) => void handleRemoveTag(activeChat.chatId, tagName)}
                          onCreateTag={() => setIsTagManagerOpen(true)}
                          disabled={false}
                        />
                      </div>

                    <div className="flex flex-wrap items-center gap-3 xl:gap-2">
                      {activeChat.statusChangeTime && activeChat.chatStatus === "human" ? (
                        <div className="inline-flex items-center gap-2 rounded-full bg-[#FFF7F2] px-3 py-2 text-sm xl:px-2.5 xl:py-1.5 xl:text-[13px]">
                          <AlertTriangle className="h-4 w-4 text-[#B65221]" />
                          <ChatTimer statusChangeTime={activeChat.statusChangeTime} onExpire={() => toggleChatMode(activeChat.chatId)} />
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => toggleChatMode(activeChat.chatId)}
                        className={`rounded-full px-4 py-2 text-sm font-medium xl:px-3 xl:py-1.5 xl:text-[13px] ${
                          activeChat.chatStatus === "bot" ? "bg-[#E8F4EC] text-[#2E6A46]" : "bg-[#FFF1EA] text-[#B65221]"
                        }`}
                      >
                        {activeChat.chatStatus === "bot" ? (
                          <span className="inline-flex items-center gap-2">
                            <Bot className="h-4 w-4" />
                            Modo bot
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <User className="h-4 w-4" />
                            Devolver al bot
                          </span>
                        )}
                      </button>
                      {activeChat.chatStatus === "bot" ? (
                        <button type="button" onClick={() => takeChatControl(activeChat.chatId)} className="rounded-full bg-brand-orange px-4 py-2 text-sm font-medium text-white xl:px-3 xl:py-1.5 xl:text-[13px]">
                          Tomar control
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </header>

              <div ref={messagesContainerRef} className="chat-messages flex-1 overflow-y-auto bg-[linear-gradient(180deg,#FFFCFA_0%,#F7F1E9_100%)] px-4 py-5 md:px-6 xl:px-4 xl:py-4">
                {Object.keys(messageGroups)
                  .sort()
                  .map((dateKey) => (
                    <div key={dateKey} className="mb-6 xl:mb-4">
                      <div className="mb-4 flex justify-center xl:mb-3">
                        <span className="rounded-full border border-brand-line bg-white px-3 py-1 text-xs text-neutral-500">
                          {formatMessageDate(messageGroups[dateKey][0]?.timestamp)}
                        </span>
                      </div>
                      <div className="space-y-3 xl:space-y-2">
                        {messageGroups[dateKey].map((message, messageIndex) => {
                          const messageId = message.id || message._id || "";
                          const renderKey = `${messageId || `${message.chatId}-${message.sender}-${message.timestamp}`}-${messageIndex}`;
                          const mediaProxyUrl = messageId ? chatService.getMediaUrl(messageId) : "";
                          const token = typeof window !== "undefined" ? window.localStorage.getItem("auth_token") : null;
                          const mediaUrlWithAuth = mediaProxyUrl && token ? `${mediaProxyUrl}?token=${token}` : mediaProxyUrl;
                          const messageAuthorLabel = getMessageAuthorLabel(message);

                          return (
                            <div key={renderKey} className={`flex ${message.sender === "bot" ? "justify-end" : "justify-start"}`}>
                              <div
                                className={`chat-message-bubble group relative max-w-[82%] rounded-[24px] px-4 py-3 shadow-sm md:max-w-[70%] xl:rounded-[20px] xl:px-3 xl:py-2.5 ${
                                  message.sender === "user" ? "bg-white text-brand-ink" : "bg-brand-orange text-white"
                                }`}
                              >
                                {message.mediaType && message.mediaUrl ? (
                                  <div className="mb-2">
                                    {message.mediaType === "image" ? (
                                      <div className="relative">
                                        <img
                                          src={mediaUrlWithAuth}
                                          alt=""
                                          className="max-h-[320px] max-w-full rounded-2xl object-contain"
                                          onClick={() => setLightboxImage({ url: mediaUrlWithAuth, fileName: message.fileName || undefined })}
                                        />
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            void handleDownloadFile(mediaUrlWithAuth, message.fileName || "imagen");
                                          }}
                                          className="absolute right-2 top-2 rounded-full bg-black/40 p-1.5 text-white"
                                        >
                                          <Download className="h-4 w-4" />
                                        </button>
                                      </div>
                                    ) : null}
                                    {message.mediaType === "video" ? (
                                      <video controls className="max-h-[320px] max-w-full rounded-2xl">
                                        <source src={mediaUrlWithAuth} />
                                      </video>
                                    ) : null}
                                    {message.mediaType === "audio" ? (
                                      <audio controls className="w-full min-w-[220px]">
                                        <source src={mediaUrlWithAuth} />
                                      </audio>
                                    ) : null}
                                    {message.mediaType === "document" ? (
                                      <a
                                        href={mediaUrlWithAuth}
                                        target="_blank"
                                        rel="noreferrer"
                                    className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm ${
                                          message.sender === "user" ? "bg-[#F3ECE5] text-brand-ink" : "bg-[#D96B2C] text-white"
                                        }`}
                                      >
                                        <FileIcon className="h-4 w-4 shrink-0" />
                                        <span className="truncate">{message.fileName || "Documento"}</span>
                                        <Download className="ml-auto h-4 w-4 shrink-0" />
                                      </a>
                                    ) : null}
                                  </div>
                                ) : null}
                                {message.content && !message.mediaUrl ? <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p> : null}
                                {message.content &&
                                message.mediaUrl &&
                                !["Imagen", "imagen", "Image", "image", "Audio", "audio", "Video", "video", "Documento", "documento"].includes(
                                  message.content.trim()
                                ) &&
                                !message.content.startsWith("?? ") ? (
                                  <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                                ) : null}
                                <div className="mt-2 flex items-center justify-between gap-4 xl:mt-1.5">
                                  <span className={`text-xs ${message.sender === "user" ? "text-neutral-400" : "text-white/75"}`}>
                                    {formatTime(message.timestamp)}
                                    {messageAuthorLabel ? ` · ${messageAuthorLabel}` : ""}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setDeleteMessageDialog({ open: true, messageId });
                                    }}
                                    className={`rounded-full p-1 opacity-0 transition group-hover:opacity-100 ${
                                      message.sender === "user" ? "text-neutral-400 hover:text-[#B65221]" : "text-white/70 hover:text-white"
                                    }`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>

              <div className="chat-composer border-t border-brand-line bg-[rgba(255,252,249,0.82)] px-4 py-4 backdrop-blur md:px-6 xl:px-4 xl:py-3">
                {selectedFile ? (
                  <div className="mb-3 flex items-center gap-3 rounded-[20px] border border-[#E7DBCF] bg-[#F6EFE8] px-4 py-3">
                    {filePreview ? (
                      <img src={filePreview} alt="Preview" className="h-12 w-12 rounded-xl object-cover" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FFFDFC] text-neutral-500">
                        {getMediaTypeIcon(
                          selectedFile.type.startsWith("image/")
                            ? "image"
                            : selectedFile.type.startsWith("video/")
                              ? "video"
                              : selectedFile.type.startsWith("audio/")
                                ? "audio"
                                : "document"
                        )}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-brand-ink">{selectedFile.name}</p>
                      <p className="text-xs text-neutral-500">
                        {getFileTypeLabel(selectedFile)} · {(selectedFile.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    <button type="button" onClick={handleRemoveFile} className="rounded-full p-1 text-neutral-400 transition hover:text-brand-ink">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                ) : null}

                {activeChat.chatStatus === "human" ? (
                  <form onSubmit={handleSendMessage} className="flex items-center gap-3 xl:gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      className="hidden"
                      accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,.rar"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-full border border-[#E6D8CB] bg-[#FFF9F4] p-3 text-neutral-500 transition hover:border-[#D9C1AF] hover:bg-white hover:text-brand-ink xl:p-2.5"
                      title="Adjuntar archivo"
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(event) => setNewMessage(event.target.value)}
                      onPaste={handlePaste}
                      placeholder={selectedFile ? "Anadir mensaje opcional..." : "Escribir mensaje..."}
                      className="min-w-0 flex-1 rounded-full border border-transparent bg-[#F4EEE7] px-5 py-3 text-sm text-brand-ink outline-none transition focus:border-[#E9D2C1] focus:bg-white focus:shadow-[0_0_0_4px_rgba(255,90,0,0.08)] xl:px-4 xl:py-2.5"
                    />
                    <button
                      type="submit"
                      disabled={(!newMessage.trim() && !selectedFile) || isSendingFile}
                      className="rounded-full bg-brand-orange p-3 text-white disabled:opacity-60 xl:p-2.5"
                    >
                      {isSendingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-3 xl:gap-2">
                    <input
                      type="text"
                      disabled
                      value="Chat en modo automatico. Toma control para enviar mensajes."
                      className="flex-1 rounded-full border border-transparent bg-[#EFE7DE] px-5 py-3 text-sm text-neutral-400 xl:px-4 xl:py-2.5"
                    />
                    <button type="button" disabled className="rounded-full bg-neutral-300 p-3 text-white xl:p-2.5">
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="chat-empty-state flex flex-1 items-center justify-center bg-[radial-gradient(circle_at_top,#FFF1E6,transparent_48%),linear-gradient(180deg,#FFFCFA_0%,#F7F1E9_100%)]">
              <div className="chat-empty-content max-w-sm text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FFF8F2] shadow-[0_10px_28px_rgba(31,31,33,0.06)]">
                  {isSearching ? <Search className="h-8 w-8 text-neutral-400" /> : <MoreHorizontal className="h-8 w-8 text-neutral-400" />}
                </div>
                <p className="mt-5 text-xl font-semibold text-brand-ink">
                  {isSearching ? "Selecciona un resultado" : "Selecciona una conversacion"}
                </p>
                <p className="mt-2 text-sm leading-7 text-neutral-500">
                  Elige un chat de la lista para ver mensajes, tomar control, etiquetar o exportar su historial.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      <ChatTagManagerModal
        open={isTagManagerOpen}
        onClose={() => setIsTagManagerOpen(false)}
        tags={tagService.tags}
        readOnly={false}
        onCreateTag={async (name, color) => {
          await tagService.createTag(name, color);
          toast.success("Tag creada", { description: `Se creo "${name}"` });
        }}
        onDeleteTag={async (tagName) => {
          await tagService.deleteTag(tagName);
          toast.success("Tag eliminada", { description: `Se elimino "${tagName}"` });
          refreshChats();
        }}
        onUpdateTagColor={async (tagName, color) => {
          await tagService.updateTag(tagName, color);
          toast.success("Color actualizado", { description: `Se actualizo "${tagName}"` });
          refreshChats();
        }}
      />

      <ChatExportModal open={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} />

      {lightboxImage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6" onClick={() => setLightboxImage(null)}>
          <button type="button" onClick={() => setLightboxImage(null)} className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20">
            <X className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void handleDownloadFile(lightboxImage.url, lightboxImage.fileName || "imagen");
            }}
            className="absolute right-20 top-5 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
          >
            <Download className="h-6 w-6" />
          </button>
          <img src={lightboxImage.url} alt="" className="max-h-[90vh] max-w-[90vw] rounded-[28px] object-contain" onClick={(event) => event.stopPropagation()} />
        </div>
      ) : null}

      <ConfirmDialog
        open={deleteChatDialog.open}
        title="Eliminar chat"
        description="Se va a eliminar el chat completo y todos sus mensajes. Esta accion no se puede deshacer."
        confirmLabel="Eliminar"
        tone="danger"
        onCancel={() => setDeleteChatDialog({ open: false, chatId: "" })}
        onConfirm={() => void handleDeleteChat()}
      />

      <ConfirmDialog
        open={deleteMessageDialog.open}
        title="Eliminar mensaje"
        description="Se va a eliminar este mensaje del historial. Esta accion no se puede deshacer."
        confirmLabel="Eliminar"
        tone="danger"
        onCancel={() => setDeleteMessageDialog({ open: false, messageId: "" })}
        onConfirm={() => void handleDeleteMessage()}
      />
    </div>
  );
}
