"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useChat } from "./chat-context";

export function ChatDeepLink() {
  const params = useSearchParams();
  const chatId = params.get("chatId") || "";
  const { openChatById } = useChat();
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    if (!chatId) return;
    const controller = new AbortController();
    setLoading(true); setError(null);
    void openChatById(chatId, controller.signal).catch((err) => {
      if (!controller.signal.aborted) setError(err.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [chatId, attempt, openChatById]);
  if (!chatId) return null;
  if (error) return <div role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error} La notificación sigue pendiente de atención.
    <button onClick={retry} className="ml-2 font-bold underline">Reintentar</button></div>;
  return loading ? <p role="status" className="mb-2 text-sm text-neutral-500">Abriendo conversación…</p> : null;
}
