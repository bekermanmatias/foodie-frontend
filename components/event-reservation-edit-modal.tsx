"use client";

import { useEffect, useMemo, useState } from "react";
import type { Reservation } from "../lib/types";
import { AppModal } from "./app-modal";
import { FoodieSelect } from "./foodie-select";
import { totalTableCapacity } from "../lib/table-capacity";
import { useWorkspace } from "./workspace-provider";

type EventReservationEditModalProps = { reservation: Reservation | null; onClose: () => void; onComplete?: () => void };

type EventRoomDraft = { roomId: string; allocatedCovers: string; usage: "partial" | "full" };

export function EventReservationEditModal({ reservation, onClose, onComplete }: EventReservationEditModalProps) {
  const { bootstrap, updateEventReservation } = useWorkspace();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [partySize, setPartySize] = useState("1");
  const [serviceDate, setServiceDate] = useState("");
  const [serviceTime, setServiceTime] = useState("");
  const [rooms, setRooms] = useState<EventRoomDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!reservation) return;
    setFullName(reservation.fullName);
    setPhone(reservation.phone);
    setEmail(reservation.email || "");
    setNotes(reservation.notes || "");
    setPartySize(String(reservation.partySize));
    setServiceDate(reservation.serviceDate.slice(0, 10));
    setServiceTime(reservation.serviceTime);
    setRooms((reservation.eventRoomAssignments || []).map((assignment) => ({
      roomId: assignment.roomId,
      allocatedCovers: String(assignment.allocatedCovers),
      usage: assignment.usage
    })));
    setError("");
  }, [reservation?.id]);

  const branch = useMemo(() => {
    if (!reservation || !bootstrap) return null;
    return bootstrap.branches.find((item) => item.id === reservation.branch?.id)
      || bootstrap.branches.find((item) => item.rooms.some((room) => room.id === reservation.room.id))
      || null;
  }, [bootstrap, reservation?.id]);

  const allocatedCovers = rooms.reduce((total, room) => total + (Number(room.allocatedCovers) || 0), 0);
  const totalCovers = Number(partySize) || 0;
  const distributionStatus = allocatedCovers === totalCovers ? "complete" : allocatedCovers > totalCovers ? "exceeded" : "pending";

  async function save() {
    if (!reservation || saving) return;
    setError("");
    if (!fullName.trim() || !phone.trim()) {
      setError("Completa nombre y telefono del evento.");
      return;
    }
    const size = Number(partySize);
    if (!Number.isInteger(size) || size < 1) {
      setError("Ingresa una cantidad valida de comensales.");
      return;
    }
    if (!serviceDate) {
      setError("Ingresa la fecha del evento.");
      return;
    }
    if (!serviceTime) {
      setError("Ingresa el horario del evento.");
      return;
    }
    if (!rooms.length) {
      setError("Elegí al menos un salón para el evento.");
      return;
    }
    if (allocatedCovers !== size) {
      setError("Los cubiertos distribuidos entre salones deben coincidir con el total del evento.");
      return;
    }

    setSaving(true);
    try {
      await updateEventReservation(reservation.id, {
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() ? email.trim() : null,
        notes: notes.trim() ? notes : null,
        partySize: size,
        serviceDate,
        serviceTime,
        rooms: rooms.map((room) => ({ roomId: room.roomId, allocatedCovers: Number(room.allocatedCovers), usage: room.usage }))
      });
      onComplete?.();
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo actualizar el evento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal
      open={Boolean(reservation)}
      onClose={saving ? () => undefined : onClose}
      title="Editar evento"
      description={reservation ? `${reservation.fullName} · ${reservation.code}` : ""}
      widthClassName="max-w-2xl"
      footer={
        <>
          <button type="button" disabled={saving} onClick={onClose} className="flex-1 rounded-full border border-brand-line px-4 py-3 text-sm font-medium text-brand-ink disabled:opacity-60">
            Cancelar
          </button>
          <button type="button" disabled={saving || distributionStatus !== "complete"} onClick={() => void save()} className="flex-1 rounded-full bg-brand-orange px-4 py-3 text-sm font-medium text-white disabled:opacity-60">
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm text-brand-ink">
          <span className="font-medium">Nombre del cliente</span>
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Ej: Graciela Guzman"
            className="w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange"
          />
        </label>
        <label className="space-y-2 text-sm text-brand-ink">
          <span className="font-medium">Telefono</span>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Ej: 5492213800680"
            className="w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange"
          />
        </label>
        <label className="space-y-2 text-sm text-brand-ink">
          <span className="font-medium">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Ej: cliente@email.com"
            className="w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange"
          />
        </label>
        <label className="space-y-2 text-sm text-brand-ink">
          <span className="font-medium">Comensales</span>
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={partySize}
            onChange={(event) => setPartySize(event.target.value)}
            placeholder="Ej: 4"
            className="w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange"
          />
        </label>
        <label className="space-y-2 text-sm text-brand-ink">
          <span className="font-medium">Fecha del evento</span>
          <input
            type="date"
            value={serviceDate}
            onChange={(event) => setServiceDate(event.target.value)}
            className="w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange"
          />
        </label>
        <label className="space-y-2 text-sm text-brand-ink">
          <span className="font-medium">Horario</span>
          <input
            type="time"
            value={serviceTime}
            onChange={(event) => setServiceTime(event.target.value)}
            className="w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange"
          />
        </label>
        <label className="space-y-2 text-sm text-brand-ink md:col-span-2">
          <span className="font-medium">Notas</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            placeholder="Notas internas del evento"
            className="w-full resize-none rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange"
          />
        </label>
      </div>

      <div className="mt-4 space-y-4 rounded-2xl border border-brand-orange bg-[#FFF9F5] p-4 text-sm text-brand-ink">
        <div className="flex flex-col items-stretch justify-between gap-3 md:flex-row md:items-start">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-brand-ink">Salones del evento</p>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-neutral-700">Seleccioná los salones y distribuí manualmente los cubiertos. Cada salón elegido queda bloqueado para reservas normales en este servicio.</p>
          </div>
          <div className={`w-full rounded-xl border px-3 py-2 text-left md:w-auto md:min-w-[190px] md:text-right ${distributionStatus === "complete" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : distributionStatus === "exceeded" ? "border-red-300 bg-red-50 text-red-800" : "border-brand-line bg-white text-brand-ink"}`}>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em]">Distribución de cubiertos</p>
            <p className="mt-0.5 text-sm font-bold">{allocatedCovers} de {totalCovers} asignados</p>
            <p className="mt-0.5 text-[11px] font-medium">{distributionStatus === "complete" ? "Distribución completa" : distributionStatus === "exceeded" ? `Excede por ${allocatedCovers - totalCovers}` : `Faltan ${totalCovers - allocatedCovers}`}</p>
          </div>
        </div>
        <div className="space-y-2">
          {(branch?.rooms || []).map((room) => {
            const assignment = rooms.find((item) => item.roomId === room.id);
            const capacity = totalTableCapacity(room.tables);
            return (
              <div key={room.id} className={`rounded-xl border p-3 transition-colors ${assignment ? "border-brand-orange bg-[#FFF9F5] shadow-[0_0_0_1px_rgba(255,90,31,0.12)]" : "border-brand-line bg-white"}`}>
                <label className="flex cursor-pointer items-start gap-3 text-brand-ink">
                  <input
                    aria-label={`Seleccionar ${room.name}`}
                    className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[#FF5A1F]"
                    type="checkbox"
                    checked={Boolean(assignment)}
                    onChange={(event) => setRooms((current) => event.target.checked
                      ? [...current, { roomId: room.id, allocatedCovers: "", usage: "partial" }]
                      : current.filter((item) => item.roomId !== room.id))}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-brand-ink">{room.name}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-neutral-700">Capacidad nominal: {capacity} cubiertos.</span>
                  </span>
                </label>
                {assignment ? (
                  <div className="mt-3 grid gap-3 rounded-xl border border-[#F2D8CA] bg-white p-3 sm:grid-cols-2">
                    <label className="space-y-1">
                      <span className="block text-xs font-bold text-brand-ink">Cubiertos asignados</span>
                      <span className="block text-[11px] leading-relaxed text-neutral-700">Personas de este evento que se ubicarán en {room.name}.</span>
                      <input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={assignment.allocatedCovers}
                        placeholder="Ej. 40"
                        onChange={(event) => setRooms((current) => current.map((item) => item.roomId === room.id ? { ...item, allocatedCovers: event.target.value } : item))}
                        className="w-full rounded-xl border border-brand-line bg-white px-3 py-2 text-brand-ink placeholder:text-neutral-500"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-xs font-bold text-brand-ink">Uso físico del salón</span>
                      <span className="block text-[11px] leading-relaxed text-neutral-700">Parcial usa una zona; total usa el salón completo. Ambos bloquean reservas normales.</span>
                      <FoodieSelect value={assignment.usage} onChange={(event) => setRooms((current) => current.map((item) => item.roomId === room.id ? { ...item, usage: event.target.value as "partial" | "full" } : item))}>
                        <option value="partial">Parcial</option>
                        <option value="full">Total</option>
                      </FoodieSelect>
                    </label>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {error ? <p className="mt-4 rounded-2xl border border-red-300/40 bg-red-500/15 px-4 py-3 text-sm text-red-100">{error}</p> : null}
    </AppModal>
  );
}
