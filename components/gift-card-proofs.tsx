"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Maximize2, Minimize2, Minus, Plus, RotateCw } from "lucide-react";
import { useDepositApi } from "./deposits/deposits-panel";
import { useWorkspace } from "./workspace-provider";
import { moduleEnabled } from "../lib/restaurant-features";
import { ListPagination } from "./deposits/list-pagination";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/v1";
const button = "rounded-full border border-brand-line px-3 py-1.5 text-sm font-semibold disabled:opacity-50";
type GiftCardDeliveryState = { ready: boolean; channelConfigured: boolean; routeConfigured?: boolean; sent: number; total: number };
type GiftCardProof = {
  id: string; name: string; mimeType: string; createdTime: string;
  order: { id: string; purchaserName: string; amount: string | number; currency: string; status: string; paymentStatus: string; product?: { name: string } | null; delivery?: GiftCardDeliveryState };
};

export function useGiftCardProofs(query: string, enabled: boolean, refreshKey = 0) {
  const api = useDepositApi();
  const [paging, setPaging] = useState<{ query: string; tokens: string[] }>({ query, tokens: [] });
  const tokens = paging.query === query ? paging.tokens : [];
  const pageToken = tokens.at(-1);
  type Result = { items: GiftCardProof[]; nextPageToken: string | null };
  const [loaded, setLoaded] = useState<{ query: string; pageToken?: string; result: Result } | null>(null);
  const result = loaded?.query === query && loaded.pageToken === pageToken ? loaded.result : null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision(value => value + 1);
  useEffect(() => {
    if (!enabled) return;
    let controller: AbortController;
    function load() {
      controller?.abort();
      controller = new AbortController();
      const { signal } = controller;
      setLoading(true);
      setError("");
      const params = new URLSearchParams(query);
      if (pageToken) params.set("pageToken", pageToken);
      void api<Result>(`/restaurant/gift-cards/proofs/history?${params}`, { signal })
        .then(data => { if (!signal.aborted) setLoaded({ query, pageToken, result: data }); })
        .catch((reason: Error) => { if (!signal.aborted) setError(reason.message); })
        .finally(() => { if (!signal.aborted) setLoading(false); });
    }
    load();
    window.addEventListener("focus", load);
    return () => { controller?.abort(); window.removeEventListener("focus", load); };
  }, [api, enabled, query, pageToken, refreshKey, revision]);
  return {
    proofs: result?.items ?? [], loading: loading || (!result && !error), error, refresh, page: tokens.length + 1,
    hasNext: Boolean(result?.nextPageToken) && !error,
    onPrevious: () => setPaging({ query, tokens: tokens.slice(0, -1) }),
    onNext: () => {
      if (result?.nextPageToken) setPaging({ query, tokens: [...tokens, result.nextPageToken] });
    }
  };
}

export function GiftCardProofHistory({ refreshKey, query }: { refreshKey: number; query: string }) {
  const { bootstrap, currentUser } = useWorkspace();
  const enabled = currentUser?.role === "restaurant_owner" && moduleEnabled(bootstrap, "giftCards");
  const { proofs, loading, error, refresh, ...pagination } = useGiftCardProofs(query, enabled, refreshKey);
  if (!enabled) return null;
  return <section className="space-y-2">
    <h3 className="text-sm font-bold">Gift Cards</h3>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p>
      : loading ? <p role="status" className="text-sm text-neutral-600">Cargando comprobantes…</p>
      : proofs.length ? <GiftCardProofList proofs={proofs} onReviewed={refresh} showSend />
      : <p className="text-sm text-neutral-600">{pagination.hasNext ? "No hay coincidencias en esta página. Podés buscar entre los comprobantes más antiguos."
        : query ? "No hay comprobantes de Gift Cards para estos filtros." : pagination.page > 1
          ? "No hay comprobantes de Gift Cards en esta página." : "Todavía no hay comprobantes de Gift Cards."}</p>}
    <ListPagination {...pagination} loading={loading} />
  </section>;
}

