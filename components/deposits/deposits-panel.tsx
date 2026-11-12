"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useWorkspace } from "../workspace-provider";
import { moduleEnabled } from "../../lib/restaurant-features";
import { ListPagination, type NumberedPage } from "./list-pagination";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/v1";
type Proof = { id: string; originalName: string; receivedAt: string; reviewStatus: string; rejectionReason?: string; driveStatus: string; driveError?: string; driveFileUrl?: string };
type Movement = { id: string; type: string; amount: string; reference?: string; notes?: string; paidAt: string };
type Deposit = { id: string; requiredAmount: string; paidAmount: string; currency: string; status: string; dueAt?: string; confirmationAt?: string; reservation: { id: string; code: string; fullName: string; phone: string; serviceDate: string; serviceTime: string; status: string }; entries?: Movement[]; proofRequests?: Array<{ id: string; proofs: Proof[] }>; _count?: { entries: number; proofRequests: number } };
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

export type DepositPanelState = "loading" | "empty" | "visible";

export const emptyDepositFilters = { search: "", branchId: "", status: "", review: "", from: "", to: "", expired: "" };
export type DepositFilterValues = typeof emptyDepositFilters;

export function DepositFilters({ values, onChange, reservationOptions, allowPartial = true, children }: {
  values: DepositFilterValues;
  onChange: (values: DepositFilterValues) => void;
  reservationOptions: boolean;
  allowPartial?: boolean;
  children?: ReactNode;
}) {
  const { bootstrap } = useWorkspace();
  const change = (key: keyof DepositFilterValues, value: string) => onChange({ ...values, [key]: value });
  return <div className="grid items-end gap-2 sm:grid-cols-3">
    {children}
    <input aria-label="Buscar por nombre, código o teléfono" placeholder="Nombre, código o teléfono" maxLength={120}
      value={values.search} onChange={event => change("search", event.target.value)} className="foodie-input" />
    <select aria-label="Estado de pago" className="foodie-input" value={values.status} onChange={event => change("status", event.target.value)}>
      <option value="">Todos los pagos</option>
      <option value="pending">Pendientes de pago</option>
      {allowPartial && <option value="partial">Pago parcial</option>}
      <option value="complete">Pagos completos</option>
    </select>
    <select aria-label="Estado del comprobante" className="foodie-input" value={values.review} onChange={event => change("review", event.target.value)}>
      <option value="">Todos los comprobantes</option>
      <option value="pending">Por revisar</option>
      <option value="approved">Aprobados</option>
      <option value="rejected">Rechazados</option>
    </select>
    <label>Desde<input type="date" className="foodie-input" value={values.from} onChange={event => change("from", event.target.value)} /></label>
    <label>Hasta<input type="date" className="foodie-input" value={values.to} onChange={event => change("to", event.target.value)} /></label>
    {reservationOptions && <>
      <select aria-label="Sucursal" className="foodie-input" value={values.branchId} onChange={event => change("branchId", event.target.value)}>
        <option value="">Todas las sucursales</option>
        {bootstrap?.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
      </select>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={values.expired === "true"}
        onChange={event => change("expired", event.target.checked ? "true" : "")} /> Solo vencidas sin cubrir</label>
    </>}
  </div>;
}

export function DepositsPanel({ phone, compact = false, embedded = false, filterValues, refreshKey = 0, onPanelState }: {
  phone?: string; compact?: boolean; embedded?: boolean; filterValues?: DepositFilterValues; refreshKey?: number;
  onPanelState?: (state: DepositPanelState) => void;
}) {
  const { bootstrap, currentUser, token } = useWorkspace();
  const enabled = (!compact || Boolean(phone)) && moduleEnabled(bootstrap, "deposits") && Boolean(currentUser && ["restaurant_owner", "restaurant_manager", "cashier"].includes(currentUser.role));
  const api = useDepositApi();
  const [rows, setRows] = useState<Deposit[]>([]); const [reservations, setReservations] = useState<Reservation[]>([]);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(compact);
  const [localFilters, setLocalFilters] = useState(emptyDepositFilters);
  const filters = filterValues ?? localFilters;
  const selection = JSON.stringify([phone, filters]);
  const [paging, setPaging] = useState({ selection, deposits: 1, reservations: 1 });
  const page = paging.selection === selection ? paging.deposits : 1;
  const reservationPage = paging.selection === selection ? paging.reservations : 1;
  const [hasNext, setHasNext] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [hasNextReservation, setHasNextReservation] = useState(false);
  const [open, setOpen] = useState(true);
  const [action, setAction] = useState<{ type: string; row?: Deposit; proof?: Proof; reservation?: Reservation; key: string } | null>(null);
  const [amount, setAmount] = useState(""); const [reference, setReference] = useState(""); const [notes, setNotes] = useState(""); const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false); const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    controllerRef.current?.abort(); const controller = new AbortController(); controllerRef.current = controller;
    if (!enabled || !open) return;
    setLoading(true); setError("");
    setHistoryRevision(value => value + 1);
    const { search, ...criteria } = filters;
    const query = new URLSearchParams({ page: String(page) });
    Object.entries(criteria).forEach(([key, value]) => { if (value) query.set(key, value); });
    if (search.trim()) query.set("search", search.trim());
    const offerNewDeposit = search.trim().length >= 2 && !Object.values(criteria).some(Boolean);
    if (phone) query.set("phone", phone);
    try {
      const signal = controller.signal;
      const contactsPath = phone ? `contact-reservations?phone=${encodeURIComponent(phone)}`
        : offerNewDeposit ? `reservation-options?search=${encodeURIComponent(search.trim())}` : null;
      const [data, contacts] = await Promise.all([
        api<NumberedPage<Deposit> | Deposit[]>(`/restaurant/deposits?${query}`, { signal }),
        contactsPath ? api<NumberedPage<Reservation> | Reservation[]>(`/restaurant/deposits/${contactsPath}&page=${reservationPage}`, { signal }) : []
      ]);
      if (!signal.aborted) {
        setRows(Array.isArray(data) ? data.slice(0, 10) : data.items);
        setHasNext(!Array.isArray(data) && data.hasNext);
        setReservations(Array.isArray(contacts) ? contacts.filter(row => !row.deposit).slice(0, 10) : contacts.items);
        setHasNextReservation(!Array.isArray(contacts) && contacts.hasNext);
      }
    } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Error de conexión"); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [api, enabled, open, phone, filters, page, reservationPage]);
  useEffect(() => { void refresh(); window.addEventListener("focus", refresh); return () => { controllerRef.current?.abort(); window.removeEventListener("focus", refresh); }; }, [refresh, refreshKey]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  const hasContent = Boolean(rows.length || reservations.length || page > 1 || reservationPage > 1 || error || action || preview);
  useEffect(() => {
    onPanelState?.(!enabled ? "empty" : hasContent ? "visible" : loading ? "loading" : "empty");
  }, [enabled, hasContent, loading, onPanelState]);
  if (!enabled) return null;
  if (compact && !hasContent) return null;
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
  const setPage = (next: number) => setPaging({ selection, deposits: next, reservations: reservationPage });
  const setReservationPage = (next: number) => setPaging({ selection, deposits: page, reservations: next });
  return <section className={compact || embedded ? undefined : "rounded-2xl border border-brand-line bg-[#FFFCF8] p-4"}>
    {!compact && !embedded && <div className="flex items-center justify-between gap-2"><button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="font-bold">Señas y comprobantes {open ? "▾" : "▸"}</button>{open && <button className={button} onClick={() => void refresh()}>Actualizar</button>}</div>}
    {open && <div className={compact ? "space-y-2" : embedded ? "space-y-3" : "mt-3 space-y-3"}>
      {!compact && !filterValues && <DepositFilters values={filters} onChange={setLocalFilters} reservationOptions />}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}{loading && !compact && <p role="status" className="text-sm">Actualizando señas…</p>}
      {!loading && reservations.map((reservation) => <div key={reservation.id} className="rounded-xl border p-3 text-sm">Reserva {reservation.code} · {new Date(reservation.serviceDate).toLocaleDateString("es-AR", { timeZone: "UTC" })}<button className={`${button} ml-2`} onClick={() => select("request", undefined, undefined, reservation)}>Solicitar seña</button></div>)}
      <ListPagination page={reservationPage} hasNext={hasNextReservation} loading={loading}
        onPrevious={() => setReservationPage(reservationPage - 1)} onNext={() => setReservationPage(reservationPage + 1)} />
      {!loading && !rows.length && !reservations.length && !error && <p className="text-sm text-neutral-600">No hay señas para esta selección.</p>}
      <div hidden={loading} className="space-y-3">
      {rows.map((row) => <article key={row.id} className="space-y-3 rounded-xl border bg-white p-3 text-sm">
        <div><strong>{row.reservation.fullName} · {row.reservation.code}</strong><p>{new Date(row.reservation.serviceDate).toLocaleDateString("es-AR", { timeZone: "UTC" })} · {row.reservation.serviceTime}</p><p>Seña: {money(row.requiredAmount)} · Acreditado: {money(row.paidAmount)} · Saldo: {money(Math.max(0, Number(row.requiredAmount) - Number(row.paidAmount)))}</p><p>Reserva: {row.reservation.status === "pending" ? "Pendiente de confirmación manual" : row.reservation.status === "confirmed" ? "Confirmada" : row.reservation.status}</p>{row.dueAt && <p className={new Date(row.dueAt) < new Date() && row.status !== "complete" ? "font-bold text-orange-700" : ""}>Plazo: {new Date(row.dueAt).toLocaleString("es-AR")}{new Date(row.dueAt) < new Date() && row.status !== "complete" ? " · Vencida: requiere revisión, conserva su cupo" : ""}</p>}</div>
        <div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => select("payment", row)}>Registrar pago</button><button className={button} disabled={busy} onClick={() => select("proof-requests", row)}>Solicitar otro comprobante</button>{Number(row.paidAmount) > 0 && <button className={button} onClick={() => select("refund", row)}>Registrar devolución</button>}{row.status === "complete" && row.reservation.status === "pending" && <button className={`${button} bg-orange-100`} onClick={() => select("confirm-reservation", row)}>Confirmar reserva</button>}{row.confirmationAt && row.reservation.status === "confirmed" && <button className={button} onClick={() => select("send-confirmation", row)}>Enviar confirmación{bootstrap?.isDemo ? " (simulada)" : ""}</button>}<label className={`${button} cursor-pointer`}>Cargar comprobante<input type="file" className="sr-only" disabled={busy} accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => { void file(row, e.target.files?.[0]); e.target.value = ""; }} /></label></div>
        {(row._count ? row._count.proofRequests > 0 : row.proofRequests?.some(request => request.proofs.length > 0)) && <DepositHistory<Proof>
          revision={historyRevision} title="Comprobantes de la seña" path={`/restaurant/deposits/${row.id}/proofs`} review={filters.review}
          legacyItems={row.proofRequests?.flatMap(request => request.proofs)}
          render={proof => <div key={proof.id} className="space-y-2 rounded-xl bg-orange-50 p-3"><p><strong>{proof.originalName}</strong> · {new Date(proof.receivedAt).toLocaleString("es-AR")}</p><p>{proof.reviewStatus === "pending" ? "Pendiente de aprobación" : proof.reviewStatus === "approved" ? "Aprobado" : `Rechazado: ${proof.rejectionReason}`}</p><div className="flex flex-wrap gap-2"><button className={button} onClick={() => void view(proof)}>Ver comprobante</button>{proof.reviewStatus === "pending" && <><button className={button} onClick={() => select("payment", row, proof)}>Acreditar pago</button><button className={button} onClick={() => select("reject", row, proof)}>Rechazar con motivo</button></>}{proof.driveFileUrl && <a className={button} href={proof.driveFileUrl} target="_blank" rel="noreferrer">Abrir en Drive</a>}{proof.driveStatus !== "synced" && <button className={button} onClick={() => { setBusy(true); void run(`/restaurant/deposits/proofs/${proof.id}/sync-drive`).catch((reason: Error) => setError(reason.message)).finally(() => setBusy(false)); }} disabled={busy}>{proof.driveStatus === "simulated" ? "Drive simulado" : "Sincronizar con Drive"}</button>}</div>{proof.driveError && <p className="text-xs text-orange-800">{proof.driveError}. El comprobante sigue disponible para revisión.</p>}</div>} />}
        {row.confirmationAt && <DeliveryState row={row} refresh={refresh} />}
        {(row._count ? row._count.entries > 0 : Boolean(row.entries?.length)) && <DepositHistory<Movement>
          revision={historyRevision} title="Movimientos e historial de pagos" path={`/restaurant/deposits/${row.id}/movements`} legacyItems={row.entries}
          render={entry => <p key={entry.id} className="mt-2">{entry.type === "refund" ? "Devolución" : "Pago"} · {money(entry.amount)} · {new Date(entry.paidAt).toLocaleString("es-AR")} · {entry.reference} · {entry.notes}</p>} />}
      </article>)}
      </div>
      <ListPagination page={page} hasNext={hasNext} loading={loading}
        onPrevious={() => setPage(page - 1)} onNext={() => setPage(page + 1)} />
      {action && <form onSubmit={submit} className="space-y-3 rounded-xl border-2 border-orange-300 bg-white p-4"><strong>{({ request: "Solicitar seña", payment: "Acreditar pago recibido", refund: "Registrar devolución realizada", reject: "Rechazar comprobante", "proof-requests": "Solicitar otro comprobante", "confirm-reservation": "Confirmar reserva", "send-confirmation": "Enviar confirmación al cliente" } as Record<string, string>)[action.type]}</strong>{["request", "payment", "refund"].includes(action.type) && <><label className="block">Importe efectivamente {action.type === "refund" ? "devuelto" : action.type === "request" ? "requerido" : "acreditado"}<input className="foodie-input" type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} /></label><label className="block">{action.type === "request" ? "Vencimiento" : "Fecha del movimiento"}<input className="foodie-input" type="datetime-local" required value={date} onChange={(e) => setDate(e.target.value)} /></label></>}{["payment", "refund"].includes(action.type) && <label className="block">Referencia<input className="foodie-input" required={action.type === "refund"} value={reference} onChange={(e) => setReference(e.target.value)} /></label>}{["reject", "refund", "payment", "request"].includes(action.type) && <label className="block">{action.type === "reject" || action.type === "refund" ? "Motivo" : "Notas"}<textarea className="foodie-input" required={["reject", "refund"].includes(action.type)} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>}{action.type === "confirm-reservation" && <p>Se verificará la disponibilidad antes de confirmar. Acreditar el pago no confirma por sí solo la reserva.</p>}{action.type === "proof-requests" && <p>La solicitud quedará disponible para el bot. No se enviará un mensaje automáticamente desde esta acción.</p>}<div className="flex gap-2"><button type="submit" disabled={busy} className={`${button} bg-orange-100`}>{busy ? "Guardando…" : "Confirmar acción"}</button><button type="button" disabled={busy} className={button} onClick={() => setAction(null)}>Cancelar</button></div></form>}
      {preview && <div className="fixed inset-0 z-50 flex flex-col bg-white p-4" role="dialog" aria-label="Comprobante"><div className="mb-2 flex justify-between"><strong>{preview.name}</strong><button className={button} onClick={() => setPreview(null)}>Cerrar comprobante</button></div><iframe src={preview.url} title={preview.name} className="min-h-0 flex-1" /></div>}
    </div>}
  </section>;
}

