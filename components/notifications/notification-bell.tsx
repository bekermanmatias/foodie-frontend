"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useNotifications } from "./notifications-provider";

export function NotificationPendingDot({ className = "" }: { className?: string }) {
  const { enabled, pending } = useNotifications();
  if (!enabled || pending <= 0) return null;
  return (
    <span className={`inline-flex shrink-0 items-center ${className}`} title={`${pending} pendientes de atención`}>
      <span className="h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-white" aria-hidden="true" />
      <span className="sr-only">{pending} notificaciones pendientes de atención</span>
    </span>
  );
}

export function NotificationBell() {
  const { enabled, unread, pending, error } = useNotifications();
  if (!enabled) return null;
  return <Link href="/notificaciones" aria-label={`Notificaciones: ${unread} sin leer, ${pending} pendientes${error ? ". No se pudo actualizar" : ""}`}
    title={error || `${pending} pendientes de atención`}
    className="relative inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-brand-orange/30 bg-white px-3 text-brand-orange hover:bg-orange-50">
    <span className="relative" aria-hidden="true">
      <Bell className="h-5 w-5" />
      <NotificationPendingDot className="absolute -right-1 -top-1" />
    </span>
    <span className="text-xs font-bold" aria-live="polite">{unread > 99 ? "99+" : unread}</span>
    {error ? <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" /> : null}
  </Link>;
}
