"use client";

import { CalendarDays, CheckCircle2, Clock3, Download, MoreHorizontal, Plus, Search, Trash2, Users, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ManualReservationTableOption, Reservation } from "../lib/types";
import { downloadOfflineBackupPdf, type OfflineBackup } from "../lib/offline-backup";
import { AppModal } from "./app-modal";
import { ConfirmDialog } from "./confirm-dialog";
import { FoodieSelect } from "./foodie-select";
import { ReservationTableReassignModal } from "./reservation-table-reassign-modal";
import { WorkspaceShell } from "./workspace-shell";
import { useWorkspace } from "./workspace-provider";
import { tableCapacity, totalTableCapacity } from "../lib/table-capacity";

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<unknown>>) {
  const csv = [headers.map(csvEscape).join(","), ...rows.map((row) => row.map(csvEscape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function formatDate(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function formatMobileDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(`${value}T12:00:00`))
    .replace(".", "");
}

function reservationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Pendiente",
    confirmed: "Confirmada",
    seated: "Sentada",
    completed: "Completada",
    cancelled: "Cancelada",
    no_show: "No asistió"
  };
  return labels[status] || status;
}

function reservationScheduleLabel(reservation: Reservation) {
  const duration = reservation.durationMinutes ? ` · ${reservation.durationMinutes} min` : "";
  return `${reservation.specialService?.label ? `${reservation.specialService.label} · ` : ""}${reservation.serviceTime}${duration}`;
}

function reservationRoomsLabel(reservation: Reservation) {
  if (!reservation.eventRoomAssignments?.length) return reservation.room.name;
  return reservation.eventRoomAssignments.map((assignment) => `${assignment.room.name} (${assignment.allocatedCovers})`).join(" · ");
}

export function ReservasPage() {
  const {
    reservations,
    reservationForm,
    setReservationForm,
    createReservation,
    moveReservation,
    rescheduleReservation,
    cancelReservation,
    deleteReservation,
    bootstrap,
    currentUser,
    roomDetail,
    selectedRoomId,
    setSelectedRoomId,
    selectedDate,
    selectedTurn,
    setSelectedDate,
    setSelectedTurn,
    specialServices,
    selectedSpecialServiceId,
    setSelectedSpecialServiceId,
    selectedBranchId,
    loadReservationHistory,
    loadAvailableReservationTableOptions,
    loadAvailableManualReservationTables
  } = useWorkspace();

  const [createOpen, setCreateOpen] = useState(false);
  const [reassignReservation, setReassignReservation] = useState<Reservation | null>(null);
  const [formError, setFormError] = useState("");
  const [tableOptions, setTableOptions] = useState<import("../lib/types").ReservationTableOption[]>([]);
  const [manualTableOptions, setManualTableOptions] = useState<ManualReservationTableOption[]>([]);
  const [configuredOptionsLoading, setConfiguredOptionsLoading] = useState(false);
  const [manualTablesLoading, setManualTablesLoading] = useState(false);
  const [configuredOptionsError, setConfiguredOptionsError] = useState("");
  const [manualTablesError, setManualTablesError] = useState("");
  const [tableOptionsRetry, setTableOptionsRetry] = useState(0);
  const [activeView, setActiveView] = useState<"turno" | "historico">("turno");
  const [historyFilters, setHistoryFilters] = useState({
    dateFrom: selectedDate,
    dateTo: selectedDate,
    turn: "all" as "all" | "mediodia" | "noche",
    status: "all",
    search: ""
  });
  const [historyRows, setHistoryRows] = useState<Reservation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Reservation | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<Reservation | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleError, setRescheduleError] = useState("");
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupError, setBackupError] = useState("");
  const [mobileActionReservation, setMobileActionReservation] = useState<Reservation | null>(null);
  const zonePills = roomDetail?.zones || [];
  const selectedBranch = bootstrap?.branches.find((branch) => branch.id === selectedBranchId);
  const selectedSpecialService = specialServices.find((service) => service.id === selectedSpecialServiceId) || null;
  const specialServicesForSelectedTurn = specialServices.filter((service) => (Number(service.startTime.slice(0, 2)) < 17 ? "mediodia" : "noche") === selectedTurn);
  const isEventsUser = currentUser?.role === "events";
  const canOperateReservations = true;
  const canDeleteReservations = ["restaurant_owner", "restaurant_manager"].includes(currentUser?.role || "");
  const canCancelReservations = ["restaurant_owner", "restaurant_manager", "host", "events"].includes(currentUser?.role || "");
  const canRescheduleReservations = ["restaurant_owner", "restaurant_manager", "events"].includes(currentUser?.role || "");
  const canCreateEvents = ["restaurant_owner", "restaurant_manager", "events"].includes(currentUser?.role || "");
  const eventAllocatedCovers = reservationForm.eventRooms.reduce((total, room) => total + (Number(room.allocatedCovers) || 0), 0);
  const eventTotalCovers = Number(reservationForm.partySize) || 0;
  const eventDistributionStatus = eventAllocatedCovers === eventTotalCovers
    ? "complete"
    : eventAllocatedCovers > eventTotalCovers
      ? "exceeded"
      : "pending";
  const manualSelectedTables = manualTableOptions.filter((table) => reservationForm.selectedTableIds.includes(table.id));
  const manualSelectedCapacity = totalTableCapacity(manualSelectedTables);
  const manualTableOptionsById = useMemo(() => new Map(manualTableOptions.map((table) => [table.id, table])), [manualTableOptions]);
  const manualTableCards = useMemo(
    () => [...(roomDetail?.tables || [])]
      .sort((left, right) => left.label.localeCompare(right.label, "es", { numeric: true }))
      .map((table) => {
        const availableOption = manualTableOptionsById.get(table.id);
        return {
          id: table.id,
          label: table.label,
          seats: availableOption?.seats ?? tableCapacity(table),
          isAvailable: Boolean(availableOption)
        };
      }),
    [manualTableOptionsById, roomDetail?.tables]
  );

  useEffect(() => {
    const selectionMode = reservationForm.tableSelectionMode;
    if (!createOpen || reservationForm.reservationKind === "event" || selectionMode === "automatic") {
      setTableOptions([]);
      setManualTableOptions([]);
      setConfiguredOptionsLoading(false);
      setManualTablesLoading(false);
      setConfiguredOptionsError("");
      setManualTablesError("");
      return;
    }
    if (!selectedBranchId || !selectedRoomId || !selectedDate || !reservationForm.serviceTime) return;
    const partySize = Number(reservationForm.partySize);
    if (!Number.isInteger(partySize) || partySize < 1) {
      setTableOptions([]);
      setManualTableOptions([]);
      return;
    }
    let active = true;

    if (selectionMode === "configured") {
      setConfiguredOptionsLoading(true);
      setConfiguredOptionsError("");
      setTableOptions([]);
      loadAvailableReservationTableOptions({
        branchId: selectedBranchId,
        roomId: selectedRoomId,
        partySize,
        serviceDate: selectedDate,
        serviceTime: reservationForm.serviceTime,
        preferredZone: reservationForm.preferredZone || undefined
      })
        .then((options) => {
          if (!active) return;
          setTableOptions(options);
          setReservationForm((current) => current.tableSelectionMode === "configured" && current.selectedTableIds.length && !options.some((option) => option.tableIds.join("|") === current.selectedTableIds.join("|"))
            ? { ...current, selectedTableIds: [] }
            : current);
        })
        .catch(() => { if (active) { setTableOptions([]); setConfiguredOptionsError("No se pudieron cargar las combinaciones disponibles."); } })
        .finally(() => { if (active) setConfiguredOptionsLoading(false); });
    } else {
      setManualTablesLoading(true);
      setManualTablesError("");
      setManualTableOptions([]);
      loadAvailableManualReservationTables({
        branchId: selectedBranchId,
        roomId: selectedRoomId,
        serviceDate: selectedDate,
        serviceTime: reservationForm.serviceTime,
        preferredZone: reservationForm.preferredZone || undefined
      })
        .then((manualTables) => {
          if (!active) return;
          setManualTableOptions(manualTables);
          setReservationForm((current) => current.tableSelectionMode === "manual" && current.selectedTableIds.length && !current.selectedTableIds.every((id) => manualTables.some((table) => table.id === id))
            ? { ...current, selectedTableIds: [] }
            : current);
        })
        .catch(() => { if (active) { setManualTableOptions([]); setManualTablesError("No se pudieron cargar las mesas libres."); } })
        .finally(() => { if (active) setManualTablesLoading(false); });
    }
    return () => { active = false; };
  }, [createOpen, selectedBranchId, selectedRoomId, selectedDate, reservationForm.partySize, reservationForm.serviceTime, reservationForm.preferredZone, reservationForm.tableSelectionMode, reservationForm.reservationKind, loadAvailableReservationTableOptions, loadAvailableManualReservationTables, setReservationForm, tableOptionsRetry]);

  const sortedReservations = useMemo(
    () =>
      [...reservations].sort((left, right) => {
        const statusOrder = { confirmed: 0, pending: 1, seated: 2, completed: 3, cancelled: 4, no_show: 5 } as Record<string, number>;
        return (statusOrder[left.status] ?? 99) - (statusOrder[right.status] ?? 99);
      }),
    [reservations]
  );

  const openCreateReservation = () => {
    setFormError("");
    if (isEventsUser) {
      setReservationForm((current) => ({ ...current, reservationKind: "event", selectedTableIds: [], tableSelectionMode: "automatic", eventRooms: current.eventRooms.length ? current.eventRooms : [] }));
    }
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    setFormError("");

    if (!reservationForm.fullName.trim() || !reservationForm.phone.trim()) {
      setFormError("Completa nombre y telefono para crear la reserva.");
      return;
    }

    const partySize = Number(reservationForm.partySize);
    if (!Number.isInteger(partySize) || partySize < 1) {
      setFormError("Ingresa una cantidad valida de comensales.");
      return;
    }
    if (!reservationForm.serviceTime) {
      setFormError("Ingresa el horario de la reserva.");
      return;
    }
    if (reservationForm.reservationKind === "event") {
      if (!reservationForm.eventRooms.length) {
        setFormError("ElegÃ­ al menos un salÃ³n para el evento.");
        return;
      }
      if (eventAllocatedCovers !== partySize) {
        setFormError("Los cubiertos distribuidos entre salones deben coincidir con el total del evento.");
        return;
      }
    }
    if (reservationForm.reservationKind === "standard" && reservationForm.tableSelectionMode === "manual" && !reservationForm.selectedTableIds.length) {
      setFormError("Elegí al menos una mesa libre o volvé a la asignación automática.");
      return;
    }

    try {
      await createReservation();
      setCreateOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo crear la reserva.");
    }
  };

  const handleLoadHistory = async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const rows = await loadReservationHistory({
        branchId: selectedBranchId || undefined,
        dateFrom: historyFilters.dateFrom,
        dateTo: historyFilters.dateTo,
        turn: historyFilters.turn,
        status: historyFilters.status,
        search: historyFilters.search
      });
      setHistoryRows(rows);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "No se pudo cargar el historico.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDeleteReservation = async () => {
    if (!deleteTarget) return;
    setDeleteError("");
    try {
      await deleteReservation(deleteTarget.id);
      setHistoryRows((current) => current.filter((reservation) => reservation.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "No se pudo eliminar la reserva.");
    }
  };

  const handleCancelReservation = async () => {
    if (!cancelTarget || cancelLoading) return;
    setCancelLoading(true);
    setCancelError("");
    try {
      const updated = await cancelReservation(cancelTarget.id, cancelReason);
      setHistoryRows((current) => current.map((reservation) => reservation.id === updated.id ? { ...reservation, status: "cancelled" } : reservation));
      setCancelTarget(null);
      setCancelReason("");
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : "No se pudo cancelar la reserva.");
    } finally {
      setCancelLoading(false);
    }
  };

  const handleRescheduleReservation = async () => {
    if (!rescheduleTarget || !rescheduleDate || rescheduleLoading) return;
    setRescheduleLoading(true);
    setRescheduleError("");
    try {
      const updated = await rescheduleReservation(rescheduleTarget.id, rescheduleDate);
      setHistoryRows((current) => current.map((reservation) => reservation.id === updated.id ? updated : reservation));
      setRescheduleTarget(null);
      setRescheduleDate("");
    } catch (error) {
      setRescheduleError(error instanceof Error ? error.message : "No se pudo cambiar la fecha de la reserva.");
    } finally {
      setRescheduleLoading(false);
    }
  };

  const exportReservationsCsv = () => {
    downloadCsv(
      `reservas-${historyFilters.dateFrom || "inicio"}-${historyFilters.dateTo || "fin"}.csv`,
      ["codigo", "fecha", "horario", "turno", "estado", "cliente", "telefono", "email", "comensales", "sucursal", "salon", "mesas", "notas"],
      historyRows.map((reservation) => [
        reservation.code,
        formatDate(reservation.serviceDate),
        reservation.serviceTime,
        reservation.turn,
        reservation.status,
        reservation.fullName,
        reservation.phone,
        reservation.email,
        reservation.partySize,
        reservation.branch?.name || "",
        reservationRoomsLabel(reservation),
        reservation.tables.map((item) => item.table.label).join(" | "),
        (reservation as Reservation & { notes?: string | null }).notes || ""
      ])
    );
  };

  const downloadDailyBackup = async () => {
    if (!selectedBranchId || !selectedDate || backupLoading) return;
    setBackupLoading(true);
    setBackupError("");
    const token = window.localStorage.getItem("foodie_token");
    const query = new URLSearchParams({ branchId: selectedBranchId, serviceDate: selectedDate, turn: selectedTurn });
    if (selectedSpecialServiceId) query.set("specialServiceId", selectedSpecialServiceId);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/v1"}/restaurant/reservations/offline-backup?${query.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!response.ok) throw new Error(response.status === 403 ? "No tenés permiso para descargar este backup." : "No se pudo preparar el backup. Revisá tu conexión y reintentá.");
      downloadOfflineBackupPdf(await response.json() as OfflineBackup);
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "No se pudo preparar el backup.");
    } finally {
      setBackupLoading(false);
    }
  };

  return (
    <WorkspaceShell
      title="Reservas"
      description="Opera el turno con una vista limpia de reservas y acciones puntuales, sin formularios permanentes expuestos."
    >
      <div className="flex w-full max-w-md rounded-full border border-brand-line bg-white p-1">
        <button
          type="button"
          onClick={() => setActiveView("turno")}
          className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
            activeView === "turno" ? "bg-brand-orange text-white shadow-[0_10px_24px_rgba(255,90,0,0.22)]" : "text-neutral-500 hover:text-brand-ink"
          }`}
        >
          Turno
        </button>
        <button
          type="button"
          onClick={() => setActiveView("historico")}
          className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
            activeView === "historico" ? "bg-brand-orange text-white shadow-[0_10px_24px_rgba(255,90,0,0.22)]" : "text-neutral-500 hover:text-brand-ink"
          }`}
        >
          Historico
        </button>
      </div>

      {activeView === "turno" ? (
      <>
      <section className="overflow-hidden rounded-[26px] border border-brand-line bg-white pb-20 md:pb-0">
        <div className="flex flex-col gap-4 border-b border-brand-line px-5 py-5 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-orange">Turno activo</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-brand-ink">Reservas del turno</h2>
            </div>
            <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
              <button
                type="button"
                onClick={() => void downloadDailyBackup()}
                disabled={backupLoading}
                className="hidden items-center justify-center gap-2 rounded-full border border-brand-line px-5 py-3 text-sm font-medium text-brand-ink md:inline-flex"
              >
                <Download className="h-4 w-4" />
                {backupLoading ? "Preparando PDF..." : "Descargar PDF"}
              </button>
              <button
                type="button"
                onClick={openCreateReservation}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-orange px-5 py-3 text-sm font-medium text-white md:w-auto"
              >
                <Plus className="h-4 w-4" />
                Nueva reserva
              </button>
            </div>
          </div>
          {backupError ? <p className="hidden text-sm text-red-600 md:block" role="alert">{backupError}</p> : null}

          <div className="grid gap-3 md:grid-cols-[minmax(0,220px)_180px_minmax(0,240px)] md:items-end">
            <label className="space-y-2 text-sm text-brand-ink">
              <span className="inline-flex items-center gap-2 font-medium">
                <CalendarDays className="h-4 w-4 text-brand-orange" />
                Fecha
              </span>
              <span className="relative flex h-12 w-full items-center rounded-2xl border border-brand-line bg-[#FCFAF7] px-4 text-base font-medium text-brand-ink md:hidden">
                <CalendarDays className="mr-3 h-4 w-4 text-brand-orange" />
                {selectedDate ? formatMobileDate(selectedDate) : "Elegí una fecha"}
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  aria-label="Fecha del turno"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </span>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="hidden w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange md:block"
              />
            </label>
            <label className="space-y-2 text-sm text-brand-ink">
              <span className="inline-flex items-center gap-2 font-medium">
                <Clock3 className="h-4 w-4 text-brand-orange" />
                Turno
              </span>
              <FoodieSelect
                value={selectedTurn}
                onChange={(event) => {
                  const nextTurn = event.target.value as "mediodia" | "noche";
                  setSelectedTurn(nextTurn);
                  if (selectedSpecialService && (Number(selectedSpecialService.startTime.slice(0, 2)) < 17 ? "mediodia" : "noche") !== nextTurn) {
                    setSelectedSpecialServiceId("");
                  }
                }}
                className="font-medium"
              >
                <option value="mediodia">Mediodia</option>
                <option value="noche">Noche</option>
              </FoodieSelect>
            </label>
            {specialServicesForSelectedTurn.length ? (
              <label className="space-y-2 text-sm text-brand-ink">
                <span className="font-medium">Servicio especial</span>
                <FoodieSelect
                  value={selectedSpecialServiceId}
                  onChange={(event) => {
                    const service = specialServicesForSelectedTurn.find((item) => item.id === event.target.value);
                    setSelectedSpecialServiceId(event.target.value);
                    if (service) setSelectedTurn(Number(service.startTime.slice(0, 2)) < 17 ? "mediodia" : "noche");
                  }}
                  className="font-medium"
                >
                  <option value="">Sin servicio especial</option>
                  {specialServicesForSelectedTurn.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.label} · {service.startTime}-{service.endTime}
                    </option>
                  ))}
                </FoodieSelect>
              </label>
            ) : null}
          </div>
        </div>

        {sortedReservations.length ? (
          <>
            <div className="hidden md:block">
              <div className="grid grid-cols-[minmax(0,1.7fr)_1fr_0.9fr_0.9fr_160px] gap-4 px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
                <span>Cliente</span>
                <span>Salon y mesa</span>
                <span>Codigo</span>
                <span>Estado</span>
                <span className="text-right">Acciones</span>
              </div>
              <div className="divide-y divide-brand-line">
                {sortedReservations.map((reservation) => (
                  <div key={reservation.id} className="grid grid-cols-[minmax(0,1.7fr)_1fr_0.9fr_0.9fr_160px] gap-4 px-6 py-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-brand-ink">{reservation.fullName}</p>
                      <p className="mt-1 text-sm text-neutral-500">
                        {reservation.phone} - {reservation.email}
                      </p>
                      <p className="mt-2 inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-neutral-400">
                        <Users className="h-3.5 w-3.5" />
                        {reservation.partySize} cubiertos - {reservationScheduleLabel(reservation)}
                      </p>
                    </div>
                    <div className="min-w-0 text-sm text-neutral-500">
                      <p className="truncate">{reservationRoomsLabel(reservation)}</p>
                      <p className="truncate text-xs text-neutral-400">{reservation.tables.map((item) => item.table.label).join(", ") || "Sin asignacion"}{reservation.tables.length > 1 ? ` · Capacidad: ${totalTableCapacity(reservation.tables.map((item) => item.table))} pax` : ""}</p>
                    </div>
                    <div className="text-sm font-semibold text-brand-ink">{reservation.code}</div>
                    <div className="text-sm text-neutral-500">{reservation.status}</div>
                    <div className="flex items-start justify-end gap-2">
                      {canOperateReservations && reservation.status !== "cancelled" ? <>
                        <button
                          type="button"
                          onClick={() => moveReservation(reservation.id, "check-in")}
                          className="rounded-full bg-brand-orange px-3 py-2 text-xs font-medium text-white"
                        >
                          Check-in
                        </button>
                        <button
                          type="button"
                          onClick={() => moveReservation(reservation.id, "release")}
                          className="rounded-full border border-brand-line px-3 py-2 text-xs font-medium text-brand-ink"
                        >
                          Liberar
                        </button>
                      </> : null}
                      {canOperateReservations && ["pending", "confirmed"].includes(reservation.status) ? (
                        <button
                          type="button"
                          onClick={() => setReassignReservation(reservation)}
                          className="rounded-full border border-brand-orange px-3 py-2 text-xs font-medium text-brand-orange"
                        >
                          Cambiar mesa
                        </button>
                      ) : null}
                      {["pending", "confirmed"].includes(reservation.status) ? (
                        <button type="button" onClick={() => { setRescheduleError(""); setRescheduleDate(reservation.serviceDate.slice(0, 10)); setRescheduleTarget(reservation); }} className="rounded-full border border-brand-orange px-3 py-2 text-xs font-medium text-brand-orange">
                          Cambiar fecha
                        </button>
                      ) : null}
                      {canCancelReservations && ["pending", "confirmed", "seated"].includes(reservation.status) ? (
                        <button type="button" onClick={() => { setCancelError(""); setCancelReason(""); setCancelTarget(reservation); }} className="rounded-full border border-red-200 px-3 py-2 text-xs font-medium text-red-700">
                          Cancelar
                        </button>
                      ) : null}
                      {canDeleteReservations && reservation.status === "cancelled" ? (
                        <button type="button" onClick={() => { setDeleteError(""); setDeleteTarget(reservation); }} className="rounded-full border border-red-200 px-3 py-2 text-xs font-medium text-red-700">
                          Eliminar
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="divide-y divide-brand-line md:hidden">
              {sortedReservations.map((reservation) => (
                <article key={reservation.id} className="px-5 py-5">
                  <div className="flex items-start gap-3">
                    <time className="shrink-0 rounded-xl bg-[#FFF4ED] px-2.5 py-2 text-sm font-extrabold text-brand-orange">{reservation.serviceTime}</time>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-base font-semibold text-brand-ink">{reservation.fullName}</p>
                        <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-600">{reservationStatusLabel(reservation.status)}</span>
                      </div>
                      <p className="mt-1 text-sm text-neutral-600">{reservationRoomsLabel(reservation)} · {reservation.tables.map((item) => item.table.label).join(", ") || (reservation.eventRoomAssignments?.length ? "Evento" : "Sin mesa")}</p>
                      <p className="mt-1 text-sm text-neutral-500">{reservation.partySize} cubiertos</p>
                      <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-neutral-400">{reservation.code}{reservation.durationMinutes ? ` · ${reservation.durationMinutes} min` : ""}</p>
                    </div>
                  </div>
                  {canOperateReservations && (["pending", "confirmed"].includes(reservation.status) || reservation.status === "seated") ? (
                    <div className="mt-4 flex gap-2">
                      <button type="button" onClick={() => moveReservation(reservation.id, reservation.status === "seated" ? "release" : "check-in")} className="flex-1 rounded-full bg-brand-orange px-4 py-2.5 text-sm font-semibold text-white">
                        {reservation.status === "seated" ? "Liberar" : "Check-in"}
                      </button>
                      {canOperateReservations && (["pending", "confirmed"].includes(reservation.status) || canCancelReservations) ? <button type="button" onClick={() => setMobileActionReservation(reservation)} className="inline-flex w-12 items-center justify-center rounded-full border border-brand-line text-brand-ink" aria-label={`Más acciones para ${reservation.fullName}`}>
                        <MoreHorizontal className="h-5 w-5" />
                      </button> : null}
                    </div>
                  ) : canOperateReservations && canDeleteReservations && reservation.status === "cancelled" ? (
                    <button type="button" onClick={() => setMobileActionReservation(reservation)} className="mt-4 inline-flex items-center gap-2 rounded-full border border-brand-line px-4 py-2 text-sm font-medium text-brand-ink">Más acciones<MoreHorizontal className="h-4 w-4" /></button>
                  ) : null}
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FFF4ED] text-brand-orange">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <p className="mt-5 text-lg font-semibold text-brand-ink">No hay reservas para este turno</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-neutral-500">
              Cuando necesites cargar una nueva reserva, hacelo desde el boton superior y mantene esta vista enfocada en la operacion.
            </p>
          </div>
        )}
      </section>
      <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3 pb-[env(safe-area-inset-bottom)] md:hidden">
        {backupError ? <p className="max-w-[min(280px,calc(100vw-2rem))] rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 shadow-lg" role="alert">{backupError}</p> : null}
        <button
          type="button"
          onClick={() => void downloadDailyBackup()}
          disabled={backupLoading}
          aria-label="Guardar reservas PDF"
          className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-brand-orange px-5 text-sm font-bold text-white shadow-[0_14px_30px_rgba(234,88,12,0.32)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Download className="h-5 w-5" />
          {backupLoading ? "Preparando..." : "PDF"}
        </button>
      </div>
      </>
      ) : null}

      {activeView === "historico" ? (
      <section className="overflow-hidden rounded-[26px] border border-brand-line bg-white">
        <div className="flex flex-col gap-4 border-b border-brand-line px-5 py-5 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-orange">Historico</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-brand-ink">Reservas por rango</h2>
            </div>
            <button
              type="button"
              onClick={exportReservationsCsv}
              disabled={!historyRows.length}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-brand-line px-5 py-3 text-sm font-medium text-brand-ink disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Descargar CSV
            </button>
          </div>

          <div className="grid gap-3 lg:grid-cols-[160px_160px_160px_180px_minmax(180px,1fr)_140px] lg:items-end">
            <label className="space-y-2 text-sm text-brand-ink">
              <span className="font-medium">Desde</span>
              <input
                type="date"
                value={historyFilters.dateFrom}
                onChange={(event) => setHistoryFilters((current) => ({ ...current, dateFrom: event.target.value }))}
                className="w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange"
              />
            </label>
            <label className="space-y-2 text-sm text-brand-ink">
              <span className="font-medium">Hasta</span>
              <input
                type="date"
                value={historyFilters.dateTo}
                onChange={(event) => setHistoryFilters((current) => ({ ...current, dateTo: event.target.value }))}
                className="w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange"
              />
            </label>
            <label className="space-y-2 text-sm text-brand-ink">
              <span className="font-medium">Turno</span>
              <FoodieSelect
                value={historyFilters.turn}
                onChange={(event) => setHistoryFilters((current) => ({ ...current, turn: event.target.value as "all" | "mediodia" | "noche" }))}
              >
                <option value="all">Todos</option>
                <option value="mediodia">Mediodia</option>
                <option value="noche">Noche</option>
              </FoodieSelect>
            </label>
            <label className="space-y-2 text-sm text-brand-ink">
              <span className="font-medium">Estado</span>
              <FoodieSelect
                value={historyFilters.status}
                onChange={(event) => setHistoryFilters((current) => ({ ...current, status: event.target.value }))}
              >
                <option value="all">Todos</option>
                <option value="confirmed">Confirmada</option>
                <option value="pending">Pendiente</option>
                <option value="seated">Sentada</option>
                <option value="completed">Completada</option>
                <option value="cancelled">Cancelada</option>
                <option value="no_show">No show</option>
              </FoodieSelect>
            </label>
            <label className="space-y-2 text-sm text-brand-ink">
              <span className="font-medium">Buscar</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input
                  value={historyFilters.search}
                  onChange={(event) => setHistoryFilters((current) => ({ ...current, search: event.target.value }))}
                  placeholder="Cliente, telefono, email o codigo"
                  className="w-full rounded-2xl border border-brand-line px-10 py-3 outline-none focus:border-brand-orange"
                />
              </div>
            </label>
            <button
              type="button"
              onClick={() => void handleLoadHistory()}
              className="rounded-full bg-brand-orange px-5 py-3 text-sm font-medium text-white"
            >
              {historyLoading ? "Buscando..." : "Buscar"}
            </button>
          </div>
          {historyError ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{historyError}</p> : null}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <div className="min-w-[920px]">
            <div className="grid grid-cols-[120px_120px_minmax(0,1.5fr)_110px_110px_minmax(0,1fr)_130px_110px] gap-4 px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
              <span>Fecha</span>
              <span>Hora</span>
              <span>Cliente</span>
              <span>Comensales</span>
              <span>Estado</span>
              <span>Salon</span>
              <span>Codigo</span>
              <span>Acciones</span>
            </div>
            <div className="divide-y divide-brand-line">
              {historyRows.length ? (
                historyRows.map((reservation) => (
                  <div key={reservation.id} className="grid grid-cols-[120px_120px_minmax(0,1.5fr)_110px_110px_minmax(0,1fr)_130px_110px] gap-4 px-6 py-4 text-sm">
                    <span className="text-neutral-500">{formatDate(reservation.serviceDate)}</span>
                    <span className="font-semibold text-brand-ink">{reservation.serviceTime}</span>
                    <span className="min-w-0 truncate font-semibold text-brand-ink">{reservation.fullName}</span>
                    <span className="text-neutral-500">{reservation.partySize}</span>
                    <span className="text-neutral-500">{reservation.status}</span>
                    <span className="min-w-0 truncate text-neutral-500">{reservationRoomsLabel(reservation)}</span>
                    <span className="font-semibold text-brand-ink">{reservation.code}</span>
                    <span className="flex flex-wrap gap-2">{canCancelReservations && ["pending", "confirmed", "seated"].includes(reservation.status) ? <button type="button" onClick={() => { setCancelError(""); setCancelReason(""); setCancelTarget(reservation); }} className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-2 text-xs font-medium text-red-700"><XCircle className="h-3.5 w-3.5" />Cancelar</button> : null}{canDeleteReservations && reservation.status === "cancelled" ? <button type="button" onClick={() => { setDeleteError(""); setDeleteTarget(reservation); }} className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-2 text-xs font-medium text-red-700"><Trash2 className="h-3.5 w-3.5" />Eliminar</button> : null}</span>
                  </div>
                ))
              ) : (
                <div className="px-6 py-10 text-center text-sm text-neutral-500">Busca un rango para ver y exportar reservas historicas.</div>
              )}
            </div>
          </div>
        </div>
        <div className="divide-y divide-brand-line md:hidden">
          {historyRows.length ? historyRows.map((reservation) => (
            <article key={reservation.id} className="space-y-2 px-5 py-4">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-brand-ink">{reservation.fullName}</p>
                  <p className="mt-1 text-sm text-neutral-500">{formatDate(reservation.serviceDate)} · {reservation.serviceTime}</p>
                </div>
                <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">{reservation.status}</span>
              </div>
              <p className="text-sm text-neutral-500">{reservation.partySize} cubiertos · {reservationRoomsLabel(reservation)}</p>
              <p className="break-words text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">Código {reservation.code}</p>
              {canCancelReservations && ["pending", "confirmed", "seated"].includes(reservation.status) ? <button type="button" onClick={() => { setCancelError(""); setCancelReason(""); setCancelTarget(reservation); }} className="mt-2 inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-2 text-xs font-medium text-red-700"><XCircle className="h-3.5 w-3.5" />Cancelar</button> : null}
              {canDeleteReservations && reservation.status === "cancelled" ? <button type="button" onClick={() => { setDeleteError(""); setDeleteTarget(reservation); }} className="mt-2 inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-2 text-xs font-medium text-red-700"><Trash2 className="h-3.5 w-3.5" />Eliminar</button> : null}
            </article>
          )) : <div className="px-5 py-10 text-center text-sm text-neutral-500">Busca un rango para ver y exportar reservas históricas.</div>}
        </div>
      </section>
      ) : null}

      <ReservationTableReassignModal reservation={reassignReservation} onClose={() => setReassignReservation(null)} />

      <AppModal
        open={Boolean(mobileActionReservation)}
        title={mobileActionReservation?.fullName || "Acciones de reserva"}
        description={mobileActionReservation ? `${mobileActionReservation.serviceTime} · ${mobileActionReservation.room.name} · ${mobileActionReservation.code}` : ""}
        onClose={() => setMobileActionReservation(null)}
        widthClassName="max-w-sm"
      >
        <div className="grid gap-3">
          {canOperateReservations && ["pending", "confirmed"].includes(mobileActionReservation?.status || "") ? <button type="button" onClick={() => { setReassignReservation(mobileActionReservation); setMobileActionReservation(null); }} className="rounded-full border border-brand-orange px-4 py-3 text-sm font-semibold text-brand-orange">Cambiar mesas</button> : null}
          {canRescheduleReservations && mobileActionReservation && ["pending", "confirmed"].includes(mobileActionReservation.status) ? <button type="button" onClick={() => { setRescheduleError(""); setRescheduleDate(mobileActionReservation.serviceDate.slice(0, 10)); setRescheduleTarget(mobileActionReservation); setMobileActionReservation(null); }} className="rounded-full border border-brand-orange px-4 py-3 text-sm font-semibold text-brand-orange">Cambiar fecha</button> : null}
          {canOperateReservations && canCancelReservations && mobileActionReservation && ["pending", "confirmed", "seated"].includes(mobileActionReservation.status) ? <button type="button" onClick={() => { setCancelError(""); setCancelReason(""); setCancelTarget(mobileActionReservation); setMobileActionReservation(null); }} className="rounded-full border border-red-200 px-4 py-3 text-sm font-semibold text-red-700">Cancelar reserva</button> : null}
          {canOperateReservations && canDeleteReservations && mobileActionReservation?.status === "cancelled" ? <button type="button" onClick={() => { setDeleteError(""); setDeleteTarget(mobileActionReservation); setMobileActionReservation(null); }} className="rounded-full border border-red-200 px-4 py-3 text-sm font-semibold text-red-700">Eliminar reserva</button> : null}
          {!canOperateReservations || !((canRescheduleReservations && ["pending", "confirmed"].includes(mobileActionReservation?.status || "")) || (canCancelReservations && ["pending", "confirmed", "seated"].includes(mobileActionReservation?.status || "")) || (canDeleteReservations && mobileActionReservation?.status === "cancelled")) ? <p className="text-sm text-white/70">No hay acciones adicionales para esta reserva.</p> : null}
        </div>
      </AppModal>

      <AppModal
        open={Boolean(rescheduleTarget)}
        title="Cambiar fecha de reserva"
        description={rescheduleTarget ? rescheduleTarget.fullName + " · " + rescheduleTarget.code : ""}
        onClose={() => { if (!rescheduleLoading) { setRescheduleError(""); setRescheduleTarget(null); } }}
        widthClassName="max-w-md"
        footer={<><button type="button" disabled={rescheduleLoading} onClick={() => setRescheduleTarget(null)} className="flex-1 rounded-full border border-brand-line px-4 py-3 text-sm font-medium text-brand-ink">Cancelar</button><button type="button" disabled={rescheduleLoading || !rescheduleDate} onClick={() => void handleRescheduleReservation()} className="flex-1 rounded-full bg-brand-orange px-4 py-3 text-sm font-medium text-white">{rescheduleLoading ? "Guardando..." : "Confirmar fecha"}</button></>}
      >
        <label className="block space-y-2 text-sm text-white">
          <span className="font-medium">Nueva fecha</span>
          <input type="date" value={rescheduleDate} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setRescheduleDate(event.target.value)} className="w-full rounded-xl border border-white/15 bg-white px-3 py-3 text-brand-ink" />
        </label>
        {rescheduleError ? <p className="mt-4 rounded-2xl border border-red-300/40 bg-red-500/15 px-4 py-3 text-sm text-red-100">{rescheduleError}</p> : null}
      </AppModal>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancelar reserva"
        description={`Vas a cancelar la reserva de ${cancelTarget?.fullName || "este cliente"} · ${cancelTarget?.code || ""} · ${formatDate(cancelTarget?.serviceDate)}.`}
        confirmLabel={cancelLoading ? "Cancelando..." : "Cancelar reserva"}
        tone="danger"
        confirmDisabled={cancelLoading}
        onCancel={() => { if (!cancelLoading) { setCancelError(""); setCancelTarget(null); } }}
        onConfirm={() => void handleCancelReservation()}
      >
        <div className="space-y-3">
          <div className="rounded-2xl border border-brand-line bg-[#FCFAF7] p-4 text-sm text-neutral-600">Las mesas asociadas se liberarán y la reserva quedará guardada como cancelada.</div>
          <label className="block space-y-2 text-sm text-brand-ink">
            <span className="font-medium">Motivo (opcional)</span>
            <textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} maxLength={500} rows={3} className="w-full resize-none rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange" placeholder="Dejá una nota para el historial" />
          </label>
          {cancelError ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{cancelError}</p> : null}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Eliminar reserva cancelada"
        description={`Vas a eliminar definitivamente la reserva de ${deleteTarget?.fullName || "este cliente"}. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar reserva"
        tone="danger"
        onCancel={() => { setDeleteError(""); setDeleteTarget(null); }}
        onConfirm={() => void handleDeleteReservation()}
      />
      {deleteError ? <p className="fixed bottom-5 right-5 z-50 max-w-md rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{deleteError}</p> : null}

      <AppModal
        open={createOpen}
        onClose={() => {
          setFormError("");
          setCreateOpen(false);
        }}
        title="Nueva reserva"
        description="Crea una reserva manual con horario real; el sistema asigna el turno automaticamente."
        widthClassName="max-w-2xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="flex-1 rounded-full border border-brand-line px-4 py-3 text-sm font-medium text-brand-ink"
            >
              Cancelar
            </button>
            <button type="button" onClick={() => void handleCreate()} className="flex-1 rounded-full bg-brand-orange px-4 py-3 text-sm font-medium text-white">
              Crear reserva
            </button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-brand-ink">
            <span className="font-medium">Nombre del cliente</span>
            <input
              value={reservationForm.fullName}
              onChange={(event) => setReservationForm((current) => ({ ...current, fullName: event.target.value }))}
              placeholder="Ej: Graciela Guzman"
              className="w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange"
            />
          </label>
          <label className="space-y-2 text-sm text-brand-ink">
            <span className="font-medium">Telefono</span>
            <input
              value={reservationForm.phone}
              onChange={(event) => setReservationForm((current) => ({ ...current, phone: event.target.value }))}
              placeholder="Ej: 5492213800680"
              className="w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange"
            />
          </label>
          <label className="space-y-2 text-sm text-brand-ink">
            <span className="font-medium">Email</span>
            <input
              type="email"
              value={reservationForm.email}
              onChange={(event) => setReservationForm((current) => ({ ...current, email: event.target.value }))}
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
              value={reservationForm.partySize}
              onChange={(event) => setReservationForm((current) => ({ ...current, partySize: event.target.value, selectedTableIds: [] }))}
              placeholder="Ej: 4"
              className="w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange"
            />
          </label>
          <label className="space-y-2 text-sm text-brand-ink">
            <span className="font-medium">Fecha de reserva</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => { setSelectedDate(event.target.value); setReservationForm((current) => ({ ...current, selectedTableIds: [] })); }}
              className="w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange"
            />
          </label>
          <label className="space-y-2 text-sm text-brand-ink">
            <span className="font-medium">Horario</span>
            <input
              type="time"
              value={reservationForm.serviceTime}
              onChange={(event) => setReservationForm((current) => ({ ...current, serviceTime: event.target.value, selectedTableIds: [] }))}
              className="w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange"
            />
          </label>
          {canCreateEvents && !isEventsUser ? <div className="space-y-2 text-sm text-brand-ink md:col-span-2">
            <span className="font-medium">Tipo de reserva</span>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setReservationForm((current) => ({ ...current, reservationKind: "standard", eventRooms: [] }))} className={`rounded-2xl border px-4 py-3 text-left ${reservationForm.reservationKind === "standard" ? "border-brand-orange bg-[#FFF4ED]" : "border-brand-line bg-white"}`}>
                <span className="block font-semibold">Reserva estándar</span><span className="text-xs text-neutral-500">Usa las reglas y mesas habituales.</span>
              </button>
              <button type="button" onClick={() => setReservationForm((current) => ({ ...current, reservationKind: "event", selectedTableIds: [], tableSelectionMode: "automatic", eventRooms: current.eventRooms.length ? current.eventRooms : [] }))} className={`rounded-2xl border px-4 py-3 text-left ${reservationForm.reservationKind === "event" ? "border-brand-orange bg-[#FFF4ED]" : "border-brand-line bg-white"}`}>
                <span className="block font-semibold">Reserva de evento</span><span className="text-xs text-neutral-500">Distribuí grupos grandes entre varios salones.</span>
              </button>
            </div>
          </div> : isEventsUser ? <p className="text-sm font-medium text-brand-ink md:col-span-2">Tipo de reserva: evento</p> : null}
          {reservationForm.reservationKind === "event" ? <div className="space-y-4 rounded-2xl border border-brand-orange bg-[#FFF9F5] p-4 text-sm text-brand-ink md:col-span-2">
            <div className="flex flex-col items-stretch justify-between gap-3 md:flex-row md:items-start">
              <div className="min-w-0 flex-1"><p className="font-semibold text-brand-ink">Salones del evento</p><p className="mt-1 max-w-2xl text-xs leading-relaxed text-neutral-700">Seleccioná los salones y distribuí manualmente los cubiertos. Cada salón elegido queda bloqueado para reservas normales en este servicio.</p></div>
              <div className={`w-full rounded-xl border px-3 py-2 text-left md:w-auto md:min-w-[190px] md:text-right ${eventDistributionStatus === "complete" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : eventDistributionStatus === "exceeded" ? "border-red-300 bg-red-50 text-red-800" : "border-brand-line bg-white text-brand-ink"}`}>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em]">Distribución de cubiertos</p>
                <p className="mt-0.5 text-sm font-bold">{eventAllocatedCovers} de {eventTotalCovers} asignados</p>
                <p className="mt-0.5 text-[11px] font-medium">{eventDistributionStatus === "complete" ? "Distribución completa" : eventDistributionStatus === "exceeded" ? `Excede por ${eventAllocatedCovers - eventTotalCovers}` : `Faltan ${eventTotalCovers - eventAllocatedCovers}`}</p>
              </div>
            </div>
            <div className="space-y-2">
              {(selectedBranch?.rooms || []).map((room) => {
                const assignment = reservationForm.eventRooms.find((item) => item.roomId === room.id);
                const capacity = totalTableCapacity(room.tables);
                return <div key={room.id} className={`rounded-xl border p-3 transition-colors ${assignment ? "border-brand-orange bg-[#FFF9F5] shadow-[0_0_0_1px_rgba(255,90,31,0.12)]" : "border-brand-line bg-white"}`}>
                  <label className="flex cursor-pointer items-start gap-3 text-brand-ink"><input aria-label={`Seleccionar ${room.name}`} className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[#FF5A1F]" type="checkbox" checked={Boolean(assignment)} onChange={(event) => setReservationForm((current) => ({ ...current, eventRooms: event.target.checked ? [...current.eventRooms, { roomId: room.id, allocatedCovers: "", usage: "partial" }] : current.eventRooms.filter((item) => item.roomId !== room.id) }))} /><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-brand-ink">{room.name}</span><span className="mt-1 block text-xs leading-relaxed text-neutral-700">Capacidad nominal: {capacity} cubiertos.</span></span></label>
                  {assignment ? <div className="mt-3 grid gap-3 rounded-xl border border-[#F2D8CA] bg-white p-3 sm:grid-cols-2"><label className="space-y-1"><span className="block text-xs font-bold text-brand-ink">Cubiertos asignados</span><span className="block text-[11px] leading-relaxed text-neutral-700">Personas de este evento que se ubicarán en {room.name}.</span><input type="number" min={1} inputMode="numeric" value={assignment.allocatedCovers} placeholder="Ej. 40" onChange={(event) => setReservationForm((current) => ({ ...current, eventRooms: current.eventRooms.map((item) => item.roomId === room.id ? { ...item, allocatedCovers: event.target.value } : item) }))} className="w-full rounded-xl border border-brand-line bg-white px-3 py-2 text-brand-ink placeholder:text-neutral-500" /></label><label className="space-y-1"><span className="block text-xs font-bold text-brand-ink">Uso físico del salón</span><span className="block text-[11px] leading-relaxed text-neutral-700">Parcial usa una zona; total usa el salón completo. Ambos bloquean reservas normales.</span><FoodieSelect value={assignment.usage} onChange={(event) => setReservationForm((current) => ({ ...current, eventRooms: current.eventRooms.map((item) => item.roomId === room.id ? { ...item, usage: event.target.value as "partial" | "full" } : item) }))}><option value="partial">Parcial</option><option value="full">Total</option></FoodieSelect></label></div> : null}
                </div>;
              })}
            </div>
          </div> : <>
          <label className="space-y-2 text-sm text-brand-ink md:col-span-2">
            <span className="font-medium">Salón</span>
            <FoodieSelect
              value={selectedRoomId}
              onChange={(event) => {
                setSelectedRoomId(event.target.value);
                setReservationForm((current) => ({ ...current, preferredZone: "", selectedTableIds: [] }));
              }}
              className="font-medium"
            >
              {selectedBranch?.rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </FoodieSelect>
          </label>
          <div className="space-y-2 text-sm text-brand-ink md:col-span-2">
            <span className="font-medium">Asignación de mesas</span>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                ["automatic", "Automática", "Foodie elige la mejor opción"],
                ["configured", "Combinación configurada", "Usá mesas o cadenas del salón"],
                ["manual", "Selección manual", "Elegí cualquier mesa libre"]
              ].map(([mode, title, description]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setReservationForm((current) => ({ ...current, tableSelectionMode: mode as "automatic" | "configured" | "manual", selectedTableIds: [] }))}
                  className={`rounded-2xl border px-3 py-3 text-left transition ${reservationForm.tableSelectionMode === mode ? "border-brand-orange bg-[#FFF4ED]" : "border-brand-line bg-white hover:border-brand-orange"}`}
                >
                  <span className="block text-sm font-semibold text-brand-ink">{title}</span>
                  <span className="mt-1 block text-xs text-neutral-500">{description}</span>
                </button>
              ))}
            </div>

            {reservationForm.tableSelectionMode === "configured" ? (
              <>
                <FoodieSelect
                  value={reservationForm.selectedTableIds.join("|")}
                  onChange={(event) => setReservationForm((current) => ({
                    ...current,
                    selectedTableIds: event.target.value ? event.target.value.split("|") : []
                  }))}
                  className="font-medium"
                  disabled={configuredOptionsLoading}
                >
                  <option value="">Elegí una mesa o combinación</option>
                  {tableOptions.map((option) => (
                    <option key={option.tableIds.join("|")} value={option.tableIds.join("|")}>
                      {option.tableLabels.join(" + ")} · {option.seats} pax
                    </option>
                  ))}
                </FoodieSelect>
                {configuredOptionsError ? <p className="flex items-center gap-2 text-xs text-red-600"><span>{configuredOptionsError}</span><button type="button" onClick={() => setTableOptionsRetry((current) => current + 1)} className="font-semibold underline">Reintentar</button></p> : <p className="text-xs text-neutral-500">{configuredOptionsLoading ? "Buscando combinaciones disponibles..." : tableOptions.length ? "Las combinaciones respetan los vínculos configurados del salón." : "No hay opciones configuradas disponibles para estos datos."}</p>}
              </>
            ) : null}

            {reservationForm.tableSelectionMode === "manual" ? (
              <div className="rounded-2xl border border-brand-orange bg-[#FFF9F5] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-neutral-600">Podés combinar mesas libres aunque no tengan un vínculo configurado. La disponibilidad se valida al guardar.</p>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-brand-orange">{manualSelectedTables.length} mesas · {manualSelectedCapacity} pax</span>
                </div>
                {!manualTablesLoading && !manualTablesError ? <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {manualTableCards.map((table) => {
                    const selected = reservationForm.selectedTableIds.includes(table.id);
                    return (
                      <button key={table.id} type="button" disabled={!table.isAvailable} onClick={() => setReservationForm((current) => ({
                        ...current,
                        selectedTableIds: selected ? current.selectedTableIds.filter((id) => id !== table.id) : [...current.selectedTableIds, table.id]
                      }))} className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition ${!table.isAvailable ? "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400" : selected ? "border-brand-orange bg-white" : "border-[#F0D8C9] bg-white/70 hover:border-brand-orange"}`}>
                        <span className="font-semibold">Mesa {table.label}{!table.isAvailable ? " · No disponible" : ""}</span>
                        <span className="text-xs font-medium">{table.seats} pax</span>
                      </button>
                    );
                  })}
                </div> : null}
                {manualTablesLoading ? <p className="mt-3 text-xs text-neutral-500">Buscando mesas libres...</p> : manualTablesError ? <p className="mt-3 flex items-center gap-2 text-xs text-red-600"><span>{manualTablesError}</span><button type="button" onClick={() => setTableOptionsRetry((current) => current + 1)} className="font-semibold underline">Reintentar</button></p> : !manualTableOptions.length ? <p className="mt-3 text-xs text-neutral-500">No hay mesas libres para estos datos.</p> : null}
              </div>
            ) : null}
          </div>
          </>}
          <label className="space-y-2 text-sm text-brand-ink md:col-span-2">
            <span className="font-medium">Cumpleanos</span>
            <input
              type="date"
              value={reservationForm.birthday}
              onChange={(event) => setReservationForm((current) => ({ ...current, birthday: event.target.value }))}
              className="w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange"
            />
          </label>
          <label className="space-y-2 text-sm text-brand-ink md:col-span-2">
            <span className="font-medium">Preferencia de zona</span>
            <FoodieSelect
              value={reservationForm.preferredZone}
              onChange={(event) => setReservationForm((current) => ({ ...current, preferredZone: event.target.value, selectedTableIds: [] }))}
              className="font-medium"
            >
              <option value="">Sin preferencia de zona</option>
              {zonePills.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </FoodieSelect>
          </label>
          <label className="space-y-2 text-sm text-brand-ink md:col-span-2">
            <span className="font-medium">Notas</span>
            <textarea
              value={reservationForm.notes}
              onChange={(event) => setReservationForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Ej: Prefiere mesa tranquila, llega 20:30."
              className="h-28 w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange"
            />
          </label>
          {formError ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 md:col-span-2">
              {formError}
            </p>
          ) : null}
        </div>
      </AppModal>
    </WorkspaceShell>
  );
}
