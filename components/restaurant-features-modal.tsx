"use client";
import { useEffect, useState } from "react";
import { AppModal } from "./app-modal";
import { useWorkspace } from "./workspace-provider";

type Config = { isDemo: boolean; overrides: Record<string, boolean>; enabled: Record<string, boolean>; catalog: Array<{ key: string; label: string; description: string; group: "module" | "preview"; module?: string }> };
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/v1";

export function RestaurantFeaturesModal({ restaurant, onClose }: { restaurant: { id: string; name: string }; onClose: () => void }) {
  const { token } = useWorkspace();
  const [config, setConfig] = useState<Config | null>(null);
  const [changes, setChanges] = useState<Record<string, boolean>>({});
  const [demo, setDemo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/platform/restaurants/${restaurant.id}/features`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("No se pudieron cargar los módulos"); return response.json() as Promise<Config>; })
      .then((data) => { setConfig(data); setDemo(data.isDemo); }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Error de conexión"); });
    return () => controller.abort();
  }, [restaurant.id, token]);
  async function save() {
    if (!config) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`${API_URL}/platform/restaurants/${restaurant.id}/features`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ overrides: changes, ...(demo !== config.isDemo ? { isDemo: demo } : {}) }) });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: unknown } | null;
        throw new Error(typeof body?.message === "string" ? body.message : "No se pudieron guardar los módulos. Conservamos tus cambios para reintentar.");
      }
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error de conexión"); }
    finally { setSaving(false); }
  }
  const enabled = (key: string) => changes[key] ?? config?.overrides[key] ?? config?.enabled[key] ?? false;
  return <AppModal open title={`Módulos · ${restaurant.name}`} description="Configurá qué funciones están disponibles en este restaurante." onClose={() => { if (!saving) onClose(); }} footer={<button type="button" disabled={!config || saving} onClick={() => void save()} className="rounded-full bg-brand-orange px-6 py-3 font-bold text-white disabled:opacity-50">{saving ? "Guardando…" : "Guardar"}</button>}>
    {error && <p role="alert" className="mb-4 text-red-300">{error}</p>}
    {!config ? <p>Cargando módulos…</p> : <div className="space-y-6">
      <label className="flex items-start gap-3"><input type="checkbox" checked={demo} disabled={saving} onChange={(event) => setDemo(event.target.checked)} /><span><strong>Cuenta demo</strong><span className="mt-1 block text-sm">Solo pruebas internas con datos de prueba. Se bloquean el chat externo, las integraciones y los envíos automáticos.</span></span></label>
      {(["module", "preview"] as const).map((group) => <section key={group} className="space-y-3"><h3 className="font-bold">{group === "module" ? "Módulos disponibles" : "Funciones en prueba"}</h3>
        {!config.catalog.some((item) => item.group === group) && <p className="text-sm text-neutral-300">Todavía no hay funciones en prueba disponibles.</p>}
        {config.catalog.filter((item) => item.group === group).map((item) => <label key={item.key} className="flex items-start gap-3 rounded-xl border border-white/20 p-3"><input type="checkbox" checked={enabled(item.key)} disabled={saving || Boolean(item.module && !enabled(item.module))} onChange={(event) => setChanges((values) => ({ ...values, [item.key]: event.target.checked }))} /><span><strong>{item.label}</strong><span className="block text-sm">{item.description}</span>{item.module && !enabled(item.module) && <span className="block text-sm">Requiere habilitar su módulo.</span>}</span></label>)}
      </section>)}
    </div>}
  </AppModal>;
}
