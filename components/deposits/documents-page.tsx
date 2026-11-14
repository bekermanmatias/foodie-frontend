"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useWorkspace } from "../workspace-provider";
import { WorkspaceShell } from "../workspace-shell";
import { useDepositApi } from "./deposits-panel";
import { moduleEnabled } from "../../lib/restaurant-features";
import { ListPagination } from "./list-pagination";

type DriveState = { demo: boolean; status: string; rootFolderId?: string; proofsFolderId?: string; generalFolderId?: string; error?: string };
type FileRow = { id: string; name: string; webViewLink?: string };

export function DocumentsPage({ driveConnection }: { driveConnection?: "cancelled" | "failed" }) {
  const { bootstrap, currentUser } = useWorkspace();
  const allowed = currentUser?.scope === "restaurant" && ["restaurant_owner", "restaurant_manager"].includes(currentUser.role);

  return <WorkspaceShell title="Documentos" description="Consultá los archivos generales y administrá la conexión de Google Drive del restaurante.">
    {!allowed ? <p>Solo el dueño y el gerente pueden consultar documentos.</p>
      : !moduleEnabled(bootstrap, "deposits") ? <p>Habilitá Señas y pagos para consultar los archivos del restaurante.</p>
      : <div className="space-y-4">
        {driveConnection === "cancelled" && <p role="status" className="text-sm">Cancelaste la autorización de Google.</p>}
        {driveConnection === "failed" && <p role="alert" className="text-sm text-red-700">No se pudo conectar Google Drive. Podés volver a intentarlo desde esta pantalla.</p>}
        <DocumentDrivePanel />
        <Link href="/senas" className="inline-block text-sm font-bold text-brand-orange">Ir a comprobantes y pagos</Link>
      </div>}
  </WorkspaceShell>;
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

function DocumentDrivePanel() {
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
  const [drivePages, setDrivePages] = useState<string[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const pageToken = drivePages.at(-1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
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
        if (status.status !== "connected" || !status.generalFolderId) {
          setFiles([]);
          setNextPageToken(null);
          return;
        }
        const query = new URLSearchParams({ category: "general" });
        if (appliedSearch) query.set("search", appliedSearch);
        if (pageToken) query.set("pageToken", pageToken);
        const result = await api<{ files: FileRow[]; nextPageToken?: string }>(
          `/restaurant/deposits/drive/files?${query}`, { signal }
        );
        if (!signal.aborted) {
          setFiles(result.files);
          setNextPageToken(result.nextPageToken ?? null);
        }
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
  }, [api, pageToken, revision, appliedSearch]);

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
      setDrivePages([]);
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
        <details className="space-y-2 rounded-xl border border-brand-line p-3">
          <summary className="cursor-pointer text-sm font-semibold">IDs de carpetas</summary>
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
        </details>
      )}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {connected && state?.generalFolderId && <div className="space-y-2">
        <h3 className="text-sm font-bold">Archivos generales</h3>
        <form className="flex flex-wrap gap-2" onSubmit={event => {
          event.preventDefault();
          setDrivePages([]);
          setAppliedSearch(search.trim());
        }}>
          <input className="foodie-input max-w-md" aria-label="Buscar archivos" placeholder="Nombre del archivo" maxLength={120} value={search} onChange={(event) => setSearch(event.target.value)} />
          <button type="submit" className={secondary}>Buscar</button>
        </form>
      </div>}
      <div className="space-y-2">
        {loadError && <p role="alert" className="text-red-700">{loadError}</p>}
        {loadingFiles && <p role="status" className="text-sm">Cargando archivos…</p>}
        {!loadingFiles && !loadError && files.length === 0 && (
          <p className="text-sm text-neutral-600">{state?.demo ? "Los archivos de Drive son simulados en esta cuenta."
            : !connected ? "Conectá Google Drive para consultar los archivos generales."
            : !state?.generalFolderId ? "Configurá la carpeta de Drive para ver los archivos generales."
            : appliedSearch ? "No se encontraron archivos para esta búsqueda." : "Todavía no hay archivos en esta sección."}</p>
        )}
        {!loadingFiles && !loadError && files.map((file) => (
          <div key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
            <strong>{file.name}</strong>
            {file.webViewLink && <a href={file.webViewLink} target="_blank" rel="noreferrer" className="font-bold text-brand-orange">Abrir en Drive</a>}
          </div>
        ))}
        <ListPagination page={drivePages.length + 1} hasNext={Boolean(nextPageToken) && !loadError} loading={loadingFiles}
            onPrevious={() => setDrivePages(current => current.slice(0, -1))}
            onNext={() => { if (nextPageToken) setDrivePages(current => [...current, nextPageToken]); }} />
      </div>
    </div>
  );
}
