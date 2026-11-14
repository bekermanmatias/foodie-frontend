"use client";
import { useEffect, useState } from "react";
import { useWorkspace } from "../workspace-provider";
import { WorkspaceShell } from "../workspace-shell";
import { DepositFilters, DepositsPanel, emptyDepositFilters, useDepositApi, type DepositFilterValues } from "./deposits-panel";
import { GiftCardProofHistory } from "../gift-card-proofs";
import { moduleEnabled } from "../../lib/restaurant-features";

type Rule = { id: string; label: string; minPeople: number; maxPeople: number | null; eventId: string | null; mode: "fixed" | "per_person"; amount: number };
type Settings = { reviewed: boolean; currency: string; bankAlias: string; bankCbu: string; bankHolder: string; paymentHours: number; rules: Rule[] };

export function DepositsPage() {
  const { currentUser } = useWorkspace();
  const [tab, setTab] = useState<"deposits" | "settings">("deposits");
  const allowed = currentUser && ["restaurant_owner", "restaurant_manager", "cashier"].includes(currentUser.role);
  const tabClass = (active: boolean) => `rounded-full border px-4 py-2 font-bold ${active ? "border-brand-orange bg-brand-orange text-white" : "border-brand-line"}`;
  return <WorkspaceShell title="Señas y pagos" description="Comprobantes y acreditaciones. La confirmación de la reserva siempre es manual.">
    {!allowed ? <p>No tenés permiso para acceder al módulo financiero.</p> : <div className="space-y-5">
      {currentUser?.role === "restaurant_owner" && <nav className="flex flex-wrap gap-2" aria-label="Secciones de señas">
        <button type="button" className={tabClass(tab === "deposits")} aria-pressed={tab === "deposits"} onClick={() => setTab("deposits")}>Comprobantes</button>
        <button type="button" className={tabClass(tab === "settings")} aria-pressed={tab === "settings"} onClick={() => setTab("settings")}>Reglas y transferencia</button>
      </nav>}
      {tab === "deposits" && <PaymentProofsOverview />}
      {tab === "settings" && <DepositSettingsForm />}
    </div>}
  </WorkspaceShell>;
}

function PaymentProofsOverview() {
  const { bootstrap, currentUser } = useWorkspace();
  const [refreshKey, setRefreshKey] = useState(0);
  const [filters, setFilters] = useState(emptyDepositFilters);
  const [selectedType, setSelectedType] = useState("all");
  const canViewGiftCards = currentUser?.role === "restaurant_owner" && moduleEnabled(bootstrap, "giftCards");
  const type = canViewGiftCards ? selectedType : "deposits";
  const showGiftCards = type !== "deposits" && filters.status !== "partial";
  const showDeposits = type !== "giftCards";
  const giftQuery = showGiftCards ? giftCardHistoryQuery(filters) : "";

  return <div className="space-y-4 rounded-2xl border border-brand-line bg-[#FFFCF8] p-4">
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-bold">Comprobantes</h2>
      <button type="button" className="rounded-full border border-brand-line bg-white px-3 py-2 text-xs font-bold" onClick={() => setRefreshKey(value => value + 1)}>Actualizar</button>
    </div>
    <DepositFilters values={filters} onChange={setFilters} reservationOptions={type === "deposits"} allowPartial={showDeposits}>
      {canViewGiftCards && <select aria-label="Tipo de comprobante" className="foodie-input" value={type} onChange={event => {
        const next = event.target.value;
        setSelectedType(next);
        setFilters(current => ({
          ...current, branchId: "", expired: "",
          status: next === "giftCards" && current.status === "partial" ? "" : current.status
        }));
      }}>
        <option value="all">Todos los tipos</option>
        <option value="deposits">Señas de reservas</option>
        <option value="giftCards">Gift Cards</option>
      </select>}
    </DepositFilters>
    {(filters.from || filters.to) && <p className="text-xs text-neutral-600">
      {showDeposits && showGiftCards ? "Las fechas se aplican al día de la reserva y al día de recepción del comprobante de Gift Card."
        : showDeposits ? "Fecha de la reserva." : "Fecha de recepción del comprobante."}
    </p>}
    {showDeposits && <section className="space-y-2 border-t border-brand-line pt-4">
      <h3 className="text-sm font-bold">Señas de reservas</h3>
      <DepositsPanel embedded filterValues={filters} refreshKey={refreshKey} />
    </section>}
    {showGiftCards && <div className="border-t border-brand-line pt-4">
      <GiftCardProofHistory key={giftQuery} query={giftQuery} refreshKey={refreshKey} />
    </div>}
  </div>;
}

