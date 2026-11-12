"use client";

import { useEffect, useRef, useState } from "react";
import { useDepositApi } from "./deposits/deposits-panel";
import { useWorkspace } from "./workspace-provider";
import { moduleEnabled } from "../lib/restaurant-features";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/v1";
const button = "rounded-full border border-brand-line px-3 py-1.5 text-sm font-semibold disabled:opacity-50";
type GiftCardProof = {
  id: string; name: string; mimeType: string; createdTime: string;
  order: { id: string; purchaserName: string; amount: string | number; currency: string; status: string; paymentStatus: string; product?: { name: string } | null };
};

export function useGiftCardProofs(query: string, enabled: boolean) {
  const api = useDepositApi();
  const [proofs, setProofs] = useState<GiftCardProof[]>([]);
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
      void api<GiftCardProof[]>(`/restaurant/gift-cards/proofs${query}`, { signal })
        .then(data => { if (!signal.aborted) setProofs(data); })
        .catch((reason: Error) => { if (!signal.aborted) setError(reason.message); })
        .finally(() => { if (!signal.aborted) setLoading(false); });
    }
    setProofs([]);
    load();
    window.addEventListener("focus", load);
    return () => { controller?.abort(); window.removeEventListener("focus", load); };
  }, [api, enabled, query, revision]);
  return { proofs, loading, error, refresh };
}

export function GiftCardProofsPanel({ phone }: { phone?: string }) {
  const { bootstrap, currentUser } = useWorkspace();
  const enabled = currentUser?.role === "restaurant_owner" && moduleEnabled(bootstrap, "giftCards");
  const query = phone ? `?phone=${encodeURIComponent(phone)}` : "";
  const { proofs, loading, error, refresh } = useGiftCardProofs(query, enabled);
  if (!enabled) return null;
  return <section className="space-y-2 rounded-2xl border border-brand-line bg-white p-3">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-bold">Comprobantes de Gift Cards</h2>
      <button type="button" className={button} disabled={loading} onClick={refresh}>Actualizar</button>
    </div>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p>
      : loading ? <p role="status" className="text-sm text-neutral-600">Cargando comprobantes…</p>
      : proofs.length ? <GiftCardProofList proofs={proofs} onReviewed={refresh} />
      : <p className="text-sm text-neutral-600">{phone ? "Este contacto todavía no tiene comprobantes de Gift Cards." : "No hay comprobantes de Gift Cards pendientes."}</p>}
  </section>;
}

export function GiftCardProofList({ proofs, onReviewed }: { proofs: GiftCardProof[]; onReviewed: () => void }) {
  const [selected, setSelected] = useState<GiftCardProof | null>(null);
  const [notice, setNotice] = useState("");
  return <>
    <ul className="space-y-2">
      {proofs.map(proof => <li key={proof.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#FFF6EF] px-3 py-2 text-sm">
        <div>
          <p className="font-bold">{proof.order.product?.name || "Gift Card"} · {proof.order.purchaserName}</p>
          <p className="text-neutral-600">{formatAmount(proof.order)} · {paymentLabel(proof.order)} · {new Date(proof.createdTime).toLocaleString("es-AR")}</p>
        </div>
        <button type="button" className={`${button} bg-white`} onClick={() => { setNotice(""); setSelected(proof); }}>
          {canReview(proof.order) ? "Revisar comprobante" : "Ver comprobante"}
        </button>
      </li>)}
    </ul>
    <p role="status" className="text-sm text-emerald-700">{notice}</p>
    {selected && <GiftCardProofDialog proof={selected} onClose={() => setSelected(null)} onReviewed={approved => {
      setSelected(null);
      setNotice(approved ? "Pago aprobado. La Gift Card está disponible para enviar." : "Pago rechazado y orden cancelada.");
      onReviewed();
    }} />}
  </>;
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

  return <dialog ref={dialog} aria-label="Revisar comprobante de Gift Card" className="w-[min(92vw,760px)] max-w-none rounded-2xl bg-white p-4 backdrop:bg-black/60" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="mb-3 flex items-start justify-between gap-3">
      <div><h2 className="text-lg font-bold">Comprobante de Gift Card</h2><p className="text-sm text-neutral-600">{proof.order.purchaserName} · {formatAmount(proof.order)} · {paymentLabel(proof.order)}</p></div>
      <button type="button" className={button} disabled={busy} onClick={onClose}>Cerrar</button>
    </div>
    {preview ? <iframe src={preview} title="Vista del comprobante" className="h-[min(52vh,520px)] w-full rounded-xl bg-neutral-100" />
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
