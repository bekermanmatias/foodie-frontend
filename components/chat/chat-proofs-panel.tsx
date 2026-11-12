"use client";

import { useState } from "react";
import { DepositsPanel, type DepositPanelState } from "../deposits/deposits-panel";
import { GiftCardProofList, useGiftCardProofs } from "../gift-card-proofs";

export function ChatProofsPanel({ phone, showDeposits, showGiftCards }: {
  phone: string; showDeposits: boolean; showGiftCards: boolean;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [depositState, setDepositState] = useState<DepositPanelState>("loading");
  const { proofs, loading, error, refresh } = useGiftCardProofs(`?phone=${encodeURIComponent(phone)}`, showGiftCards);
  const hasContent = (showGiftCards && (proofs.length > 0 || Boolean(error))) || (showDeposits && depositState === "visible");
  const pending = (showGiftCards && loading) || (showDeposits && depositState === "loading");

  return <section id="chat-proofs-panel" aria-label="Comprobantes del contacto" className="max-h-[40vh] shrink-0 space-y-2 overflow-auto border-b border-brand-line bg-[#FFFCF8] px-3 py-2">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-bold">Comprobantes</h2>
      <button type="button" className="rounded-full border border-brand-line bg-white px-3 py-1.5 text-xs font-semibold" onClick={() => {
        if (showGiftCards) refresh();
        if (showDeposits) setRefreshKey(value => value + 1);
      }}>Actualizar</button>
    </div>
    {showGiftCards && error && <p role="alert" className="text-sm text-red-700">No se pudieron cargar los comprobantes de Gift Cards. {error}</p>}
    {showGiftCards && proofs.length > 0 && <GiftCardProofList proofs={proofs} onReviewed={refresh} showType />}
    {showDeposits && <DepositsPanel phone={phone} compact refreshKey={refreshKey} onPanelState={setDepositState} />}
    {!hasContent && <p role="status" className="text-sm text-neutral-600">
      {pending ? "Cargando comprobantes…" : "Este contacto todavía no tiene comprobantes."}
    </p>}
  </section>;
}
