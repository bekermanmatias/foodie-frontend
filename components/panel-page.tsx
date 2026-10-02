"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FoodieSelect } from "./foodie-select";
import { AppModal } from "./app-modal";
import { ConfirmDialog } from "./confirm-dialog";
import { ReservationTableReassignModal } from "./reservation-table-reassign-modal";
import { EventReservationEditModal } from "./event-reservation-edit-modal";
import { WorkspaceShell } from "./workspace-shell";
import { useWorkspace } from "./workspace-provider";
import { totalTableCapacity } from "../lib/table-capacity";
import { formatArgentinaDate } from "../lib/argentina-date";

const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 960;

function shapeClass(shape: string) {
  if (shape === "round") return "rounded-full";
  if (shape === "square" || shape === "rectangular") return "rounded-[22px]";
  return "rounded-[18px]";
}

function tableStateStyle(status: string) {
  switch (status) {
    case "reserved":
      return "border-[#C63D2F] bg-[#FDE9E7] text-[#8F241B]";
    case "occupied":
      return "border-[#D39C11] bg-[#FFF2CC] text-[#8A5B00]";
    case "blocked":
      return "border-[#6B7280] bg-[#E5E7EB] text-[#374151]";
    default:
      return "border-[#2F8F57] bg-[#E8F7EE] text-[#146C37]";
  }
}

function renderFixedItem(item: {
  id: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label?: string | null;
}) {
  const baseStyle = {
    left: item.x,
    top: item.y,
    width: item.width,
    height: item.height,
    transform: `rotate(${item.rotation}deg)`,
    transformOrigin: "center"
  };

  if (item.kind === "screen") {
    return (
      <div key={item.id} className="absolute" style={baseStyle}>
        <div className="relative h-full w-full rounded-[18px] border-4 border-[#111827] bg-[#0F172A] shadow-[0_10px_24px_rgba(15,23,42,0.22)]">
          <div className="absolute inset-[10%] rounded-[10px] bg-[linear-gradient(135deg,#0EA5E9,#1D4ED8)] opacity-85" />
          <div className="absolute left-1/2 top-full h-3 w-10 -translate-x-1/2 rounded-b-md bg-[#111827]" />
          <div className="absolute left-1/2 top-[42%] -translate-x-1/2 rounded-full bg-[rgba(255,255,255,0.12)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
            TV
          </div>
        </div>
      </div>
    );
  }

  if (item.kind === "wall") {
    return <div key={item.id} className="absolute rounded-sm bg-[#1F1F21]" style={baseStyle} />;
  }

  if (item.kind === "window") {
    return <div key={item.id} className="absolute rounded-sm border border-[#7EC8F8] bg-[#B9E7FF]" style={baseStyle} />;
  }

  if (item.kind === "column") {
    return <div key={item.id} className="absolute rounded-[18px] border border-[#A59686] bg-[#D8D0C6]" style={baseStyle} />;
  }

  if (item.kind === "corridor") {
    return <div key={item.id} className="absolute rounded-[12px] border border-[#DDD1C5] bg-[#ECE5DC]" style={baseStyle} />;
  }

  if (item.kind === "stairs") {
    return (
      <div
        key={item.id}
        className="absolute rounded-[12px] border border-[#B77943] bg-[repeating-linear-gradient(0deg,#F8EFE4_0,#F8EFE4_13px,#C98B50_14px,#C98B50_18px)]"
        style={baseStyle}
      />
    );
  }

  if (item.kind === "bathroom") {
    return (
      <div
        key={item.id}
        className="absolute flex items-center justify-center rounded-[18px] border border-[#5AAEA1] bg-[#E8F7F4] text-[10px] font-black uppercase tracking-[0.12em] text-[#237C72]"
        style={baseStyle}
      >
        WC
      </div>
    );
  }

  return <div key={item.id} className="absolute rounded-sm bg-[#E9DED2]" style={baseStyle} />;
}

