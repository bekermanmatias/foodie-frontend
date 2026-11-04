"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "../workspace-provider";
import { moduleEnabled } from "../../lib/restaurant-features";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/v1";
type Proof = { id: string; originalName: string; receivedAt: string; reviewStatus: string; rejectionReason?: string; driveStatus: string; driveError?: string; driveFileUrl?: string };
type Deposit = { id: string; requiredAmount: string; paidAmount: string; currency: string; status: string; dueAt?: string; confirmationAt?: string; reservation: { id: string; code: string; fullName: string; phone: string; serviceDate: string; serviceTime: string; status: string }; entries: Array<{ id: string; type: string; amount: string; reference?: string; notes?: string; paidAt: string }>; proofRequests: Array<{ id: string; proofs: Proof[] }> };
type Reservation = { id: string; code: string; fullName: string; serviceDate: string; deposit?: unknown };
const money = (value: string | number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Number(value));
export function useDepositApi() {
  const { token } = useWorkspace();
  return useCallback(async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
    const response = await fetch(`${API_URL}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers }, cache: "no-store" });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string; issues?: Array<{ message: string }> } | null;
      throw new Error(body?.issues?.map((issue) => issue.message).join(" · ") || body?.message || "No se pudo completar la operación");
    }
    return response.json() as Promise<T>;
  }, [token]);
}

export function DepositsPanel({ phone, compact = false, expanded }: { phone?: string; compact?: boolean; expanded?: boolean }) {
  const { bootstrap, currentUser, token } = useWorkspace();
  const enabled = (!compact || Boolean(phone)) && moduleEnabled(bootstrap, "deposits") && Boolean(currentUser && ["restaurant_owner", "restaurant_manager", "cashier"].includes(currentUser.role));
  const api = useDepositApi();
  const [rows, setRows] = useState<Deposit[]>([]); const [reservations, setReservations] = useState<Reservation[]>([]);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ branchId: "", status: "", review: "", from: "", to: "", expired: "" });
  const [search, setSearch] = useState(""); const [internalOpen, setOpen] = useState(!compact);
  const open = expanded ?? internalOpen;
  const [action, setAction] = useState<{ type: string; row?: Deposit; proof?: Proof; reservation?: Reservation; key: string } | null>(null);
  const [amount, setAmount] = useState(""); const [reference, setReference] = useState(""); const [notes, setNotes] = useState(""); const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false); const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    controllerRef.current?.abort(); const controller = new AbortController(); controllerRef.current = controller;
    if (!enabled || !open) return;
    setLoading(true); setError("");
    const query = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value); });
    if (phone) query.set("phone", phone);
    try {
      const [data, contacts] = await Promise.all([api<Deposit[]>(`/restaurant/deposits?${query}`, { signal: controller.signal }), phone ? api<Reservation[]>(`/restaurant/deposits/contact-reservations?phone=${encodeURIComponent(phone)}`, { signal: controller.signal }) : search.trim().length >= 2 ? api<Reservation[]>(`/restaurant/deposits/reservation-options?search=${encodeURIComponent(search)}`, { signal: controller.signal }) : Promise.resolve([])]);
      if (!controller.signal.aborted) { setRows(data); setReservations(contacts); }
    } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Error de conexión"); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [api, enabled, open, phone, filters, search]);
  useEffect(() => { setRows([]); setReservations([]); void refresh(); window.addEventListener("focus", refresh); return () => { controllerRef.current?.abort(); window.removeEventListener("focus", refresh); }; }, [refresh]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  if (!enabled) return null;
  function select(type: string, row?: Deposit, proof?: Proof, reservation?: Reservation) {
    setAction({ type, row, proof, reservation, key: crypto.randomUUID() }); setAmount(row ? String(Math.max(0, Number(row.requiredAmount) - Number(row.paidAmount))) : ""); setReference(""); setNotes(""); setDate(new Date().toISOString().slice(0, 16)); setError("");
  }
  async function run(path: string, body: unknown = {}) { await api(path, { method: "POST", body: JSON.stringify(body) }); await refresh(); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!action || busy) return; setBusy(true); setError("");
    try {
      const { type, row, proof, reservation } = action;
      if (type === "request") await api(`/restaurant/reservations/${reservation!.id}/deposit`, { method: "PUT", body: JSON.stringify({ requiredAmount: Number(amount), dueAt: new Date(date).toISOString(), notes }) });
      else if (type === "reject") await run(`/restaurant/deposits/proofs/${proof!.id}/reject`, { reason: notes });
      else if (type === "payment" || type === "refund") await run(`/restaurant/deposits/${row!.id}/entries`, { type, amount: Number(amount), paidAt: new Date(date).toISOString(), paymentMethod: "transferencia", reference, notes, idempotencyKey: action.key, proofIds: proof ? [proof.id] : [] });
      else await run(`/restaurant/deposits/${row!.id}/${type}`);
      setAction(null); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error de conexión"); }
    finally { setBusy(false); }
  }
  async function file(row: Deposit, selected?: File) {
    if (!selected || busy) return; if (selected.size > 10 * 1024 * 1024) { setError("El archivo puede pesar hasta 10 MB"); return; }
    setBusy(true); setError("");
    try {
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = reject; reader.readAsDataURL(selected); });
      await run(`/restaurant/deposits/${row.id}/upload`, { content: data, fileName: selected.name, mimeType: selected.type, size: selected.size });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo cargar el archivo"); }
    finally { setBusy(false); }
  }
  async function view(proof: Proof) {
    setError("");
    try { const response = await fetch(`${API_URL}/restaurant/deposits/proofs/${proof.id}/download`, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error("No se pudo abrir el comprobante"); setPreview({ url: URL.createObjectURL(await response.blob()), name: proof.originalName }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Error de conexión"); }
  }
  const button = "rounded-full border border-brand-line bg-white px-3 py-2 text-xs font-bold text-brand-ink disabled:opacity-50";
  const visible = rows.filter((row) => `${row.reservation.fullName} ${row.reservation.code} ${row.reservation.phone}`.toLowerCase().includes(search.toLowerCase()));
  return <section className={`rounded-2xl border border-brand-line bg-[#FFFCF8] ${compact ? "max-h-[45vh] shrink-0 overflow-auto p-3" : "p-4"}`}>
    <div className="flex items-center justify-between gap-2">{expanded !== undefined ? <span className="text-sm font-bold">Comprobantes</span> : <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="font-bold">Señas y comprobantes {open ? "▾" : "▸"}</button>}{open && <button className={button} onClick={() => void refresh()}>Actualizar</button>}</div>
    {open && <div className="mt-3 space-y-3">
      {!compact && <div className="grid gap-2 sm:grid-cols-3"><input aria-label="Buscar reserva" placeholder="Nombre, código o teléfono" value={search} onChange={(e) => setSearch(e.target.value)} className="foodie-input" /><select aria-label="Sucursal" className="foodie-input" value={filters.branchId} onChange={(e) => setFilters({ ...filters, branchId: e.target.value })}><option value="">Todas las sucursales</option>{bootstrap?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><select aria-label="Estado de seña" className="foodie-input" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Todos los pagos</option><option value="pending">Sin acreditar</option><option value="partial">Pago parcial</option><option value="complete">Seña cubierta</option></select><select aria-label="Revisión" className="foodie-input" value={filters.review} onChange={(e) => setFilters({ ...filters, review: e.target.value })}><option value="">Todos los comprobantes</option><option value="pending">Por revisar</option><option value="approved">Aprobados</option><option value="rejected">Rechazados</option></select><label>Desde<input type="date" className="foodie-input" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label><label>Hasta<input type="date" className="foodie-input" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label><label className="text-sm"><input type="checkbox" checked={filters.expired === "true"} onChange={(e) => setFilters({ ...filters, expired: e.target.checked ? "true" : "" })} /> Solo vencidas sin cubrir</label></div>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}{loading && <p role="status" className="text-sm">Actualizando señas…</p>}
      {reservations.filter((reservation) => !reservation.deposit).map((reservation) => <div key={reservation.id} className="rounded-xl border p-3 text-sm">Reserva {reservation.code} · {new Date(reservation.serviceDate).toLocaleDateString("es-AR", { timeZone: "UTC" })}<button className={`${button} ml-2`} onClick={() => select("request", undefined, undefined, reservation)}>Solicitar seña</button></div>)}
      {!loading && !visible.length && <p className="text-sm text-neutral-600">No hay señas para esta selección.</p>}
      {visible.map((row) => <article key={row.id} className="space-y-3 rounded-xl border bg-white p-3 text-sm">
        <div><strong>{row.reservation.fullName} · {row.reservation.code}</strong><p>{new Date(row.reservation.serviceDate).toLocaleDateString("es-AR", { timeZone: "UTC" })} · {row.reservation.serviceTime}</p><p>Seña: {money(row.requiredAmount)} · Acreditado: {money(row.paidAmount)} · Saldo: {money(Math.max(0, Number(row.requiredAmount) - Number(row.paidAmount)))}</p><p>Reserva: {row.reservation.status === "pending" ? "Pendiente de confirmación manual" : row.reservation.status === "confirmed" ? "Confirmada" : row.reservation.status}</p>{row.dueAt && <p className={new Date(row.dueAt) < new Date() && row.status !== "complete" ? "font-bold text-orange-700" : ""}>Plazo: {new Date(row.dueAt).toLocaleString("es-AR")}{new Date(row.dueAt) < new Date() && row.status !== "complete" ? " · Vencida: requiere revisión, conserva su cupo" : ""}</p>}</div>
        <div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => select("payment", row)}>Registrar pago</button><button className={button} disabled={busy} onClick={() => select("proof-requests", row)}>Solicitar otro comprobante</button>{Number(row.paidAmount) > 0 && <button className={button} onClick={() => select("refund", row)}>Registrar devolución</button>}{row.status === "complete" && row.reservation.status === "pending" && <button className={`${button} bg-orange-100`} onClick={() => select("confirm-reservation", row)}>Confirmar reserva</button>}{row.confirmationAt && row.reservation.status === "confirmed" && <button className={button} onClick={() => select("send-confirmation", row)}>Enviar confirmación{bootstrap?.isDemo ? " (simulada)" : ""}</button>}<label className={`${button} cursor-pointer`}>Cargar comprobante<input type="file" className="sr-only" disabled={busy} accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => { void file(row, e.target.files?.[0]); e.target.value = ""; }} /></label></div>
        {row.proofRequests.flatMap((request) => request.proofs).map((proof) => <div key={proof.id} className="space-y-2 rounded-xl bg-orange-50 p-3"><p><strong>{proof.originalName}</strong> · {new Date(proof.receivedAt).toLocaleString("es-AR")}</p><p>{proof.reviewStatus === "pending" ? "Pendiente de aprobación" : proof.reviewStatus === "approved" ? "Aprobado" : `Rechazado: ${proof.rejectionReason}`}</p><div className="flex flex-wrap gap-2"><button className={button} onClick={() => void view(proof)}>Ver comprobante</button>{proof.reviewStatus === "pending" && <><button className={button} onClick={() => select("payment", row, proof)}>Acreditar pago</button><button className={button} onClick={() => select("reject", row, proof)}>Rechazar con motivo</button></>}{proof.driveFileUrl && <a className={button} href={proof.driveFileUrl} target="_blank" rel="noreferrer">Abrir en Drive</a>}{proof.driveStatus !== "synced" && <button className={button} onClick={() => { setBusy(true); void run(`/restaurant/deposits/proofs/${proof.id}/sync-drive`).catch((reason: Error) => setError(reason.message)).finally(() => setBusy(false)); }} disabled={busy}>{proof.driveStatus === "simulated" ? "Drive simulado" : "Sincronizar con Drive"}</button>}</div>{proof.driveError && <p className="text-xs text-orange-800">{proof.driveError}. El comprobante sigue disponible para revisión.</p>}</div>)}
        {row.confirmationAt && <DeliveryState row={row} refresh={refresh} />}
        <details><summary className="cursor-pointer">Movimientos e historial de pagos</summary>{row.entries.map((entry) => <p key={entry.id} className="mt-2">{entry.type === "refund" ? "Devolución" : "Pago"} · {money(entry.amount)} · {new Date(entry.paidAt).toLocaleString("es-AR")} · {entry.reference} · {entry.notes}</p>)}</details>
      </article>)}
      {action && <form onSubmit={submit} className="space-y-3 rounded-xl border-2 border-orange-300 bg-white p-4"><strong>{({ request: "Solicitar seña", payment: "Acreditar pago recibido", refund: "Registrar devolución realizada", reject: "Rechazar comprobante", "proof-requests": "Solicitar otro comprobante", "confirm-reservation": "Confirmar reserva", "send-confirmation": "Enviar confirmación al cliente" } as Record<string, string>)[action.type]}</strong>{["request", "payment", "refund"].includes(action.type) && <><label className="block">Importe efectivamente {action.type === "refund" ? "devuelto" : action.type === "request" ? "requerido" : "acreditado"}<input className="foodie-input" type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} /></label><label className="block">{action.type === "request" ? "Vencimiento" : "Fecha del movimiento"}<input className="foodie-input" type="datetime-local" required value={date} onChange={(e) => setDate(e.target.value)} /></label></>}{["payment", "refund"].includes(action.type) && <label className="block">Referencia<input className="foodie-input" required={action.type === "refund"} value={reference} onChange={(e) => setReference(e.target.value)} /></label>}{["reject", "refund", "payment", "request"].includes(action.type) && <label className="block">{action.type === "reject" || action.type === "refund" ? "Motivo" : "Notas"}<textarea className="foodie-input" required={["reject", "refund"].includes(action.type)} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>}{action.type === "confirm-reservation" && <p>Se verificará la disponibilidad antes de confirmar. Acreditar el pago no confirma por sí solo la reserva.</p>}{action.type === "proof-requests" && <p>La solicitud quedará disponible para el bot. No se enviará un mensaje automáticamente desde esta acción.</p>}<div className="flex gap-2"><button type="submit" disabled={busy} className={`${button} bg-orange-100`}>{busy ? "Guardando…" : "Confirmar acción"}</button><button type="button" disabled={busy} className={button} onClick={() => setAction(null)}>Cancelar</button></div></form>}
      {preview && <div className="fixed inset-0 z-50 flex flex-col bg-white p-4" role="dialog" aria-label="Comprobante"><div className="mb-2 flex justify-between"><strong>{preview.name}</strong><button className={button} onClick={() => setPreview(null)}>Cerrar comprobante</button></div><iframe src={preview.url} title={preview.name} className="min-h-0 flex-1" /></div>}
    </div>}
  </section>;
}

function DeliveryState({ row, refresh }: { row: Deposit; refresh: () => Promise<void> }) {
  const api = useDepositApi(); const [state, setState] = useState<{ status: string; error?: string; updatedAt: string } | null>(null);
  const [error, setError] = useState(""); const [reference, setReference] = useState(""); const [outcome, setOutcome] = useState("sent"); const [busy, setBusy] = useState(false);
  useEffect(() => { const controller = new AbortController(); void api<{ status: string; error?: string; updatedAt: string } | null>(`/restaurant/deposits/${row.id}/delivery`, { signal: controller.signal }).then(setState).catch((reason: Error) => { if (!controller.signal.aborted) setError(reason.message); }); return () => controller.abort(); }, [api, row]);
  async function resolve(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { await api(`/restaurant/deposits/${row.id}/resolve-delivery`, { method: "POST", body: JSON.stringify({ outcome, reference }) }); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar la verificación"); } finally { setBusy(false); } }
  const unknown = state?.status === "unknown" || ((state?.status === "sending" || state?.status === "dispatching") && new Date(state.updatedAt).getTime() < Date.now() - 120000);
  return <div className="rounded-xl bg-neutral-50 p-3 text-sm"><p>Confirmación al cliente: {({ sent: "Enviada", simulated: "Simulada en demo", pending: "Pendiente de envío", failed: "Falló, podés reintentar", unknown: "Resultado incierto: verificar en n8n antes de reintentar", sending: "En proceso", dispatching: "En proceso" } as Record<string, string>)[state?.status ?? "pending"]}</p>{state?.error && <p className="text-orange-800">{state.error}</p>}{error && <p role="alert" className="text-red-700">{error}</p>}{unknown && <form onSubmit={resolve} className="mt-2 space-y-2"><label className="block">Resultado verificado<select className="foodie-input" value={outcome} onChange={(event) => setOutcome(event.target.value)}><option value="sent">Verifiqué que ya se envió</option><option value="not_sent">Verifiqué que no se envió</option></select></label><label className="block">Referencia de la verificación<input required className="foodie-input" placeholder="Ejecución de n8n o referencia de revisión" value={reference} onChange={(event) => setReference(event.target.value)} /></label><button disabled={busy} className="rounded-full border px-3 py-2 font-bold">Guardar verificación</button></form>}</div>;
}
