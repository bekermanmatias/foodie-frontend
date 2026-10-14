"use client";

import { useEffect, useState } from "react";
import type { Reservation, ReservationTableAvailability, ReservationUpdateInput } from "../lib/types";
import { AppModal } from "./app-modal";
import { FoodieSelect } from "./foodie-select";
import { useWorkspace } from "./workspace-provider";

export function ReservationEditModal({ reservation, onClose, onComplete }: {
  reservation: Reservation | null; onClose: () => void; onComplete?: (updated: Reservation) => void;
}) {
  const { bootstrap, updateReservation, loadReservationTableAvailability } = useWorkspace();
  const [draft, setDraft] = useState<ReservationUpdateInput | null>(null);
  const [availability, setAvailability] = useState<ReservationTableAvailability | null>(null);
  const [automatic, setAutomatic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [availabilityError, setAvailabilityError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setDraft(reservation ? {
      fullName: reservation.fullName, phone: reservation.phone, email: reservation.email || "",
      partySize: reservation.partySize, serviceDate: reservation.serviceDate.slice(0, 10),
      serviceTime: reservation.serviceTime, notes: reservation.notes || "", roomId: reservation.room.id,
      tableIds: reservation.tables.map((item) => item.table.id)
    } : null);
    setAutomatic(false);
    setAvailability(null);
    setError("");
  }, [reservation]);

  useEffect(() => {
    if (!reservation || !draft?.roomId || !draft.serviceDate || !draft.serviceTime || !Number.isInteger(draft.partySize) || draft.partySize < 1) {
      setAvailability(null);
      return;
    }
    let active = true;
    setAvailability(null);
    setAvailabilityError("");
    setLoading(true);
    loadReservationTableAvailability(reservation.id, draft.roomId, [], {
      serviceDate: draft.serviceDate, serviceTime: draft.serviceTime, partySize: draft.partySize
    }).then((result) => { if (active) setAvailability(result); })
      .catch((err) => { if (active) setAvailabilityError(err instanceof Error ? err.message : "No se pudo consultar la disponibilidad."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reservation?.id, draft?.roomId, draft?.serviceDate, draft?.serviceTime, draft?.partySize, retry]);

  const branch = bootstrap?.branches.find((item) => item.id === reservation?.branch?.id || item.rooms.some((room) => room.id === reservation?.room.id));
  const selectedTables = availability?.tables.filter((table) => draft?.tableIds?.includes(table.id)) || [];
  const capacity = selectedTables.reduce((total, table) => total + table.seats, 0);
  const validTables = Boolean(draft?.tableIds?.length && selectedTables.length === draft.tableIds.length && selectedTables.every((table) => table.isAvailable) && capacity >= draft.partySize);
  const canSave = Boolean(draft && availability?.isBookable && (automatic || validTables) && !loading && !saving);

  function change<K extends keyof ReservationUpdateInput>(key: K, value: ReservationUpdateInput[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  async function save() {
    if (!reservation || !draft || !canSave) return;
    setError("");
    if (draft.fullName.trim().length < 2 || draft.phone.trim().length < 2) {
      setError("Completá nombre y teléfono con al menos dos caracteres."); return;
    }
    if (draft.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
      setError("Ingresá un email válido."); return;
    }
    setSaving(true);
    try {
      const updated = await updateReservation(reservation.id, {
        ...draft, fullName: draft.fullName.trim(), phone: draft.phone.trim(),
        email: draft.email?.trim() || null, notes: draft.notes?.trim() ? draft.notes : null,
        tableIds: automatic ? undefined : draft.tableIds
      });
      onComplete?.(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la reserva.");
    } finally { setSaving(false); }
  }

  const inputClass = "w-full rounded-2xl border border-brand-line bg-white px-4 py-3 outline-none focus:border-brand-orange";
  return <AppModal open={Boolean(reservation)} onClose={saving ? () => undefined : onClose} title="Editar reserva" description={reservation?.code} widthClassName="max-w-3xl" footer={<>
    <button type="button" disabled={saving} onClick={onClose} className="flex-1 rounded-full border border-brand-line bg-white px-4 py-3 text-sm font-medium text-brand-ink disabled:opacity-60">Cancelar</button>
    <button type="button" disabled={!canSave} onClick={() => void save()} className="flex-1 rounded-full bg-brand-orange px-4 py-3 text-sm font-medium text-white disabled:opacity-60">{saving ? "Guardando..." : "Guardar cambios"}</button>
  </>}>
    {draft ? <fieldset disabled={saving} className="space-y-4 text-sm text-white">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2"><span className="block font-medium">Nombre del cliente</span><input value={draft.fullName} onChange={(e) => change("fullName", e.target.value)} className={inputClass} /></label>
        <label className="space-y-2"><span className="block font-medium">Teléfono</span><input type="tel" value={draft.phone} onChange={(e) => change("phone", e.target.value)} className={inputClass} /></label>
        <label className="space-y-2"><span className="block font-medium">Email</span><input type="email" value={draft.email || ""} onChange={(e) => change("email", e.target.value)} className={inputClass} /></label>
        <label className="space-y-2"><span className="block font-medium">Comensales</span><input type="number" min={1} step={1} value={draft.partySize || ""} onChange={(e) => change("partySize", Number(e.target.value))} className={inputClass} /></label>
        <label className="space-y-2"><span className="block font-medium">Fecha</span><input type="date" value={draft.serviceDate} onChange={(e) => change("serviceDate", e.target.value)} className={inputClass} /></label>
        <label className="space-y-2"><span className="block font-medium">Horario</span><input type="time" value={draft.serviceTime} onChange={(e) => change("serviceTime", e.target.value)} className={inputClass} /></label>
        <label className="space-y-2 md:col-span-2"><span className="block font-medium">Notas</span><textarea rows={3} maxLength={1000} value={draft.notes || ""} onChange={(e) => change("notes", e.target.value)} className={inputClass} /></label>
        <label className="space-y-2 md:col-span-2"><span className="block font-medium">Salón</span><FoodieSelect value={draft.roomId} onChange={(e) => setDraft((current) => current ? { ...current, roomId: e.target.value, tableIds: [] } : current)}>{branch?.rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</FoodieSelect></label>
      </div>
      <label className="flex items-center gap-2"><input type="checkbox" checked={automatic} onChange={(e) => setAutomatic(e.target.checked)} className="accent-[#FF5A1F]" />Asignar mesas automáticamente al guardar</label>
      {loading ? <p>Consultando disponibilidad...</p> : null}
      {availabilityError ? <p role="alert" className="text-red-200">{availabilityError} <button type="button" onClick={() => setRetry((current) => current + 1)} className="underline">Reintentar</button></p> : null}
      {availability && !availability.isBookable ? <p role="alert" className="text-amber-200">{availability.unavailableReason}</p> : null}
      {!automatic && availability?.isBookable ? <>
        <p className="text-white/80">Seleccioná una o más mesas. Capacidad: {capacity} de {draft.partySize} cubiertos.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{availability.tables.map((table) => {
          const selected = draft.tableIds?.includes(table.id);
          return <button key={table.id} type="button" disabled={!table.isAvailable} title={table.unavailableReason || undefined} onClick={() => change("tableIds", selected ? draft.tableIds?.filter((id) => id !== table.id) : [...(draft.tableIds || []), table.id])} className={`rounded-xl border px-3 py-3 text-left ${!table.isAvailable ? "border-neutral-200 bg-neutral-100 text-neutral-400" : selected ? "border-brand-orange bg-[#FFF4ED] text-brand-ink" : "border-brand-line bg-white text-brand-ink"}`}><span className="block font-semibold">Mesa {table.label}</span><span className="text-xs">{table.seats} cubiertos{!table.isAvailable ? " · No disponible" : ""}</span></button>;
        })}</div>
        {!validTables ? <p className="text-amber-200">Elegí mesas disponibles con capacidad suficiente o activá la asignación automática.</p> : null}
      </> : null}
      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">{error}</p> : null}
    </fieldset> : null}
  </AppModal>;
}
