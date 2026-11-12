"use client";
import { useEffect, useState } from "react";
import { useWorkspace } from "../workspace-provider";
import { WorkspaceShell } from "../workspace-shell";
import { DepositsPanel, useDepositApi } from "./deposits-panel";
import { GiftCardProofHistory } from "../gift-card-proofs";

type Rule = { id: string; label: string; minPeople: number; maxPeople: number | null; eventId: string | null; mode: "fixed" | "per_person"; amount: number };
type Settings = { reviewed: boolean; currency: string; bankAlias: string; bankCbu: string; bankHolder: string; paymentHours: number; rules: Rule[] };
type DriveState = { demo: boolean; status: string; rootFolderId?: string; proofsFolderId?: string; generalFolderId?: string; error?: string };
type FileRow = { id: string; originalName?: string; name?: string; receivedAt?: string; driveFileUrl?: string; webViewLink?: string; driveStatus?: string; request?: { deposit: { reservation: { code: string; fullName: string } } } };

export function DepositsPage({ initialTab = "deposits", driveConnection }: {
  initialTab?: "deposits" | "drive";
  driveConnection?: "cancelled" | "failed";
}) {
  const { currentUser } = useWorkspace();
  const [tab, setTab] = useState<"deposits" | "drive" | "settings">(initialTab);
  const allowed = currentUser && ["restaurant_owner", "restaurant_manager", "cashier"].includes(currentUser.role);
  return <WorkspaceShell title="Señas y pagos" description="Comprobantes y acreditaciones. La confirmación de la reserva siempre es manual.">
    {!allowed ? <p>No tenés permiso para acceder al módulo financiero.</p> : <div className="space-y-5">
      <nav className="flex flex-wrap gap-2" aria-label="Secciones de señas">
        <button className="rounded-full border px-4 py-2 font-bold" onClick={() => setTab("deposits")}>Señas y comprobantes</button>
        <button className="rounded-full border px-4 py-2 font-bold" onClick={() => setTab("drive")}>Archivos y Drive</button>
        {currentUser?.role === "restaurant_owner" && <button className="rounded-full border px-4 py-2 font-bold" onClick={() => setTab("settings")}>Reglas y transferencia</button>}
      </nav>
      {tab === "deposits" && <PaymentProofsOverview />}
      {tab === "settings" && <DepositSettingsForm />}
      {tab === "drive" && <>
        {driveConnection === "cancelled" && <p role="status">Cancelaste la autorización de Google.</p>}
        {driveConnection === "failed" && <p role="alert" className="text-red-700">No se pudo completar la conexión con Google. Volvé a intentarlo desde esta pantalla.</p>}
        <DepositDrivePanel />
      </>}
    </div>}
  </WorkspaceShell>;
}

