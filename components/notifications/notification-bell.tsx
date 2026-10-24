"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useNotifications } from "./notifications-provider";

export function NotificationBell() {
  const { enabled, unread, pending, error } = useNotifications();
  if (!enabled) return null;
  return <Link href="/notificaciones" aria-label={`Notificaciones: ${unread} sin leer, ${pending} pendientes${error ? ". No se pudo actualizar" : ""}`}
    title={error || `${pending} pendientes de atención`}
    className="relative inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-brand-orange/30 bg-white px-3 text-brand-orange hover:bg-orange-50">
    <Bell className="h-5 w-5" aria-hidden="true" />
    <span className="text-xs font-bold" aria-live="polite">{unread > 99 ? "99+" : unread}</span>
    {error ? <span className="h-2 w-2 rounded-full bg-red-600" /> : null}
  </Link>;
}
