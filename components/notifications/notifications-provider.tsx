"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "../workspace-provider";

export type OrderNotification = {
  id: string; type: "chat_order"; status: "pending" | "attended";
  chatId: string; channelId: string; contactName: string | null; contactPhone: string;
  orderMode: "delivery" | "takeaway" | "unknown"; summary: string; occurredAt: string;
  readAt: string | null; attendedAt: string | null; attendedBy: { fullName: string } | null;
};
type NotificationList = { items: OrderNotification[]; total: number; page: number; pageSize: number };
type Value = {
  enabled: boolean; unread: number; pending: number; error: string | null; revision: number;
  refresh: () => Promise<void>;
  list: (query: string, signal?: AbortSignal) => Promise<NotificationList>;
  read: (id: string) => Promise<void>; attend: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
};
const Context = createContext<Value | null>(null);
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/v1";

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, token } = useWorkspace();
  const enabled = currentUser?.scope === "restaurant" && ["restaurant_owner", "restaurant_manager", "host"].includes(currentUser.role);
  const [counts, setCounts] = useState({ unread: 0, pending: 0 });
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);

  const request = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${API_URL}/restaurant/notifications${path}`, {
      ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers }, cache: "no-store"
    });
    if (!response.ok) throw new Error(response.status === 401 ? "Tu sesión de Foodie venció. Volvé a ingresar." : response.status === 403 ? "No tenés permiso para acceder a estas notificaciones." : response.status === 409 ? "Primero marcá la notificación como atendida para eliminarla." : "No pudimos actualizar las notificaciones. Intentá nuevamente.");
    return response.json();
  }, [token]);

  const refresh = useCallback(async () => {
    if (!enabled || !token) return;
    const current = generation.current;
    try {
      const next = await request<{ unread: number; pending: number }>("/counts");
      if (current !== generation.current) return;
      setCounts(next); setError(null); setRevision((value) => value + 1);
    } catch (err) {
      if (current === generation.current) setError(err instanceof Error ? err.message : "No pudimos actualizar las notificaciones");
    }
  }, [enabled, token, request]);

  useEffect(() => {
    generation.current += 1;
    setCounts({ unread: 0, pending: 0 }); setError(null);
    if (!enabled || !token) return;
    let busy = false;
    const tick = async () => {
      if (document.visibilityState === "hidden" || busy) return;
      busy = true; await refresh(); busy = false;
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 10000);
    window.addEventListener("focus", tick); document.addEventListener("visibilitychange", tick);
    return () => {
      generation.current += 1;
      window.clearInterval(timer); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick);
    };
  }, [enabled, token, currentUser?.sub, refresh]);

  const list = useCallback((query: string, signal?: AbortSignal) => request<NotificationList>(`?${query}`, { signal }), [request]);
  const read = useCallback(async (id: string) => { await request(`/${encodeURIComponent(id)}/read`, { method: "POST" }); await refresh(); }, [request, refresh]);
  const attend = useCallback(async (id: string) => { await request(`/${encodeURIComponent(id)}/attend`, { method: "POST" }); await refresh(); }, [request, refresh]);
  const remove = useCallback(async (id: string) => { await request(`/${encodeURIComponent(id)}`, { method: "DELETE" }); await refresh(); }, [request, refresh]);
  const value = useMemo(() => ({ enabled, ...counts, error, revision, refresh, list, read, attend, remove }), [enabled, counts, error, revision, refresh, list, read, attend, remove]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useNotifications() {
  const context = useContext(Context);
  if (!context) throw new Error("NotificationsProvider requerido");
  return context;
}