function PaymentProofsOverview() {
  const [refreshKey, setRefreshKey] = useState(0);
  return <div className="space-y-4 rounded-2xl border border-brand-line bg-[#FFFCF8] p-4">
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-bold">Comprobantes</h2>
      <button type="button" className="rounded-full border border-brand-line bg-white px-3 py-2 text-xs font-bold" onClick={() => setRefreshKey(value => value + 1)}>Actualizar</button>
    </div>
    <GiftCardProofHistory refreshKey={refreshKey} />
    <div className="space-y-2 border-t border-brand-line pt-4">
      <h3 className="text-sm font-bold">Señas de reservas</h3>
      <DepositsPanel embedded refreshKey={refreshKey} />
    </div>
  </div>;
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

function driveFolderId(input: string) {
  try {
    const url = new URL(input.trim());
    if (url.origin !== "https://drive.google.com") return null;
    return url.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([\w-]{1,200})\/?$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function DepositDrivePanel() {
  const api = useDepositApi();
  const { currentUser } = useWorkspace();
  const owner = currentUser?.role === "restaurant_owner";
  const [state, setState] = useState<DriveState | null>(null);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showFolderLink, setShowFolderLink] = useState(false);
  const [folderLink, setFolderLink] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [category, setCategory] = useState("proofs");
  const [search, setSearch] = useState("");
  const [loadingFiles, setLoadingFiles] = useState(true);

  useEffect(() => {
    let request: AbortController | undefined;
    async function refresh() {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      const { signal } = controller;
      setLoadingFiles(true);
      setLoadError("");
      try {
        const status = await api<DriveState>("/restaurant/deposits/drive/status", { signal });
        if (signal.aborted) return;
        setState(status);
        if (category === "general" && !status.generalFolderId) {
          setFiles([]);
          return;
        }
        const result = await api<FileRow[] | { files: FileRow[] }>(
          `/restaurant/deposits/drive/files?category=${category}`, { signal }
        );
        if (!signal.aborted) setFiles(Array.isArray(result) ? result : result.files);
      } catch (reason) {
        if (!signal.aborted) setLoadError(reason instanceof Error ? reason.message : "Error de conexión");
      } finally {
        if (!signal.aborted) setLoadingFiles(false);
      }
    }
    void refresh();
    window.addEventListener("focus", refresh);
    return () => {
      request?.abort();
      window.removeEventListener("focus", refresh);
    };
  }, [api, category, revision]);

  async function connect() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ url: string }>("/restaurant/deposits/drive/connect", { method: "POST" });
      window.location.assign(result.url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Error de conexión");
      setBusy(false);
    }
  }

  async function setup(rootFolderId?: string) {
    setBusy(true);
    setError("");
    try {
      const status = await api<DriveState>("/restaurant/deposits/drive/folders", {
        method: "POST",
        body: JSON.stringify({ rootFolderId })
      });
      setState(status);
      setShowFolderLink(false);
      setFolderLink("");
      setRevision((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Error de conexión");
    } finally {
      setBusy(false);
    }
  }

  const connected = state?.status === "connected";
  const foldersReady = Boolean(state?.rootFolderId && state.proofsFolderId && state.generalFolderId);
  const folderIds = [
    { label: "Carpeta raíz", id: state?.rootFolderId },
    { label: "Comprobantes", id: state?.proofsFolderId },
    { label: "Archivos generales", id: state?.generalFolderId }
  ];
  const visibleFiles = files.filter((file) =>
    [file.name, file.originalName, file.request?.deposit.reservation.code, file.request?.deposit.reservation.fullName]
      .some((value) => value?.toLowerCase().includes(search.trim().toLowerCase()))
  );
  const primary = "rounded-full bg-brand-orange px-4 py-2 font-bold text-white disabled:opacity-50";
  const secondary = "rounded-full border px-4 py-2 text-sm disabled:opacity-50";

  return (
    <div className="space-y-4 rounded-2xl border p-5">
      <h2 className="text-lg font-bold">Google Drive del restaurante</h2>
      <p>{!state ? "Consultando conexión…" : state.demo ? "Simulación de cuenta demo" : connected
        ? foldersReady ? "Conectado · Carpeta configurada" : "Conectado · Falta configurar la carpeta"
        : state.status === "reconnect_required" ? "Requiere reconexión" : "Sin conexión"}</p>
      {state?.error && <p className="text-orange-800">{state.error}</p>}
      {state && (
        <div className="flex flex-wrap items-center gap-2">
          {owner && !state.demo && (
            <button type="button" disabled={busy} onClick={() => void connect()} className={connected ? secondary : primary}>
              {connected || state.status === "reconnect_required" ? "Reconectar Google" : "Conectar Google"}
            </button>
          )}
          {owner && (connected || state.demo) && !foldersReady && (
            <button type="button" disabled={busy} onClick={() => void setup()} className={primary}>
              {busy ? "Configurando…" : "Configurar carpeta Foodie"}
            </button>
          )}
          {connected && foldersReady && !state.demo && (
            <a className={primary} href={`https://drive.google.com/drive/folders/${encodeURIComponent(state.rootFolderId!)}`} target="_blank" rel="noreferrer">
              Abrir carpeta en Drive
            </a>
          )}
          {owner && connected && !state.demo && (
            <button type="button" className={secondary} disabled={busy} aria-expanded={showFolderLink} onClick={() => setShowFolderLink(!showFolderLink)}>
              {showFolderLink ? "Cancelar" : foldersReady ? "Cambiar carpeta" : "Usar una carpeta existente"}
            </button>
          )}
        </div>
      )}
      {owner && connected && showFolderLink && (
        <form className="space-y-2" onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          const id = driveFolderId(folderLink);
          if (!id) {
            setError("Pegá el enlace de una carpeta de Google Drive.");
            return;
          }
          void setup(id);
        }}>
          <label htmlFor="drive-folder-link" className="block text-sm font-semibold">Enlace de la carpeta del restaurante</label>
          <div className="flex flex-wrap gap-2">
            <input id="drive-folder-link" type="url" required className="foodie-input w-full sm:max-w-md" placeholder="https://drive.google.com/drive/folders/…" value={folderLink} onChange={(event) => setFolderLink(event.target.value)} />
            <button type="submit" disabled={busy} className={primary}>Guardar carpeta</button>
          </div>
        </form>
      )}
      {owner && connected && foldersReady && !state?.demo && (
        <div className="space-y-2 rounded-xl border border-brand-line p-3">
          <h3 className="text-sm font-semibold">IDs de carpetas</h3>
          <dl className="divide-y divide-brand-line">
            {folderIds.map(({ label, id }) => id && (
              <div key={label} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <dt className="text-sm font-semibold">{label}</dt>
                  <dd className="break-all font-mono text-xs text-neutral-600">{id}</dd>
                </div>
                <button type="button" className={secondary} aria-label={`Copiar ID de ${label}`} onClick={async () => {
                  setCopyMessage("");
                  try {
                    await navigator.clipboard.writeText(id);
                    setCopyMessage(`ID de ${label} copiado.`);
                  } catch {
                    setCopyMessage("Seleccioná el ID para copiarlo manualmente.");
                  }
                }}>Copiar ID</button>
              </div>
            ))}
          </dl>
          <p role="status" className="text-sm">{copyMessage}</p>
        </div>
      )}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <select className="foodie-input max-w-xs" aria-label="Tipo de archivo" value={category} onChange={(event) => {
          if (event.target.value !== category) {
            setLoadingFiles(true);
            setCategory(event.target.value);
          }
        }}>
          <option value="proofs">Comprobantes</option>
          <option value="general">Archivos generales</option>
        </select>
        <input className="foodie-input max-w-md" aria-label="Buscar archivos" placeholder="Buscar archivo, cliente o código" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      {loadError && <p role="alert" className="text-red-700">{loadError}</p>}
      {loadingFiles && <p role="status" className="text-sm">Cargando archivos…</p>}
      {!loadingFiles && !loadError && visibleFiles.length === 0 && (
        <p className="text-sm text-neutral-600">{category === "general" && !state?.generalFolderId
          ? "Configurá la carpeta de Drive para ver los archivos generales."
          : search.trim() ? "No se encontraron archivos." : "Todavía no hay archivos en esta sección."}</p>
      )}
      {!loadingFiles && !loadError && visibleFiles.map((file) => (
        <div key={file.id} className="rounded-xl border p-3 text-sm">
          <strong>{file.originalName || file.name}</strong>
          {file.request && <p>{file.request.deposit.reservation.fullName} · Reserva {file.request.deposit.reservation.code}</p>}
          {file.receivedAt && <p>{new Date(file.receivedAt).toLocaleString("es-AR")}</p>}
          {category === "proofs" && <p>{file.driveStatus === "synced" ? "Sincronizado" : file.driveStatus === "simulated" ? "Simulado" : "Pendiente de sincronizar"}</p>}
          {(file.driveFileUrl || file.webViewLink) && <a href={file.driveFileUrl || file.webViewLink} target="_blank" rel="noreferrer" className="font-bold text-brand-orange">Abrir en Drive</a>}
        </div>
      ))}
    </div>
  );
}
