"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceShell } from "../workspace-shell";
import { ConfirmDialog } from "../confirm-dialog";
import { useNotifications, type OrderNotification } from "./notifications-provider";

const modes = { delivery: "Delivery", takeaway: "Takeaway", unknown: "Modalidad por definir" };
const date = (value: string) => new Date(value).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" });

export function NotificationsPage() {
  const { enabled, list, read, attend, remove, revision, refresh, error: connectionError } = useNotifications();
  const router = useRouter();
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<OrderNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OrderNotification | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void list(new URLSearchParams({ ...(status ? { status } : {}), page: String(page), pageSize: "25" }).toString(), controller.signal)
      .then((result) => {
        const lastPage = Math.max(1, Math.ceil(result.total / 25));
        if (page > lastPage) { setPage(lastPage); return; }
        setItems(result.items); setTotal(result.total); setError(null); setLoaded(true);
      })
      .catch((err) => { if (!controller.signal.aborted) { setError(err.message); setLoaded(true); } });
    return () => controller.abort();
  }, [enabled, list, page, status, revision]);

  async function action(item: OrderNotification, kind: "read" | "attend" | "chat" | "delete") {
    setBusy(item.id); setError(null);
    try {
      if (kind === "delete") {
        await remove(item.id);
        setItems((current) => current.filter((notification) => notification.id !== item.id));
      }
      else if (kind === "attend") await attend(item.id);
      else await read(item.id);
      if (kind === "chat") router.push(`/chat?chatId=${encodeURIComponent(item.chatId)}`);
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo completar la acción"); }
    finally { setBusy(null); }
  }

  return <WorkspaceShell title="Notificaciones" description="Pedidos por WhatsApp pendientes de atención. Abrir un chat no marca el pedido como atendido.">
    {!enabled ? <p>No tenés acceso a las notificaciones.</p> : <>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold">Mostrar <select className="ml-2 rounded-xl border border-brand-line bg-white p-2" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); setLoaded(false); setItems([]); }}>
          <option value="pending">Pendientes</option><option value="attended">Atendidas</option><option value="">Todas</option>
        </select></label>
        <button className="rounded-full border border-brand-line px-4 py-2 text-sm" onClick={() => void refresh()}>Actualizar</button>
        <span className="text-sm text-neutral-500">{total} notificaciones</span>
      </div>
      {error || connectionError ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error || connectionError}</p> : null}
      {!loaded ? <p role="status">Cargando notificaciones…</p> : items.length === 0 ? <p className="rounded-2xl bg-orange-50 p-6">No hay notificaciones en esta vista.</p> : null}
      <div className="grid gap-3">{items.map((item) => <article key={item.id} className={`min-w-0 rounded-2xl border p-4 sm:p-5 ${item.readAt ? "border-brand-line bg-white" : "border-brand-orange/40 bg-orange-50/60"}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><p className="font-bold text-brand-ink">{item.contactName || item.contactPhone} {!item.readAt ? <span className="ml-2 text-xs text-brand-orange">Sin leer</span> : null}</p>
            <p className="mt-1 text-sm text-neutral-500">{item.contactPhone} · {modes[item.orderMode]}</p></div>
          <time className="text-xs text-neutral-500" dateTime={item.occurredAt}>{date(item.occurredAt)}</time>
        </div>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{item.summary}</p>
        <p className="mt-2 text-xs text-neutral-500">{item.status === "pending" ? "Pendiente de atención" : `Atendida por ${item.attendedBy?.fullName || "el equipo"}${item.attendedAt ? ` · ${date(item.attendedAt)}` : ""}`}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button disabled={busy !== null} className="rounded-full bg-brand-orange px-4 py-2 text-sm font-bold text-white disabled:opacity-50" onClick={() => void action(item, "chat")}>Abrir chat</button>
          {!item.readAt ? <button disabled={busy !== null} className="rounded-full border border-brand-line px-4 py-2 text-sm disabled:opacity-50" onClick={() => void action(item, "read")}>Marcar leída</button> : null}
          {item.status === "pending" ? <button disabled={busy !== null} className="rounded-full border border-brand-line px-4 py-2 text-sm disabled:opacity-50" onClick={() => void action(item, "attend")}>Marcar atendida</button> : null}
          {item.status === "attended" ? <button disabled={busy !== null} className="rounded-full border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50" onClick={() => setDeleteTarget(item)}>Eliminar</button> : null}
        </div>
      </article>)}</div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <button disabled={page <= 1} className="rounded-full border px-4 py-2 disabled:opacity-40" onClick={() => setPage((value) => value - 1)}>Anterior</button>
        <span>Página {page} de {Math.max(1, Math.ceil(total / 25))}</span>
        <button disabled={page * 25 >= total} className="rounded-full border px-4 py-2 disabled:opacity-40" onClick={() => setPage((value) => value + 1)}>Siguiente</button>
      </div>
    </>}
    <ConfirmDialog open={deleteTarget !== null} title="Eliminar notificación" description="Esta notificación atendida se eliminará de la bandeja para todo el equipo. La conversación seguirá disponible en Chat."
      confirmLabel="Eliminar" tone="danger" confirmDisabled={busy !== null}
      onCancel={() => setDeleteTarget(null)} onConfirm={() => { if (deleteTarget && !busy) { void action(deleteTarget, "delete"); setDeleteTarget(null); } }}>
      <p className="text-sm text-neutral-600">¿Querés eliminar la notificación de {deleteTarget?.contactName || deleteTarget?.contactPhone}?</p>
    </ConfirmDialog>
  </WorkspaceShell>;
}