export function GiftCardProofList({ proofs, onReviewed, onDelivered, showType = false, showSend = false }: {
  proofs: GiftCardProof[]; onReviewed: () => void; onDelivered?: () => void; showType?: boolean; showSend?: boolean;
}) {
  const [selected, setSelected] = useState<GiftCardProof | null>(null);
  const [notice, setNotice] = useState("");
  return <>
    <ul className="space-y-2">
      {proofs.map((proof, index) => <li key={proof.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#FFF6EF] px-3 py-2 text-sm">
        <div>
          <p className="font-bold">{showType && proof.order.product?.name ? "Gift Card · " : ""}{proof.order.product?.name || "Gift Card"} · {proof.order.purchaserName}</p>
          <p className="text-neutral-600">{formatAmount(proof.order)} · {paymentLabel(proof.order)} · {new Date(proof.createdTime).toLocaleString("es-AR")}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" className={`${button} bg-white`} onClick={() => { setNotice(""); setSelected(proof); }}>
            {canReview(proof.order) ? "Revisar comprobante" : "Ver comprobante"}
          </button>
          {showSend && proof.order.paymentStatus === "CONFIRMED" && proof.order.status === "PAID"
            && proofs.findIndex(item => item.order.id === proof.order.id) === index && proof.order.delivery
            && <GiftCardDelivery orderId={proof.order.id} delivery={proof.order.delivery} onDelivered={onDelivered} />}
        </div>
      </li>)}
    </ul>
    {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    {selected && <GiftCardProofDialog proof={selected} onClose={() => setSelected(null)} onReviewed={approved => {
      setSelected(null);
      setNotice(approved ? "Pago aprobado. La Gift Card está disponible para enviar." : "Pago rechazado y orden cancelada.");
      onReviewed();
    }} />}
  </>;
}

function GiftCardDelivery({ orderId, delivery, onDelivered }: {
  orderId: string; delivery: GiftCardDeliveryState; onDelivered?: () => void;
}) {
  const api = useDepositApi();
  const inFlight = useRef(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(0);
  const [error, setError] = useState("");
  const sentCount = Math.max(sent, delivery.sent);
  const canSend = delivery.channelConfigured && delivery.routeConfigured !== false;

  async function send() {
    if (inFlight.current || !canSend || sentCount >= delivery.total) return;
    inFlight.current = true;
    setSending(true);
    setError("");
    try {
      const result = await api<{ sent: boolean; sentCount: number; totalCount: number; reason?: string | null }>(
        `/restaurant/gift-cards/orders/${encodeURIComponent(orderId)}/send`, { method: "POST", body: JSON.stringify({ resend: false }) }
      );
      setSent(result.sentCount);
      if (result.sentCount > sentCount) onDelivered?.();
      if (!result.sent) setError(result.reason === "OUTSIDE_24H_WINDOW"
        ? "El cliente tiene que volver a escribir por WhatsApp antes de reintentar."
        : `${result.sentCount} de ${result.totalCount} enviadas. Podés reintentar las pendientes.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo enviar la Gift Card.");
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  if (!delivery.ready) return null;
  if (sentCount >= delivery.total) return <span role="status" className="text-sm font-semibold text-emerald-700">Enviada por WhatsApp</span>;
  return <div className="space-y-1">
    <button type="button" className={`${button} bg-brand-orange text-white`} disabled={sending || !canSend} onClick={() => void send()}>
      {sending ? "Enviando…" : sentCount > 0 ? "Enviar Gift Cards pendientes" : "Enviar Gift Card"}
    </button>
    {!delivery.channelConfigured && <p className="text-xs text-neutral-600">Configurá el canal de WhatsApp para enviar.</p>}
    {delivery.channelConfigured && !canSend && <p className="text-xs text-neutral-600">Falta configurar el envío para este canal de WhatsApp.</p>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}

function canReview(order: GiftCardProof["order"]) {
  return order.paymentStatus === "PENDING" && order.status === "PENDING_PAYMENT";
}

function paymentLabel(order: GiftCardProof["order"]) {
  if (order.paymentStatus === "CONFIRMED") return "Pago aprobado";
  if (order.paymentStatus === "REJECTED") return "Pago rechazado";
  return canReview(order) ? "Pendiente de revisión" : "Orden cancelada";
}

function formatAmount(order: GiftCardProof["order"]) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: order.currency }).format(Number(order.amount));
}

function ReceiptPreview({ url, name, mimeType, expanded, onExpand }: {
  url: string; name: string; mimeType: string; expanded: boolean; onExpand: () => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [viewSize, setViewSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const isImage = mimeType.startsWith("image/");
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setViewSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isImage]);

  const sideways = rotation % 180 !== 0;
  const rotatedWidth = sideways ? imageSize.height : imageSize.width;
  const rotatedHeight = sideways ? imageSize.width : imageSize.height;
  const ready = Boolean(rotatedWidth && rotatedHeight && viewSize.width && viewSize.height);
  const fit = ready ? Math.min(viewSize.width / rotatedWidth, viewSize.height / rotatedHeight) : 0;
  const scale = fit * zoom / 100;
  const height = expanded ? "h-[min(68dvh,800px)]" : "h-[min(53dvh,580px)]";
  const control = `${button} inline-flex items-center justify-center gap-1.5 bg-white`;

  return <div className="space-y-2">
    <div role="group" aria-label="Controles del visor" className="flex flex-wrap items-center gap-1.5">
      {isImage && <>
        <button type="button" className={control} aria-label="Reducir zoom" disabled={!ready || zoom <= 100} onClick={() => setZoom(value => Math.max(100, value - 25))}><Minus className="h-4 w-4" aria-hidden="true" /></button>
        <output aria-live="polite" aria-label="Zoom respecto al ajuste" className="min-w-12 text-center text-sm font-semibold tabular-nums">{zoom}%</output>
        <button type="button" className={control} aria-label="Aumentar zoom" disabled={!ready || zoom >= 400} onClick={() => setZoom(value => Math.min(400, value + 25))}><Plus className="h-4 w-4" aria-hidden="true" /></button>
        <button type="button" className={control} disabled={!ready || zoom === 100} onClick={() => setZoom(100)}>Ajustar</button>
        <button type="button" className={control} disabled={!ready} onClick={() => setRotation(value => (value + 90) % 360)}><RotateCw className="h-4 w-4" aria-hidden="true" />Girar</button>
      </>}
      <button type="button" className={control} aria-pressed={expanded} onClick={onExpand}>
        {expanded ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
        {expanded ? "Reducir visor" : "Ampliar visor"}
      </button>
      <a className={control} href={url} download={name}><Download className="h-4 w-4" aria-hidden="true" />Descargar</a>
    </div>
    {isImage ? <div ref={viewport} role="region" aria-label="Vista del comprobante" tabIndex={0} className={`${height} overflow-auto rounded-xl bg-neutral-100`}>
      <div className="relative" style={{ width: Math.max(viewSize.width, Math.round(rotatedWidth * scale)), height: Math.max(viewSize.height, Math.round(rotatedHeight * scale)) }}>
        {/* The preview is a private blob URL supplied by the authenticated request. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Comprobante de Gift Card" draggable={false} onLoad={event => {
          const image = event.currentTarget;
          setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
        }} className="absolute left-1/2 top-1/2 max-w-none" style={{
          width: imageSize.width * scale,
          height: imageSize.height * scale,
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`
        }} />
      </div>
    </div> : <iframe src={url} title="Vista del comprobante" className={`${height} w-full rounded-xl bg-neutral-100`} />}
  </div>;
}

function GiftCardProofDialog({ proof, onClose, onReviewed }: {
  proof: GiftCardProof; onClose: () => void; onReviewed: (approved: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const api = useDepositApi();
  const { token } = useWorkspace();
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const orderPath = `/restaurant/gift-cards/orders/${encodeURIComponent(proof.order.id)}`;
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    void fetch(`${API_URL}${orderPath}/proofs/${encodeURIComponent(proof.id)}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal
    }).then(response => {
      if (!response.ok) throw new Error("No se pudo abrir el comprobante.");
      return response.blob();
    }).then(blob => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob);
      setPreview(url);
    }).catch((failure: Error) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [orderPath, proof.id, token]);

  async function review() {
    if (!decision || busy || !preview) return;
    const approved = decision === "approve";
    setBusy(true);
    setError("");
    try {
      await api(`${orderPath}/payment`, { method: "POST", body: JSON.stringify({ approved, reference: approved ? undefined : reason.trim() }) });
      onReviewed(approved);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo guardar la revisión.");
    } finally {
      setBusy(false);
    }
  }

  return <dialog ref={dialog} aria-label="Revisar comprobante de Gift Card" className={`${expanded ? "w-[96vw]" : "w-[min(92vw,860px)]"} max-h-[95dvh] max-w-none rounded-2xl bg-white p-4 backdrop:bg-black/60`} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="mb-3 flex items-start justify-between gap-3">
      <div><h2 className="text-lg font-bold">Comprobante de Gift Card</h2><p className="text-sm text-neutral-600">{proof.order.purchaserName} · {formatAmount(proof.order)} · {paymentLabel(proof.order)}</p></div>
      <button type="button" className={button} disabled={busy} onClick={onClose}>Cerrar</button>
    </div>
    {preview ? <ReceiptPreview key={preview} url={preview} name={proof.name} mimeType={proof.mimeType} expanded={expanded} onExpand={() => setExpanded(value => !value)} />
      : !error && <p role="status" className="py-8 text-sm">Cargando comprobante…</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {preview && canReview(proof.order) && <div className="mt-3 space-y-2">
      {decision ? <>
        <p className="text-sm">{decision === "approve" ? "Al aprobar el pago, se emite la Gift Card." : "Al rechazar el pago, se cancela la orden."}</p>
        {decision === "reject" && <label className="block text-sm">Motivo (opcional)<input className="foodie-input" value={reason} maxLength={250} onChange={event => setReason(event.target.value)} /></label>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} className={`${button} ${decision === "approve" ? "bg-emerald-700" : "bg-red-700"} text-white`} onClick={() => void review()}>{busy ? "Guardando…" : decision === "approve" ? "Confirmar aprobación" : "Confirmar rechazo"}</button>
          <button type="button" disabled={busy} className={button} onClick={() => setDecision(null)}>Volver</button>
        </div>
      </> : <div className="flex flex-wrap gap-2">
        <button type="button" className={`${button} bg-emerald-700 text-white`} onClick={() => setDecision("approve")}>Aprobar pago</button>
        <button type="button" className={`${button} text-red-700`} onClick={() => setDecision("reject")}>Rechazar pago</button>
      </div>}
    </div>}
  </dialog>;
}