export function PanelPage() {
  const {
    bootstrap,
    reservations,
    roomDetail,
    selectedRoomId,
    setSelectedRoomId,
    selectedBranchId,
    selectedDate,
    selectedTurn,
    setSelectedBranchId,
    setSelectedDate,
    setSelectedTurn,
    specialServices,
    selectedSpecialServiceId,
    setSelectedSpecialServiceId,
    roomBlocks,
    tableStates,
    setTableState,
    moveReservation,
    cancelReservation,
    currentUser,
    reservationForm,
    setReservationForm,
    createReservation
  } = useWorkspace();

  const [selectedTableId, setSelectedTableId] = useState("");
  const [openMenuTableId, setOpenMenuTableId] = useState("");
  const [detailReservationId, setDetailReservationId] = useState("");
  const [reassignReservationId, setReassignReservationId] = useState("");
  const [editEventReservationId, setEditEventReservationId] = useState("");
  const [cancelReservationId, setCancelReservationId] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [detailActionError, setDetailActionError] = useState("");
  const [detailActionLoading, setDetailActionLoading] = useState(false);
  const [bookingMode, setBookingMode] = useState(false);
  const [bookingTableIds, setBookingTableIds] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState("");
  const layoutWrapRef = useRef<HTMLDivElement>(null);
  const layoutScale = 1;

  const selectedBranch = bootstrap?.branches.find((branch) => branch.id === selectedBranchId);
  const selectedRoom = selectedBranch?.rooms.find((room) => room.id === selectedRoomId) || null;
  const selectedRoomBlock = roomBlocks.find((block) => block.roomId === selectedRoomId) || null;
  const isSelectedRoomBlocked = Boolean(selectedRoomBlock);
  const selectedRoomEvent = reservations.find((reservation) => ["pending", "confirmed", "seated"].includes(reservation.status) && reservation.eventRoomAssignments?.some((assignment) => assignment.roomId === selectedRoomId)) || null;
  const isSelectedRoomUnavailable = isSelectedRoomBlocked || Boolean(selectedRoomEvent);

  useEffect(() => {
    if (!isSelectedRoomUnavailable) return;
    setSelectedTableId("");
    setOpenMenuTableId("");
  }, [isSelectedRoomUnavailable]);

  const tableStateMap = useMemo(() => {
    return new Map(tableStates.map((state) => [state.tableId, state]));
  }, [tableStates]);

  const reservationByTableId = useMemo(() => {
    const map = new Map<string, (typeof reservations)[number]>();
    for (const reservation of reservations) {
      for (const link of reservation.tables) {
        map.set(link.table.id, reservation);
      }
    }
    return map;
  }, [reservations]);

  const detailReservation = detailReservationId
    ? reservations.find((reservation) => reservation.id === detailReservationId) || null
    : null;
  const reassignReservation = reassignReservationId
    ? reservations.find((reservation) => reservation.id === reassignReservationId) || null
    : null;
  const editEventReservation = editEventReservationId
    ? reservations.find((reservation) => reservation.id === editEventReservationId) || null
    : null;
  const cancelTarget = cancelReservationId
    ? reservations.find((reservation) => reservation.id === cancelReservationId) || null
    : null;
  const selectedReservationTableIds = new Set(detailReservation?.tables.map((link) => link.table.id) || []);
  const detailReservationCapacity = totalTableCapacity(detailReservation?.tables.map((link) => link.table) || []);
  const canCancelReservations = ["restaurant_owner", "restaurant_manager"].includes(currentUser?.role || "");
  const canEditEvents = ["restaurant_owner", "restaurant_manager", "events"].includes(currentUser?.role || "");
  const canOperateDetailReservation = Boolean(detailReservation && !isSelectedRoomBlocked && ["pending", "confirmed", "seated"].includes(detailReservation.status));
  const selectedSpecialService = specialServices.find((service) => service.id === selectedSpecialServiceId) || null;
  const specialServicesForSelectedTurn = specialServices.filter((service) => (Number(service.startTime.slice(0, 2)) < 17 ? "mediodia" : "noche") === selectedTurn);
  const bookingTables = roomDetail?.tables.filter((table) => bookingTableIds.includes(table.id)) || [];
  const bookingCapacity = totalTableCapacity(bookingTables);

  function startReservation(tableIds: string[]) {
    if (selectedRoomEvent) {
      setCreateError("Este salón está asignado a un evento para el servicio seleccionado.");
      return;
    }
    setReservationForm((current) => ({ ...current, selectedTableIds: tableIds, tableSelectionMode: "manual", serviceTime: selectedSpecialService?.startTime || current.serviceTime }));
    setBookingTableIds([]);
    setBookingMode(false);
    setCreateError("");
    setCreateOpen(true);
  }

  async function submitPanelReservation() {
    setCreateError("");
    if (!reservationForm.fullName.trim() || !reservationForm.phone.trim()) return setCreateError("Completa nombre y teléfono para crear la reserva.");
    if (!Number.isInteger(Number(reservationForm.partySize)) || Number(reservationForm.partySize) < 1) return setCreateError("Ingresá una cantidad válida de comensales.");
    try { await createReservation(); setCreateOpen(false); } catch (error) { setCreateError(error instanceof Error ? error.message : "No se pudo crear la reserva."); }
  }

  async function moveDetailReservation(action: "check-in" | "release") {
    if (!detailReservation || detailActionLoading || isSelectedRoomBlocked) return;
    setDetailActionLoading(true);
    setDetailActionError("");
    try {
      await moveReservation(detailReservation.id, action);
      setDetailReservationId("");
      setSelectedTableId("");
    } catch (error) {
      setDetailActionError(error instanceof Error ? error.message : "No se pudo actualizar la reserva.");
    } finally {
      setDetailActionLoading(false);
    }
  }

  async function confirmCancelReservation() {
    if (!cancelTarget || cancelLoading) return;
    setCancelLoading(true);
    setDetailActionError("");
    try {
      await cancelReservation(cancelTarget.id, cancelReason);
      setCancelReservationId("");
      setCancelReason("");
      setSelectedTableId("");
    } catch (error) {
      setDetailActionError(error instanceof Error ? error.message : "No se pudo cancelar la reserva.");
    } finally {
      setCancelLoading(false);
    }
  }

  return (
    <WorkspaceShell
      title="Panel"
      description=""
    >
      <section className="relative w-full min-w-0 max-w-full overflow-visible rounded-[30px] border border-brand-line bg-white">
        <div className="flex min-w-0 flex-wrap items-end gap-4 border-b border-brand-line px-5 py-4">
          <div className="min-w-[180px] flex-1">
            <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-neutral-400">Sucursal</label>
            <FoodieSelect
              value={selectedBranchId}
              onChange={(event) => {
                const next = event.target.value;
                setSelectedBranchId(next);
                const firstRoom = bootstrap?.branches.find((branch) => branch.id === next)?.rooms[0]?.id || "";
                setSelectedRoomId(firstRoom);
                setSelectedTableId("");
                setOpenMenuTableId("");
                setBookingTableIds([]);
                setBookingMode(false);
              }}
              className="font-medium"
            >
              {bootstrap?.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </FoodieSelect>
          </div>

          {specialServicesForSelectedTurn.length ? <div className="min-w-[220px] flex-1">
            <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-neutral-400">Servicio especial</label>
            <FoodieSelect value={selectedSpecialServiceId} onChange={(event) => { const service = specialServicesForSelectedTurn.find((item) => item.id === event.target.value); setSelectedSpecialServiceId(event.target.value); if (service) setSelectedTurn(Number(service.startTime.slice(0, 2)) < 17 ? "mediodia" : "noche"); setBookingTableIds([]); }} className="font-medium">
              <option value="">Sin servicio especial</option>
              {specialServicesForSelectedTurn.map((service) => <option key={service.id} value={service.id}>{service.label} · {service.startTime}-{service.endTime}</option>)}
            </FoodieSelect>
          </div> : null}
          <div className="min-w-[180px] flex-1">
            <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-neutral-400">Salon</label>
            <FoodieSelect
              value={selectedRoomId}
              onChange={(event) => {
                setSelectedRoomId(event.target.value);
                setSelectedTableId("");
                setOpenMenuTableId("");
                setBookingTableIds([]);
                setBookingMode(false);
              }}
              className="font-medium"
            >
              {selectedBranch?.rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}{roomBlocks.some((block) => block.roomId === room.id) ? " (Bloqueado)" : ""}
                </option>
              ))}
            </FoodieSelect>
          </div>

          <div className="min-w-[180px] flex-1">
            <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-neutral-400">Fecha</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => { setSelectedDate(event.target.value); setBookingTableIds([]); }}
              className="w-full rounded-2xl border border-brand-line px-4 py-3 text-sm outline-none focus:border-brand-orange"
            />
          </div>

          <div className="min-w-[180px] flex-1">
            <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-neutral-400">Turno</label>
            <FoodieSelect
              value={selectedTurn}
              onChange={(event) => {
                const nextTurn = event.target.value as "mediodia" | "noche";
                setSelectedTurn(nextTurn);
                if (selectedSpecialService && (Number(selectedSpecialService.startTime.slice(0, 2)) < 17 ? "mediodia" : "noche") !== nextTurn) {
                  setSelectedSpecialServiceId("");
                }
                setBookingTableIds([]);
              }}
              className="font-medium"
            >
              <option value="mediodia">Mediodia</option>
              <option value="noche">Noche</option>
            </FoodieSelect>
          </div>

          <div className="relative ml-auto flex gap-2">
            {bookingMode ? (
              <>
                <div className="absolute bottom-[calc(100%+10px)] right-0 z-50 w-[min(360px,calc(100vw-40px))] rounded-2xl border border-brand-orange bg-white px-4 py-3 text-right shadow-[0_10px_24px_rgba(31,31,33,0.10)]">
                  <p className="text-sm font-bold text-brand-ink">Seleccioná las mesas para la reserva</p>
                  <p className="mt-1 text-xs text-neutral-500">{bookingTableIds.length ? `Mesas: ${bookingTables.map((table) => table.label).join(" + ")}` : "Todavía no seleccionaste mesas."}</p>
                  {bookingTableIds.length ? <p className="mt-1 text-xs font-semibold text-brand-ink">Capacidad total: {bookingCapacity} pax</p> : null}
                  <p className="mt-2 text-xs font-semibold text-brand-orange">Cuando termines, tocá “Continuar reserva” debajo.</p>
                </div>
                <button type="button" onClick={() => { setBookingMode(false); setBookingTableIds([]); }} className="rounded-full border border-brand-line px-4 py-3 text-sm font-medium text-brand-ink">Cancelar</button>
                <button type="button" disabled={!bookingTableIds.length} onClick={() => startReservation(bookingTableIds)} className="rounded-full bg-brand-orange px-4 py-3 text-sm font-medium text-white disabled:opacity-50">Continuar reserva</button>
              </>
            ) : <button type="button" disabled={isSelectedRoomBlocked} onClick={() => { setSelectedTableId(""); setOpenMenuTableId(""); setBookingMode(true); }} className="rounded-full bg-brand-orange px-4 py-3 text-sm font-medium text-white disabled:opacity-50">Nueva reserva</button>}
          </div>
        </div>

        <div className="min-w-0 p-3 sm:p-5">
          {!roomDetail ? (
            <div className="rounded-[24px] border border-brand-line bg-[#FCFAF7] p-6 text-sm text-neutral-500">
              Selecciona un salon para ver el layout operativo.
            </div>
          ) : (
            <div
              ref={layoutWrapRef}
              onClick={() => { setSelectedTableId(""); setOpenMenuTableId(""); setDetailReservationId(""); }}
              className="relative max-h-[78vh] w-full overflow-scroll overscroll-contain rounded-[24px] border border-brand-line bg-[#F7F4EF] p-3 sm:p-4"
              style={{ scrollbarGutter: "stable both-edges" }}
            >
              {isSelectedRoomUnavailable ? (
                <div className="pointer-events-none sticky top-0 z-30 flex justify-center px-3 pt-3">
                  <div className="rounded-2xl border border-[#D39C11] bg-[#FFF8E1]/95 px-5 py-3 text-center shadow-lg backdrop-blur-sm">
                    <p className="text-sm font-bold text-[#8A5B00]">{selectedRoomEvent ? "Salón asignado a un evento" : "Salón bloqueado para este turno"}</p>
                    <p className="mt-1 text-xs text-[#8A5B00]">{selectedRoomEvent ? `${selectedRoomEvent.fullName} · ${selectedRoomEvent.partySize} cubiertos · ${selectedRoomEvent.code}` : selectedRoomBlock?.reason || "No se pueden operar mesas mientras el salón esté cerrado."}</p>
                  </div>
                </div>
              ) : null}
              <div className="relative shrink-0" style={{ width: CANVAS_WIDTH * layoutScale, minWidth: CANVAS_WIDTH * layoutScale, height: CANVAS_HEIGHT * layoutScale }}>
                <div
                  className="relative origin-top-left"
                  style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, transform: `scale(${layoutScale})` }}
                >
                {roomDetail.floorPlanItems.map((item) => renderFixedItem(item))}

                {roomDetail.tables.map((table) => {
                  const state = tableStateMap.get(table.id);
                  const status = state?.status || "free";
                  const reservation = reservationByTableId.get(table.id) || null;
                  const canReassign = Boolean(reservation && ["pending", "confirmed"].includes(reservation.status) && !isSelectedRoomBlocked);
                  const isBookingCandidate = bookingMode && status === "free" && table.isReservable && !isSelectedRoomBlocked;

                  return (
                    <div
                      key={table.id}
                      className={`absolute ${openMenuTableId === table.id ? "z-40" : "z-0"}`}
                      style={{
                        left: table.x,
                        top: table.y,
                        width: table.width,
                        height: table.height,
                        transform: `rotate(${table.rotation}deg)`,
                        transformOrigin: "center"
                      }}
                    >
                      <button
                        type="button"
                        disabled={isSelectedRoomBlocked || (bookingMode && !isBookingCandidate)}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (bookingMode) { setBookingTableIds((current) => current.includes(table.id) ? current.filter((id) => id !== table.id) : [...current, table.id]); return; }
                          setSelectedTableId(table.id);
                          setOpenMenuTableId("");
                          setDetailActionError("");
                          if (reservation) setDetailReservationId(reservation.id);
                        }}
                        className={`relative h-full w-full border-2 text-center shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${shapeClass(table.shape)} ${tableStateStyle(status)} ${
                          selectedReservationTableIds.has(table.id) ? "ring-4 ring-[#FFB088]" : selectedTableId === table.id ? "ring-4 ring-[#FFB088]" : bookingTableIds.includes(table.id) ? "ring-4 ring-[#6C63FF]" : ""
                        }`}
                      >
                        <span
                          className="inline-block px-2 py-2 text-xs font-semibold"
                          style={{ transform: `rotate(${-table.rotation}deg)` }}
                        >
                          {table.label}
                          <br />
                          {table.seats} pax
                        </span>
                      </button>

                      <div className="absolute -left-2 -top-2 z-20">
                        <button
                          type="button"
                          disabled={isSelectedRoomBlocked}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedTableId(table.id);
                            setOpenMenuTableId((current) => (current === table.id ? "" : table.id));
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-brand-line bg-white text-sm font-bold text-brand-ink shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Acciones de mesa"
                        >
                          ⋯
                        </button>

                        {openMenuTableId === table.id ? (
                          <div className="absolute left-0 top-8 flex flex-col gap-2 rounded-[18px] border border-brand-line bg-white p-2 shadow-[0_12px_24px_rgba(31,31,33,0.12)]">
                            {status === "free" && table.isReservable && !isSelectedRoomBlocked ? (
                              <button type="button" onClick={() => { setOpenMenuTableId(""); startReservation([table.id]); }} className="flex h-8 w-8 items-center justify-center rounded-full border border-brand-orange text-sm font-bold text-brand-orange hover:bg-[#FFF4ED]" aria-label="Crear reserva" title="Crear reserva">+</button>
                            ) : null}
                            <button
                              type="button"
                              disabled={isSelectedRoomBlocked}
                              onClick={() => {
                                setOpenMenuTableId("");
                                if (status === "reserved" && reservation) {
                                  void moveReservation(reservation.id, "check-in");
                                  return;
                                }
                                void setTableState(table.id, "occupied");
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-full border border-brand-line text-sm text-[#8A5B00] hover:border-[#D39C11] disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label="Ocupar mesa"
                            >
                              ●
                            </button>
                            <button
                              type="button"
                              disabled={isSelectedRoomBlocked}
                              onClick={() => {
                                setOpenMenuTableId("");
                                if (reservation) {
                                  void moveReservation(reservation.id, "release");
                                  return;
                                }
                                void setTableState(table.id, "free");
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-full border border-brand-line text-sm text-[#146C37] hover:border-[#2F8F57] disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label="Liberar mesa"
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              disabled={!canReassign}
                              onClick={() => {
                                setOpenMenuTableId("");
                                if (reservation) setReassignReservationId(reservation.id);
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-full border border-brand-orange text-sm font-bold text-brand-orange hover:bg-[#FFF4ED] disabled:cursor-not-allowed disabled:border-[#E5E7EB] disabled:text-[#BDBDBD]"
                              aria-label="Cambiar mesa"
                              title="Cambiar mesa"
                            >
                              ↔
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuTableId("");
                                if (reservation) {
                                  setDetailReservationId(reservation.id);
                                }
                              }}
                              disabled={!reservation}
                              className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm ${
                                reservation
                                  ? "border-brand-line text-brand-ink hover:border-brand-orange"
                                  : "cursor-not-allowed border-[#E5E7EB] text-[#BDBDBD]"
                              }`}
                              aria-label="Ver detalle"
                            >
                              i
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <ReservationTableReassignModal reservation={reassignReservation} onClose={() => setReassignReservationId("")} />
      <EventReservationEditModal reservation={editEventReservation} onClose={() => setEditEventReservationId("")} />

      <AppModal
        open={createOpen}
        onClose={() => { setCreateError(""); setCreateOpen(false); }}
        title="Nueva reserva"
        description="Reserva las mesas seleccionadas en el plano. La disponibilidad se valida al confirmar."
        footer={<><button type="button" onClick={() => setCreateOpen(false)} className="flex-1 rounded-full border border-brand-line px-4 py-3 text-sm font-medium text-brand-ink">Cancelar</button><button type="button" onClick={() => void submitPanelReservation()} className="flex-1 rounded-full bg-brand-orange px-4 py-3 text-sm font-medium text-white">Crear reserva</button></>}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-brand-ink"><span className="font-medium">Nombre del cliente</span><input value={reservationForm.fullName} onChange={(event) => setReservationForm((current) => ({ ...current, fullName: event.target.value }))} className="w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange" /></label>
          <label className="space-y-2 text-sm text-brand-ink"><span className="font-medium">Teléfono</span><input value={reservationForm.phone} onChange={(event) => setReservationForm((current) => ({ ...current, phone: event.target.value }))} className="w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange" /></label>
          <label className="space-y-2 text-sm text-brand-ink"><span className="font-medium">Comensales</span><input type="number" min={1} value={reservationForm.partySize} onChange={(event) => setReservationForm((current) => ({ ...current, partySize: event.target.value }))} className="w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange" /></label>
          <label className="space-y-2 text-sm text-brand-ink"><span className="font-medium">Horario</span><input type="time" value={reservationForm.serviceTime} onChange={(event) => setReservationForm((current) => ({ ...current, serviceTime: event.target.value }))} className="w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange" /></label>
          <div className="rounded-2xl border border-brand-orange bg-[#FFF4ED] px-4 py-3 text-sm text-brand-ink md:col-span-2"><span className="font-semibold">Mesas seleccionadas: </span>{reservationForm.selectedTableIds.length ? `${roomDetail?.tables.filter((table) => reservationForm.selectedTableIds.includes(table.id)).map((table) => table.label).join(" + ")} · Capacidad: ${totalTableCapacity(roomDetail?.tables.filter((table) => reservationForm.selectedTableIds.includes(table.id)) || [])} pax` : "Asignación automática"}</div>
          {createError ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 md:col-span-2">{createError}</p> : null}
        </div>
      </AppModal>

      {detailReservation ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(31,31,33,0.42)] p-6" onClick={() => { setDetailReservationId(""); setSelectedTableId(""); setDetailActionError(""); }}>
          <div className="w-full max-w-lg rounded-[30px] border border-brand-line bg-white p-6 shadow-[0_24px_60px_rgba(31,31,33,0.18)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-semibold text-brand-ink">Detalle de reserva</p>
                <p className="mt-1 text-sm text-neutral-500">Codigo {detailReservation.code}</p>
              </div>
              <button
                type="button"
                onClick={() => { setDetailReservationId(""); setSelectedTableId(""); setDetailActionError(""); }}
                className="rounded-full border border-brand-line px-3 py-1 text-sm text-brand-ink"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-5 grid gap-3 text-sm text-neutral-600">
              <p><span className="font-semibold text-brand-ink">Nombre:</span> {detailReservation.fullName}</p>
              <p><span className="font-semibold text-brand-ink">Telefono:</span> {detailReservation.phone}</p>
              <p><span className="font-semibold text-brand-ink">Email:</span> {detailReservation.email}</p>
              <p><span className="font-semibold text-brand-ink">Cantidad:</span> {detailReservation.partySize}</p>
              <p><span className="font-semibold text-brand-ink">Estado:</span> {detailReservation.status}</p>
              <p><span className="font-semibold text-brand-ink">Fecha y hora:</span> {formatArgentinaDate(detailReservation.serviceDate)} · {detailReservation.serviceTime}</p>
              <p><span className="font-semibold text-brand-ink">Salon:</span> {detailReservation.eventRoomAssignments?.length ? detailReservation.eventRoomAssignments.map((assignment) => `${assignment.room.name} (${assignment.allocatedCovers} pax)`).join(" · ") : detailReservation.room.name}</p>
            </div>

            <div className="mt-5 rounded-2xl border border-brand-orange bg-[#FFF4ED] px-4 py-3 text-sm text-brand-ink">
              <p className="font-semibold">{detailReservation.eventRoomAssignments?.length ? "Salones de este evento" : "Mesas de esta reserva"}</p>
              <p className="mt-1 text-neutral-600">{detailReservation.eventRoomAssignments?.length ? detailReservation.eventRoomAssignments.map((assignment) => `${assignment.room.name}: ${assignment.allocatedCovers} pax (${assignment.usage === "full" ? "total" : "parcial"})`).join(" · ") : `${detailReservation.tables.map((link) => link.table.label).join(" + ")} · Capacidad: ${detailReservationCapacity} pax`}</p>
            </div>

            {canOperateDetailReservation ? (
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {["pending", "confirmed"].includes(detailReservation.status) ? <button type="button" disabled={detailActionLoading} onClick={() => void moveDetailReservation("check-in")} className="rounded-full bg-[#8A5B00] px-4 py-3 text-sm font-medium text-white disabled:opacity-60">{detailActionLoading ? "Actualizando..." : "Check-in"}</button> : null}
                {detailReservation.status === "seated" ? <button type="button" disabled={detailActionLoading} onClick={() => void moveDetailReservation("release")} className="rounded-full bg-[#146C37] px-4 py-3 text-sm font-medium text-white disabled:opacity-60">{detailActionLoading ? "Actualizando..." : "Liberar mesas"}</button> : null}
                {["pending", "confirmed"].includes(detailReservation.status) ? (detailReservation.eventRoomAssignments?.length ? (canEditEvents ? <button type="button" disabled={detailActionLoading} onClick={() => { setEditEventReservationId(detailReservation.id); setDetailReservationId(""); }} className="rounded-full border border-brand-orange px-4 py-3 text-sm font-medium text-brand-orange disabled:opacity-60">Editar evento</button> : null) : <button type="button" disabled={detailActionLoading} onClick={() => { setReassignReservationId(detailReservation.id); setDetailReservationId(""); }} className="rounded-full border border-brand-orange px-4 py-3 text-sm font-medium text-brand-orange disabled:opacity-60">Cambiar mesas</button>) : null}
                {canCancelReservations ? <button type="button" disabled={detailActionLoading} onClick={() => { setCancelReason(""); setDetailActionError(""); setCancelReservationId(detailReservation.id); setDetailReservationId(""); }} className="rounded-full border border-red-200 px-4 py-3 text-sm font-medium text-red-700 disabled:opacity-60">Cancelar reserva</button> : null}
              </div>
            ) : null}
            {isSelectedRoomBlocked ? <p className="mt-4 rounded-2xl border border-[#F1D28A] bg-[#FFF8E1] px-4 py-3 text-sm text-[#8A5B00]">El salón está bloqueado: solo podés consultar la reserva.</p> : null}
            {detailActionError ? <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{detailActionError}</p> : null}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancelar reserva"
        description={`Vas a cancelar la reserva de ${cancelTarget?.fullName || "este cliente"} · ${cancelTarget?.code || ""}.`}
        confirmLabel={cancelLoading ? "Cancelando..." : "Cancelar reserva"}
        tone="danger"
        confirmDisabled={cancelLoading}
        onCancel={() => { if (!cancelLoading) { setCancelReservationId(""); setCancelReason(""); setDetailActionError(""); } }}
        onConfirm={() => void confirmCancelReservation()}
      >
        <div className="space-y-3">
          <div className="rounded-2xl border border-brand-line bg-[#FCFAF7] p-4 text-sm text-neutral-600">Las mesas asociadas se liberarán y la reserva seguirá disponible en el historial.</div>
          <label className="block space-y-2 text-sm text-brand-ink">
            <span className="font-medium">Motivo (opcional)</span>
            <textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} maxLength={500} rows={3} className="w-full resize-none rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange" placeholder="Dejá una nota para el historial" />
          </label>
          {detailActionError ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{detailActionError}</p> : null}
        </div>
      </ConfirmDialog>
    </WorkspaceShell>
  );
}