function giftCardHistoryQuery(filters: DepositFilterValues) {
  const query = new URLSearchParams();
  if (filters.search.trim()) query.set("search", filters.search.trim());
  if (filters.review) query.set("review", filters.review);
  if (filters.status === "pending") query.set("payment", "PENDING");
  if (filters.status === "complete") query.set("payment", "CONFIRMED");
  if (filters.from) query.set("from", new Date(`${filters.from}T00:00:00`).toISOString());
  if (filters.to) {
    const end = new Date(`${filters.to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    query.set("before", end.toISOString());
  }
  return query.toString();
}

function DepositSettingsForm() {
  const api = useDepositApi(); const [config, setConfig] = useState<Settings | null>(null); const [events, setEvents] = useState<Array<{ id: string; label: string; serviceDate: string }>>([]);
  const [error, setError] = useState(""); const [saved, setSaved] = useState(false); const [saving, setSaving] = useState(false);
  useEffect(() => { const controller = new AbortController(); void Promise.all([api<Settings>("/restaurant/deposits/settings", { signal: controller.signal }), api<Array<{ id: string; label: string; serviceDate: string }>>("/restaurant/deposits/events", { signal: controller.signal })]).then(([settings, options]) => { setConfig(settings); setEvents(options); }).catch((reason: Error) => { if (!controller.signal.aborted) setError(reason.message); }); return () => controller.abort(); }, [api]);
  if (!config) return <p>{error || "Cargando reglas…"}</p>;
  const edit = (key: keyof Settings, value: unknown) => { setConfig({ ...config, [key]: value }); setSaved(false); };
  const rule = (index: number, value: Partial<Rule>) => edit("rules", config.rules.map((item, i) => i === index ? { ...item, ...value } : item));
  async function save(event: React.FormEvent) { event.preventDefault(); setSaving(true); setError(""); try { await api("/restaurant/deposits/settings", { method: "PUT", body: JSON.stringify(config) }); setSaved(true); } catch (reason) { setError(reason instanceof Error ? reason.message : "Error de conexión"); } finally { setSaving(false); } }
  return <form onSubmit={save} className="space-y-4 rounded-2xl border p-5"><h2 className="text-lg font-bold">Reglas del restaurante</h2><p className="text-sm">Las reglas se aplican a nuevas solicitudes. Las señas existentes conservan sus condiciones originales. Revisá los valores usados por el bot antes de habilitar la configuración.</p><div className="grid gap-3 sm:grid-cols-2">{([["bankAlias", "Alias de transferencia"], ["bankCbu", "CBU"], ["bankHolder", "Titular"]] as const).map(([key, label]) => <label key={key}>{label}<input className="foodie-input" value={config[key]} onChange={(e) => edit(key, e.target.value)} /></label>)}<label>Plazo de pago en horas<input className="foodie-input" type="number" min="1" max="720" value={config.paymentHours} onChange={(e) => edit("paymentHours", Number(e.target.value))} /></label></div>
    {config.rules.map((item, index) => <fieldset key={item.id} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2"><legend className="font-bold">Regla {index + 1}</legend><label>Descripción<input className="foodie-input" required value={item.label} onChange={(e) => rule(index, { label: e.target.value })} /></label><label>Evento<select className="foodie-input" value={item.eventId ?? ""} onChange={(e) => rule(index, { eventId: e.target.value || null })}><option value="">Reservas generales</option>{events.map((option) => <option key={option.id} value={option.id}>{option.label} · {option.serviceDate.slice(0, 10)}</option>)}</select></label><label>Mínimo de personas<input className="foodie-input" type="number" required min="1" value={item.minPeople} onChange={(e) => rule(index, { minPeople: Number(e.target.value) })} /></label><label>Máximo de personas (vacío: sin límite)<input className="foodie-input" type="number" min="1" value={item.maxPeople ?? ""} onChange={(e) => rule(index, { maxPeople: e.target.value ? Number(e.target.value) : null })} /></label><label>Modalidad<select className="foodie-input" value={item.mode} onChange={(e) => rule(index, { mode: e.target.value as Rule["mode"] })}><option value="fixed">Monto fijo por reserva</option><option value="per_person">Monto por persona</option></select></label><label>Importe en ARS<input className="foodie-input" type="number" min="0.01" step="0.01" required value={item.amount || ""} onChange={(e) => rule(index, { amount: Number(e.target.value) })} /></label><button type="button" className="text-left text-sm font-bold text-red-700" onClick={() => edit("rules", config.rules.filter((_, i) => i !== index))}>Quitar regla</button></fieldset>)}
    <button type="button" className="rounded-full border px-4 py-2" onClick={() => edit("rules", [...config.rules, { id: crypto.randomUUID(), label: "", minPeople: 1, maxPeople: null, eventId: null, mode: "fixed", amount: 0 }])}>Agregar regla</button><label className="flex items-center gap-2"><input type="checkbox" checked={config.reviewed} onChange={(e) => edit("reviewed", e.target.checked)} /> Revisé las reglas y los datos de transferencia para este restaurante</label>{error && <p role="alert" className="text-red-700">{error}</p>}{saved && <p role="status" className="text-green-700">Configuración guardada</p>}<button disabled={saving} className="rounded-full bg-brand-orange px-5 py-3 font-bold text-white">{saving ? "Guardando…" : "Guardar configuración"}</button>
  </form>;
}