function DepositHistory<T>({ title, path, review, revision, legacyItems, render }: {
  title: string; path: string; review?: string; revision: number; legacyItems?: T[]; render: (item: T) => ReactNode;
}) {
  const api = useDepositApi();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<NumberedPage<T>>({ items: [], hasNext: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open || legacyItems) return;
    const controller = new AbortController();
    const { signal } = controller;
    const query = new URLSearchParams({ page: String(page) });
    if (review) query.set("review", review);
    setLoading(true);
    setError("");
    void api<NumberedPage<T>>(`${path}?${query}`, { signal })
      .then(data => { if (!signal.aborted) setResult(data); })
      .catch((failure: Error) => { if (!signal.aborted) setError(failure.message); })
      .finally(() => { if (!signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, open, legacyItems, path, page, review, revision]);
  const items = legacyItems?.slice((page - 1) * 10, page * 10) ?? result.items;
  const hasNext = legacyItems ? legacyItems.length > page * 10 : result.hasNext;
  return <details onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer">{title}</summary>
    {open && <div className="mt-2 space-y-2">
      {error ? <p role="alert" className="text-red-700">{error}</p>
        : loading ? <p role="status">Cargando…</p>
        : items.length ? items.map(render) : <p>No hay resultados para esta página.</p>}
      <ListPagination page={page} hasNext={hasNext && !error} loading={loading}
        onPrevious={() => setPage(page - 1)} onNext={() => setPage(page + 1)} />
    </div>}
  </details>;
}

function DeliveryState({ row, refresh }: { row: Deposit; refresh: () => Promise<void> }) {
  const api = useDepositApi(); const [state, setState] = useState<{ status: string; error?: string; updatedAt: string } | null>(null);
  const [error, setError] = useState(""); const [reference, setReference] = useState(""); const [outcome, setOutcome] = useState("sent"); const [busy, setBusy] = useState(false);
  useEffect(() => { const controller = new AbortController(); void api<{ status: string; error?: string; updatedAt: string } | null>(`/restaurant/deposits/${row.id}/delivery`, { signal: controller.signal }).then(setState).catch((reason: Error) => { if (!controller.signal.aborted) setError(reason.message); }); return () => controller.abort(); }, [api, row]);
  async function resolve(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { await api(`/restaurant/deposits/${row.id}/resolve-delivery`, { method: "POST", body: JSON.stringify({ outcome, reference }) }); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar la verificación"); } finally { setBusy(false); } }
  const unknown = state?.status === "unknown" || ((state?.status === "sending" || state?.status === "dispatching") && new Date(state.updatedAt).getTime() < Date.now() - 120000);
  return <div className="rounded-xl bg-neutral-50 p-3 text-sm"><p>Confirmación al cliente: {({ sent: "Enviada", simulated: "Simulada en demo", pending: "Pendiente de envío", failed: "Falló, podés reintentar", unknown: "Resultado incierto: verificar en n8n antes de reintentar", sending: "En proceso", dispatching: "En proceso" } as Record<string, string>)[state?.status ?? "pending"]}</p>{state?.error && <p className="text-orange-800">{state.error}</p>}{error && <p role="alert" className="text-red-700">{error}</p>}{unknown && <form onSubmit={resolve} className="mt-2 space-y-2"><label className="block">Resultado verificado<select className="foodie-input" value={outcome} onChange={(event) => setOutcome(event.target.value)}><option value="sent">Verifiqué que ya se envió</option><option value="not_sent">Verifiqué que no se envió</option></select></label><label className="block">Referencia de la verificación<input required className="foodie-input" placeholder="Ejecución de n8n o referencia de revisión" value={reference} onChange={(event) => setReference(event.target.value)} /></label><button disabled={busy} className="rounded-full border px-3 py-2 font-bold">Guardar verificación</button></form>}</div>;
}
