"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CalendarDays, LockKeyhole, LockOpen, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { AppModal } from "./app-modal";
import { ConfirmDialog } from "./confirm-dialog";
import { FoodieSelect } from "./foodie-select";
import { ReservationTableReassignModal } from "./reservation-table-reassign-modal";
import { WorkspaceShell } from "./workspace-shell";
import { useWorkspace } from "./workspace-provider";
import type { Reservation, Room, RoomBookingRule, RoomLayoutImpact } from "../lib/types";
import { totalTableCapacity } from "../lib/table-capacity";

const weekdayOptions = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
type BookingRuleForm = { id?: string; weekdays: number[]; turns: Array<"mediodia" | "noche">; startsAt: string; endsAt: string; reason: string };
const newBookingRuleForm = (startsAt: string): BookingRuleForm => ({ weekdays: [1, 2, 3, 4, 5], turns: ["mediodia", "noche"], startsAt, endsAt: "", reason: "" });

type EditorKind =
  | "wall"
  | "window"
  | "column"
  | "corridor"
  | "screen"
  | "stairs"
  | "bathroom"
  | "round"
  | "square"
  | "rectangular";

type EditorItem = {
  id: string;
  kind: EditorKind;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  seats?: number;
  tableId?: string;
  zoneId?: string | null;
  isReservable?: boolean;
  isCombinable?: boolean;
  metadata?: Record<string, unknown>;
};

type LayoutPayload = {
  zones: Room["zones"];
  items: Array<{ id: string; kind: string; label: string; x: number; y: number; width: number; height: number; rotation: number; metadata: Record<string, unknown> }>;
  tables: Array<{ id: string; label: string; shape: string; seats: number; x: number; y: number; width: number; height: number; rotation: number; isReservable: boolean; metadata: TableItemMetadata; zoneId: string | null }>;
  combinations: Array<{ id: string; parentTableId: string; childTableId: string; combinedSeats: number }>;
};

type TableItemMetadata = {
  manualFeatures?: {
    hasTvView?: boolean;
    hasWindowView?: boolean;
  };
  capacity?: {
    minPartySize?: number;
    maxPartySize?: number;
  };
  derivedFeatures?: {
    nearWindow?: boolean;
    nearColumn?: boolean;
    nearWall?: boolean;
    nearCorridor?: boolean;
  };
};

type PendingTableDraft = {
  kind: Extract<EditorKind, "round" | "square" | "rectangular">;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  seats: number;
};

type TableModalState = {
  label: string;
  zoneId: string;
  seats: string;
  minPartySize: string;
  maxPartySize: string;
  isReservable: boolean;
  isCombinable: boolean;
  hasTvView: boolean;
  hasWindowView: boolean;
  combinationTableIds: string[];
};

type DesignSnapshot = {
  items: EditorItem[];
  combinationKeys: string[];
};

type RoomFormState = {
  name: string;
  description: string;
  isOutdoor: boolean;
};

type RoomModalMode = "" | "create" | "edit";

type ResizeHandle = "nw" | "ne" | "sw" | "se" | "w" | "e";

const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 960;
const STORAGE_PREFIX = "foodie_salon_editor_v3";
const GRID_UNIT = 32;

const paletteItems: Array<{
  kind: EditorKind;
  label: string;
  width: number;
  height: number;
  seats?: number;
}> = [
  { kind: "round", label: "Mesa redonda", width: 112, height: 112, seats: 4 },
  { kind: "square", label: "Mesa cuadrada", width: 104, height: 104, seats: 4 },
  { kind: "rectangular", label: "Mesa rectangular", width: 160, height: 104, seats: 6 },
  { kind: "wall", label: "Pared", width: 220, height: 16 },
  { kind: "window", label: "Ventana", width: 160, height: 14 },
  { kind: "column", label: "Columna", width: 58, height: 58 },
  { kind: "corridor", label: "Pasillo", width: 220, height: 92 },
  { kind: "screen", label: "Televisor / Proyector", width: 160, height: 92 },
  { kind: "stairs", label: "Escalera", width: 132, height: 112 },
  { kind: "bathroom", label: "Baño", width: 112, height: 112 }
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function shapeClass(kind: EditorKind) {
  if (kind === "round") return "rounded-full";
  if (kind === "square" || kind === "rectangular") return "rounded-[22px]";
  if (kind === "column" || kind === "bathroom") return "rounded-[18px]";
  if (kind === "stairs" || kind === "corridor") return "rounded-[12px]";
  return "rounded-sm";
}

function staticItemClass(kind: EditorKind) {
  switch (kind) {
    case "wall":
      return "bg-[#1F1F21] border-[#1F1F21]";
    case "window":
      return "bg-[#CDEEFF] border-[#7EC8F8]";
    case "column":
      return "bg-[#E8E0D6] border-[#9A8B7B]";
    case "corridor":
      return "bg-[#F6F2EE] border-[#DDD1C5]";
    case "screen":
      return "bg-[#1B2431] border-[#475569]";
    case "stairs":
      return "bg-[repeating-linear-gradient(0deg,#F8EFE4_0,#F8EFE4_13px,#C98B50_14px,#C98B50_18px)] border-[#B77943]";
    case "bathroom":
      return "bg-[#E8F7F4] border-[#5AAEA1]";
    default:
      return "border-[#1F1F21] bg-[#FFF9F5]";
  }
}

function isTableKind(kind: EditorKind): kind is "round" | "square" | "rectangular" {
  return kind === "round" || kind === "square" || kind === "rectangular";
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join("__");
}

function normalizeRotation(value: number) {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function ResizeHandleIcon(_props: { mode: "x" | "xy" }) {
  return null;
}

function PalettePreview({
  kind,
  label,
  seats
}: {
  kind: EditorKind;
  label: string;
  seats?: number;
}) {
  const width = kind === "rectangular" ? "w-20" : kind === "wall" || kind === "corridor" || kind === "window" ? "w-24" : "w-14";
  const height = kind === "wall" || kind === "window" ? "h-2" : kind === "corridor" ? "h-10" : "h-14";

  return (
    <div className="flex items-center gap-4">
      <div className={`flex shrink-0 items-center justify-center border-2 ${shapeClass(kind)} ${staticItemClass(kind)} ${width} ${height}`}>
        {seats ? <span className="text-[10px] font-semibold text-brand-ink">{seats}</span> : null}
        {kind === "bathroom" ? <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#237C72]">WC</span> : null}
      </div>
      <div>
        <p className="text-sm font-semibold text-brand-ink">{label}</p>
        <p className="text-xs text-neutral-500">{seats ? `${seats} comensales` : "Elemento fijo"}</p>
      </div>
    </div>
  );
}

function getResizeHandles(kind: EditorKind): ResizeHandle[] {
  if (kind === "wall" || kind === "window") {
    return ["w", "e"];
  }

  return ["nw", "ne", "sw", "se", "w", "e"];
}

function canResize(_kind: EditorKind) {
  return false;
}

function isLinearResize(_kind: EditorKind) {
  return true;
}

function minimumWidth(kind: EditorKind) {
  if (kind === "column") return 40;
  if (kind === "wall" || kind === "window") return 80;
  if (kind === "stairs" || kind === "bathroom") return 64;
  return 60;
}

function minimumHeight(kind: EditorKind) {
  if (kind === "wall") return 16;
  if (kind === "window") return 14;
  if (kind === "stairs" || kind === "bathroom") return 64;
  return 40;
}

function resizeHandlePosition(handle: ResizeHandle) {
  switch (handle) {
    case "nw":
      return "-left-2 -top-2 cursor-nwse-resize";
    case "ne":
      return "-right-2 -top-2 cursor-nesw-resize";
    case "sw":
      return "-bottom-2 -left-2 cursor-nesw-resize";
    case "se":
      return "-bottom-2 -right-2 cursor-nwse-resize";
    case "w":
      return "-left-2 top-1/2 -translate-y-1/2 cursor-ew-resize";
    case "e":
      return "-right-2 top-1/2 -translate-y-1/2 cursor-ew-resize";
  }
}

function distanceBetweenRects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const dx = Math.max(0, a.x - bx2, b.x - ax2);
  const dy = Math.max(0, a.y - by2, b.y - ay2);

  return Math.sqrt(dx * dx + dy * dy);
}

function deriveTableMetadata(
  table: Pick<EditorItem, "x" | "y" | "width" | "height" | "metadata">,
  items: EditorItem[]
): TableItemMetadata {
  const fixedItems = items.filter((item) => !isTableKind(item.kind));
  const near = (kind: EditorItem["kind"], threshold: number) =>
    fixedItems
      .filter((item) => item.kind === kind)
      .some((item) => distanceBetweenRects(table, item) <= threshold);

  const source = (table.metadata || {}) as TableItemMetadata;

  return {
    manualFeatures: {
      hasTvView: Boolean(source.manualFeatures?.hasTvView)
    },
    capacity: {
      minPartySize: source.capacity?.minPartySize,
      maxPartySize: source.capacity?.maxPartySize
    },
    derivedFeatures: {
      nearWindow: near("window", 120),
      nearColumn: near("column", 90),
      nearWall: near("wall", 80),
      nearCorridor: near("corridor", 120)
    }
  };
}

function serializeSnapshot(snapshot: DesignSnapshot) {
  return JSON.stringify(snapshot);
}

function getRoomMetrics(room: Room) {
  const totalSeats = room.tables.reduce((sum, table) => sum + table.seats, 0);
  const reservableCount = room.tables.filter((table) => table.isReservable).length;
  const tvViewCount = room.tables.filter((table) => table.metadata?.manualFeatures?.hasTvView).length;
  const zoneCount = room.zones.length;

  return {
    totalSeats,
    reservableCount,
    tvViewCount,
    zoneCount
  };
}

function buildEditorItems(roomDetail: NonNullable<ReturnType<typeof useWorkspace>["roomDetail"]>) {
  const fixedItems: EditorItem[] = roomDetail.floorPlanItems
    .filter((item) => ["wall", "window", "column", "corridor", "screen", "stairs", "bathroom"].includes(item.kind))
    .map((item) => ({
      id: item.id,
      kind: item.kind as EditorKind,
      label: item.label || item.kind,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      rotation: item.rotation || 0,
      metadata: item.metadata || undefined
    }));

  const tableItems: EditorItem[] = roomDetail.tables.map((table) => {
    return {
      id: `editor-${table.id}`,
      kind: table.shape as EditorKind,
      label: table.label,
      x: table.x,
      y: table.y,
      width: table.width,
      height: table.height,
      rotation: table.rotation || 0,
      seats: table.seats,
      tableId: table.id,
      zoneId: table.zoneId,
      metadata: table.metadata || undefined,
      isReservable: table.isReservable,
      isCombinable: roomDetail.combinations.some(
        (combo) => combo.parentTableId === table.id || combo.childTableId === table.id
      )
    };
  });

  const combinationKeys = roomDetail.combinations.map((combo) => pairKey(`editor-${combo.parentTableId}`, `editor-${combo.childTableId}`));

  return {
    items: [...fixedItems, ...tableItems],
    combinationKeys
  };
}

export function SalonPage() {
  const {
    bootstrap,
    selectedBranchId,
    selectedDate,
    selectedTurn,
    selectedRoomId,
    setSelectedRoomId,
    setSelectedBranchId,
    setSelectedDate,
    setSelectedTurn,
    roomDetail,
    createRoom,
    updateRoom,
    reorderRooms,
    roomBlocks,
    blockRoom,
    unblockRoom,
    loadRoomBookingRules,
    createRoomBookingRule,
    updateRoomBookingRule,
    deleteRoomBookingRule,
    deleteRoom,
    saveRoomLayout,
    loadRoomLayoutImpact,
    moveReservation,
    roomForm,
    setRoomForm
  } = useWorkspace();

  const selectedBranch = bootstrap?.branches.find((branch) => branch.id === selectedBranchId);
  const rooms = selectedBranch?.rooms || [];
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const canvasSurfaceRef = useRef<HTMLDivElement | null>(null);
  const [editorItems, setEditorItems] = useState<EditorItem[]>([]);
  const [editorZones, setEditorZones] = useState<Room["zones"]>([]);
  const [newZoneName, setNewZoneName] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [zoom, setZoom] = useState(1);
  const [openedRoomId, setOpenedRoomId] = useState("");
  const [roomModalMode, setRoomModalMode] = useState<RoomModalMode>("");
  const [editingRoomId, setEditingRoomId] = useState("");
  const [roomEditor, setRoomEditor] = useState<RoomFormState>({ name: "", description: "", isOutdoor: false });
  const [roomPendingDelete, setRoomPendingDelete] = useState<Room | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [pendingTableDraft, setPendingTableDraft] = useState<PendingTableDraft | null>(null);
  const [editingTableItemId, setEditingTableItemId] = useState("");
  const [tableModal, setTableModal] = useState<TableModalState>({
    label: "",
    zoneId: "",
    seats: "4",
    minPartySize: "1",
    maxPartySize: "4",
    isReservable: true,
    isCombinable: false,
    hasTvView: false,
    hasWindowView: false,
    combinationTableIds: []
  });
  const [combinationKeys, setCombinationKeys] = useState<string[]>([]);
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const [layoutError, setLayoutError] = useState("");
  const [layoutImpact, setLayoutImpact] = useState<RoomLayoutImpact | null>(null);
  const [pendingLayoutPayload, setPendingLayoutPayload] = useState<LayoutPayload | null>(null);
  const [pendingTableDeletionSnapshot, setPendingTableDeletionSnapshot] = useState<DesignSnapshot | null>(null);
  const [layoutImpactFocusTableId, setLayoutImpactFocusTableId] = useState("");
  const [impactReassignReservation, setImpactReassignReservation] = useState<Reservation | null>(null);
  const [completingImpactReservationId, setCompletingImpactReservationId] = useState("");
  const [isReorderingRooms, setIsReorderingRooms] = useState(false);
  const [changingBlockRoomId, setChangingBlockRoomId] = useState("");
  const [bookingRuleRoom, setBookingRuleRoom] = useState<Room | null>(null);
  const [bookingRules, setBookingRules] = useState<RoomBookingRule[]>([]);
  const [bookingRuleForm, setBookingRuleForm] = useState<BookingRuleForm>(() => newBookingRuleForm(selectedDate));
  const [bookingRulesLoading, setBookingRulesLoading] = useState(false);
  const [bookingRuleSaving, setBookingRuleSaving] = useState(false);
  const [bookingRuleError, setBookingRuleError] = useState("");
  const [openRoomMenuId, setOpenRoomMenuId] = useState("");
  const dragMovedRef = useRef(false);
  const undoStackRef = useRef<DesignSnapshot[]>([]);
  const baselineSnapshotRef = useRef("");
  const [openItemMenuId, setOpenItemMenuId] = useState("");
  const [canvasViewportSize, setCanvasViewportSize] = useState({ width: 0, height: 0 });

  const activeRoom = rooms.find((room) => room.id === openedRoomId) || null;
  const storageKey = selectedRoomId ? `${STORAGE_PREFIX}:${selectedRoomId}` : "";
  const isEditorOpen = Boolean(openedRoomId && activeRoom);
  const selectedItem = editorItems.find((item) => item.id === selectedItemId) || null;
  const workspaceWidth = Math.max(CANVAS_WIDTH, Math.floor(Math.max(0, canvasViewportSize.width - 40) / Math.max(zoom, 0.01)));
  const workspaceHeight = Math.max(CANVAS_HEIGHT, Math.floor(Math.max(0, canvasViewportSize.height - 40) / Math.max(zoom, 0.01)));
  const scaledWorkspaceWidth = workspaceWidth * zoom;
  const scaledWorkspaceHeight = workspaceHeight * zoom;
  const gridSize = Math.max(14, Math.round(GRID_UNIT * zoom));
  const gridBackground = {
    backgroundImage:
      "linear-gradient(rgba(31,31,33,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(31,31,33,0.08) 1px, transparent 1px)",
    backgroundSize: `${gridSize}px ${gridSize}px`
  };

  function createSnapshot(items = editorItems, nextCombinationKeys = combinationKeys): DesignSnapshot {
    return {
      items,
      combinationKeys: nextCombinationKeys
    };
  }

  function resetHistory(snapshot: DesignSnapshot) {
    undoStackRef.current = [];
    baselineSnapshotRef.current = serializeSnapshot(snapshot);
  }

  function pushUndoSnapshot(snapshot = createSnapshot()) {
    const serialized = serializeSnapshot(snapshot);
    const lastSnapshot = undoStackRef.current[undoStackRef.current.length - 1];

    if (lastSnapshot && serializeSnapshot(lastSnapshot) === serialized) {
      return;
    }

    undoStackRef.current.push(snapshot);
  }

  function undoLastChange() {
    const previousSnapshot = undoStackRef.current.pop();
    if (!previousSnapshot) return;

    setEditorItems(previousSnapshot.items);
    setCombinationKeys(previousSnapshot.combinationKeys);
    setSelectedItemId("");
    closeTableModal();
    setLastSavedAt("");
  }

  useEffect(() => {
    if (!roomDetail || !storageKey) {
      setEditorItems([]);
      setEditorZones([]);
      setCombinationKeys([]);
      setSelectedItemId("");
      setLayoutImpact(null);
      setPendingLayoutPayload(null);
      setPendingTableDeletionSnapshot(null);
      setLayoutImpactFocusTableId("");
      resetHistory({ items: [], combinationKeys: [] });
      setHasUnsavedChanges(false);
      setLastSavedAt("");
      setLayoutError("");
      return;
    }

    const fallback = buildEditorItems(roomDetail);
    setEditorZones(roomDetail.zones);
    window.localStorage.removeItem(storageKey);
    setEditorItems(fallback.items);
    setCombinationKeys(fallback.combinationKeys);
    setSelectedItemId("");
    setLayoutImpact(null);
    setPendingLayoutPayload(null);
    setPendingTableDeletionSnapshot(null);
    setLayoutImpactFocusTableId("");
    resetHistory(fallback);
    setHasUnsavedChanges(false);
    setLastSavedAt("");
    setLayoutError("");
  }, [roomDetail, storageKey]);

  useEffect(() => {
    if (!editorItems.length && !combinationKeys.length) {
      setHasUnsavedChanges(false);
      return;
    }

    setHasUnsavedChanges(serializeSnapshot(createSnapshot()) !== baselineSnapshotRef.current);
  }, [editorItems, combinationKeys]);

  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;

    const updateViewport = () => {
      setCanvasViewportSize({
        width: node.clientWidth,
        height: node.clientHeight
      });
    };

    updateViewport();
    const observer = new ResizeObserver(updateViewport);
    observer.observe(node);
    window.addEventListener("resize", updateViewport);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateViewport);
    };
  }, [isEditorOpen]);

  const activeCombinationKeys = useMemo(
    () =>
      combinationKeys.filter((key) => {
        const [a, b] = key.split("__");
        return editorItems.some((item) => item.id === a) && editorItems.some((item) => item.id === b);
      }),
    [combinationKeys, editorItems]
  );

  const possibleTableChains = useMemo(() => {
    const tables = editorItems
      .filter((item) => isTableKind(item.kind))
      .sort((left, right) => left.label.localeCompare(right.label, "es", { numeric: true, sensitivity: "base" }));
    const tablesById = new Map(tables.map((table) => [table.id, table]));
    const graph = new Map<string, Set<string>>();

    activeCombinationKeys.forEach((key) => {
      const [leftId, rightId] = key.split("__");
      if (!tablesById.has(leftId) || !tablesById.has(rightId)) return;
      if (!graph.has(leftId)) graph.set(leftId, new Set());
      if (!graph.has(rightId)) graph.set(rightId, new Set());
      graph.get(leftId)!.add(rightId);
      graph.get(rightId)!.add(leftId);
    });

    const chains = new Map<string, string[]>();
    const visit = (selectedIds: Set<string>) => {
      if (selectedIds.size >= 2) {
        const canonicalIds = [...selectedIds].sort();
        chains.set(canonicalIds.join("__"), canonicalIds);
      }

      const nextIds = new Set<string>();
      selectedIds.forEach((id) => {
        graph.get(id)?.forEach((neighbourId) => {
          if (!selectedIds.has(neighbourId)) nextIds.add(neighbourId);
        });
      });
      nextIds.forEach((nextId) => visit(new Set([...selectedIds, nextId])));
    };

    tables.forEach((table) => visit(new Set([table.id])));

    return [...chains.values()]
      .map((tableIds) => tableIds.map((id) => tablesById.get(id)).filter((table): table is EditorItem => Boolean(table)).sort((left, right) => left.label.localeCompare(right.label, "es", { numeric: true, sensitivity: "base" })))
      .sort((left, right) => {
        if (left.length !== right.length) return left.length - right.length;
        const capacityDifference = totalTableCapacity(left) - totalTableCapacity(right);
        if (capacityDifference !== 0) return capacityDifference;
        return left.map((table) => table.label).join(" + ").localeCompare(right.map((table) => table.label).join(" + "), "es", { numeric: true, sensitivity: "base" });
      });
  }, [activeCombinationKeys, editorItems]);

  const connectedTableIds = useMemo(() => {
    if (!selectedItemId || !isTableKind(editorItems.find((item) => item.id === selectedItemId)?.kind || "wall")) return new Set<string>();
    const graph = new Map<string, Set<string>>();
    activeCombinationKeys.forEach((key) => {
      const [left, right] = key.split("__");
      if (!graph.has(left)) graph.set(left, new Set());
      if (!graph.has(right)) graph.set(right, new Set());
      graph.get(left)!.add(right);
      graph.get(right)!.add(left);
    });
    const connected = new Set([selectedItemId]);
    const pending = [selectedItemId];
    while (pending.length) {
      const id = pending.pop()!;
      graph.get(id)?.forEach((neighbour) => {
        if (!connected.has(neighbour)) {
          connected.add(neighbour);
          pending.push(neighbour);
        }
      });
    }
    return connected;
  }, [activeCombinationKeys, editorItems, selectedItemId]);

  const tableCombinationOptions = useMemo(
    () =>
      editorItems.filter(
        (item) =>
          isTableKind(item.kind) &&
          item.id !== editingTableItemId &&
          (!pendingTableDraft || item.id !== selectedItemId)
      ),
    [editorItems, editingTableItemId, pendingTableDraft, selectedItemId]
  );

  function resetRoomEditor() {
    setRoomModalMode("");
    setEditingRoomId("");
    setRoomEditor({ name: "", description: "", isOutdoor: false });
    setRoomForm({ name: "", description: "", isOutdoor: false });
  }

  function openCreateRoomModal() {
    setRoomModalMode("create");
    setEditingRoomId("");
    setRoomEditor({ name: "", description: "", isOutdoor: false });
    setRoomForm({ name: "", description: "", isOutdoor: false });
  }

  function closeRoomModal() {
    resetRoomEditor();
  }

  async function handleCreateRoom() {
    await createRoom();
    resetRoomEditor();
  }

  async function handleUpdateRoom() {
    if (!editingRoomId) return;
    await updateRoom(editingRoomId, roomEditor);
    resetRoomEditor();
  }

  async function handleDeleteRoom(roomId: string) {
    await deleteRoom(roomId);
    if (selectedRoomId === roomId) setSelectedRoomId("");
    if (openedRoomId === roomId) setOpenedRoomId("");
    if (editingRoomId === roomId) resetRoomEditor();
    setRoomPendingDelete(null);
  }

  async function moveRoom(roomId: string, direction: -1 | 1) {
    const roomIndex = rooms.findIndex((room) => room.id === roomId);
    const nextIndex = roomIndex + direction;
    if (roomIndex < 0 || nextIndex < 0 || nextIndex >= rooms.length || isReorderingRooms) return;
    const nextRooms = [...rooms];
    [nextRooms[roomIndex], nextRooms[nextIndex]] = [nextRooms[nextIndex], nextRooms[roomIndex]];
    setIsReorderingRooms(true);
    try {
      await reorderRooms(selectedBranchId, nextRooms.map((room) => room.id));
    } finally {
      setIsReorderingRooms(false);
    }
  }

  async function toggleRoomBlock(roomId: string, isBlocked: boolean) {
    if (changingBlockRoomId) return;
    setChangingBlockRoomId(roomId);
    try {
      if (isBlocked) await unblockRoom(roomId);
      else await blockRoom(roomId);
    } finally {
      setChangingBlockRoomId("");
    }
  }

  async function openBookingRules(room: Room) {
    setBookingRuleRoom(room);
    setBookingRuleForm(newBookingRuleForm(selectedDate));
    setBookingRuleError("");
    setBookingRulesLoading(true);
    try {
      setBookingRules(await loadRoomBookingRules(room.id));
    } finally {
      setBookingRulesLoading(false);
    }
  }

  function editBookingRule(rule: RoomBookingRule) {
    setBookingRuleForm({ id: rule.id, weekdays: rule.weekdays, turns: rule.turns, startsAt: rule.startsAt.slice(0, 10), endsAt: rule.endsAt?.slice(0, 10) || "", reason: rule.reason || "" });
  }

  async function saveBookingRule() {
    if (!bookingRuleRoom || !bookingRuleForm.weekdays.length || !bookingRuleForm.turns.length || !bookingRuleForm.startsAt) return;
    setBookingRuleSaving(true);
    setBookingRuleError("");
    try {
      const input = { weekdays: bookingRuleForm.weekdays, turns: bookingRuleForm.turns, startsAt: bookingRuleForm.startsAt, endsAt: bookingRuleForm.endsAt || null, reason: bookingRuleForm.reason || null };
      const saved = bookingRuleForm.id
        ? await updateRoomBookingRule(bookingRuleRoom.id, bookingRuleForm.id, input)
        : await createRoomBookingRule(bookingRuleRoom.id, input);
      setBookingRules((current) => bookingRuleForm.id ? current.map((rule) => rule.id === saved.id ? saved : rule) : [...current, saved]);
      setBookingRuleForm(newBookingRuleForm(selectedDate));
    } catch (error) {
      setBookingRuleError(error instanceof Error ? error.message : "No se pudo guardar el bloqueo programado");
    } finally {
      setBookingRuleSaving(false);
    }
  }

  async function removeBookingRule(ruleId: string) {
    if (!bookingRuleRoom) return;
    await deleteRoomBookingRule(bookingRuleRoom.id, ruleId);
    setBookingRules((current) => current.filter((rule) => rule.id !== ruleId));
    if (bookingRuleForm.id === ruleId) setBookingRuleForm(newBookingRuleForm(selectedDate));
  }

  function openEditor(roomId: string) {
    setOpenedRoomId(roomId);
    setSelectedRoomId(roomId);
    setZoom(1);
    setSelectedItemId("");
  }

  function startEditRoom(room: (typeof rooms)[number]) {
    setRoomModalMode("edit");
    setEditingRoomId(room.id);
    setRoomEditor({
      name: room.name,
      description: room.description || "",
      isOutdoor: room.isOutdoor
    });
  }

  function persistMove(itemId: string, nextX: number, nextY: number) {
    setEditorItems((current) =>
      current.map((item) => {
        if (item.id !== itemId) return item;

        const x = clamp(nextX, 0, workspaceWidth - item.width);
        const y = clamp(nextY, 0, workspaceHeight - item.height);

        return item.x === x && item.y === y
          ? item
          : {
              ...item,
              x,
              y
            };
      })
    );
    setHasUnsavedChanges(true);
  }

  function openTableModal(item: EditorItem) {
    const metadata = (item.metadata || {}) as TableItemMetadata;
    const selectedCombinationIds = activeCombinationKeys
      .filter((key) => key.split("__").includes(item.id))
      .map((key) => key.split("__").find((id) => id !== item.id))
      .filter((id): id is string => Boolean(id));

    setEditingTableItemId(item.id);
    setTableModal({
      label: item.label,
      zoneId: item.zoneId || "",
      seats: String(item.seats || 4),
      minPartySize: String(metadata.capacity?.minPartySize || 1),
      maxPartySize: String(metadata.capacity?.maxPartySize || item.seats || 4),
      isReservable: item.isReservable ?? true,
      isCombinable: item.isCombinable ?? false,
      hasTvView: Boolean(metadata.manualFeatures?.hasTvView),
      hasWindowView: Boolean(metadata.manualFeatures?.hasWindowView),
      combinationTableIds: selectedCombinationIds
    });
  }

  function closeTableModal() {
    setPendingTableDraft(null);
    setEditingTableItemId("");
    setTableModal({
      label: "",
      zoneId: "",
      seats: "4",
      minPartySize: "1",
      maxPartySize: "4",
      isReservable: true,
      isCombinable: false,
      hasTvView: false,
      hasWindowView: false,
      combinationTableIds: []
    });
  }

  function persistResize(itemId: string, nextX: number, nextY: number, nextWidth: number, nextHeight: number) {
    setEditorItems((current) =>
      current.map((item) => {
        if (item.id !== itemId) return item;

        const width = clamp(nextWidth, minimumWidth(item.kind), workspaceWidth);
        const height = clamp(nextHeight, minimumHeight(item.kind), workspaceHeight);
        const x = clamp(nextX, 0, workspaceWidth - width);
        const y = clamp(nextY, 0, workspaceHeight - height);

        if (item.x === x && item.y === y && item.width === width && item.height === height) {
          return item;
        }

        return {
          ...item,
          x,
          y,
          width,
          height
        };
      })
    );
    setHasUnsavedChanges(true);
  }

  function rotateItem(itemId: string, delta: number) {
    pushUndoSnapshot();
    setEditorItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              rotation: normalizeRotation(item.rotation + delta)
            }
          : item
      )
    );
    setHasUnsavedChanges(true);
  }

  function setItemRotation(itemId: string, value: number) {
    setEditorItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              rotation: normalizeRotation(value)
            }
          : item
      )
    );
    setHasUnsavedChanges(true);
  }

  function getCanvasPoint(clientX: number, clientY: number) {
    const surface = canvasSurfaceRef.current;
    if (!surface) return null;

    const rect = surface.getBoundingClientRect();

    return {
      x: (clientX - rect.left) / zoom,
      y: (clientY - rect.top) / zoom
    };
  }

  function beginPointerDrag(event: React.PointerEvent<HTMLButtonElement>, item: EditorItem) {
    if (!canvasSurfaceRef.current) return;

    event.preventDefault();
    pushUndoSnapshot();
    dragMovedRef.current = false;
    const startPoint = getCanvasPoint(event.clientX, event.clientY);
    if (!startPoint) return;

    const offsetX = startPoint.x - item.x;
    const offsetY = startPoint.y - item.y;

    const move = (pointerEvent: PointerEvent) => {
      const point = getCanvasPoint(pointerEvent.clientX, pointerEvent.clientY);
      if (!point) return;

      const nextX = point.x - offsetX;
      const nextY = point.y - offsetY;
      if (Math.abs(nextX - item.x) > 2 || Math.abs(nextY - item.y) > 2) {
        dragMovedRef.current = true;
      }
      persistMove(item.id, nextX, nextY);
    };

    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.setTimeout(() => {
        dragMovedRef.current = false;
      }, 0);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function beginResize(event: React.PointerEvent<HTMLButtonElement>, item: EditorItem) {
    if (!canvasRef.current) return;

    event.preventDefault();
    event.stopPropagation();
    setSelectedItemId(item.id);
  }

  function beginRotate(event: React.PointerEvent<HTMLButtonElement>, item: EditorItem) {
    if (!canvasSurfaceRef.current) return;

    event.preventDefault();
    event.stopPropagation();
    pushUndoSnapshot();
    setSelectedItemId(item.id);
    const centerX = item.x + item.width / 2;
    const centerY = item.y + item.height / 2;

    const move = (pointerEvent: PointerEvent) => {
      const point = getCanvasPoint(pointerEvent.clientX, pointerEvent.clientY);
      if (!point) return;

      const pointerX = point.x;
      const pointerY = point.y;
      const angle = Math.atan2(pointerY - centerY, pointerX - centerX) * (180 / Math.PI) + 90;

      setItemRotation(item.id, angle);
    };

    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function beginResizeHandle(event: React.PointerEvent<HTMLButtonElement>, item: EditorItem, handle: ResizeHandle) {
    if (!canvasRef.current) return;

    event.preventDefault();
    event.stopPropagation();
    pushUndoSnapshot();
    setSelectedItemId(item.id);

    const angle = (item.rotation * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = item.width;
    const startHeight = item.height;
    const startCenterX = item.x + item.width / 2;
    const startCenterY = item.y + item.height / 2;

    const horizontalSign = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
    const verticalSign = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;

    const move = (pointerEvent: PointerEvent) => {
      const deltaCanvasX = (pointerEvent.clientX - startX) / zoom;
      const deltaCanvasY = (pointerEvent.clientY - startY) / zoom;
      const localDeltaX = deltaCanvasX * cos + deltaCanvasY * sin;
      const localDeltaY = -deltaCanvasX * sin + deltaCanvasY * cos;

      const proposedWidth =
        horizontalSign === 0 ? startWidth : startWidth + horizontalSign * localDeltaX;
      const proposedHeight =
        verticalSign === 0 ? startHeight : startHeight + verticalSign * localDeltaY;

      const width = Math.max(minimumWidth(item.kind), proposedWidth);
      const height = Math.max(minimumHeight(item.kind), proposedHeight);
      const appliedDeltaX = horizontalSign === 0 ? 0 : horizontalSign * (width - startWidth);
      const appliedDeltaY = verticalSign === 0 ? 0 : verticalSign * (height - startHeight);
      const centerX = startCenterX + cos * (appliedDeltaX / 2) - sin * (appliedDeltaY / 2);
      const centerY = startCenterY + sin * (appliedDeltaX / 2) + cos * (appliedDeltaY / 2);

      persistResize(
        item.id,
        centerX - width / 2,
        centerY - height / 2,
        width,
        height
      );
    };

    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function submitTableModal() {
    const seats = Number(tableModal.seats) || pendingTableDraft?.seats || 4;
    const minPartySize = Math.max(1, Number(tableModal.minPartySize) || 1);
    const maxPartySize = Math.max(minPartySize, Number(tableModal.maxPartySize) || seats);
    const currentTableId = editingTableItemId || "";
    const nextCombinationKeys = tableModal.isCombinable && currentTableId
      ? tableModal.combinationTableIds.map((otherId) => pairKey(currentTableId, otherId))
      : [];
    pushUndoSnapshot();

    if (editingTableItemId) {
      setEditorItems((current) =>
        current.map((item) =>
          item.id === editingTableItemId
            ? {
                ...item,
                label: tableModal.label.trim() || item.label,
                zoneId: tableModal.zoneId || null,
                seats,
                isReservable: tableModal.isReservable,
                isCombinable: tableModal.isCombinable,
                metadata: {
                  ...((item.metadata || {}) as TableItemMetadata),
                  capacity: {
                    minPartySize,
                    maxPartySize
                  },
                  manualFeatures: {
                    hasTvView: tableModal.hasTvView,
                    hasWindowView: tableModal.hasWindowView
                  }
                }
              }
            : item
        )
      );
      setCombinationKeys((current) => [
        ...current.filter((key) => !key.split("__").includes(editingTableItemId)),
        ...nextCombinationKeys
      ]);
      setHasUnsavedChanges(true);
      closeTableModal();
      return;
    }

    if (!pendingTableDraft) return;

    const itemId = `local-table-${Date.now()}`;
    const draftCombinationKeys = tableModal.isCombinable
      ? tableModal.combinationTableIds.map((otherId) => pairKey(itemId, otherId))
      : [];
    setEditorItems((current) => [
      ...current,
      {
        id: itemId,
        kind: pendingTableDraft.kind,
        label: tableModal.label.trim() || pendingTableDraft.label,
        zoneId: tableModal.zoneId || null,
        x: pendingTableDraft.x,
        y: pendingTableDraft.y,
        width: pendingTableDraft.width,
        height: pendingTableDraft.height,
        rotation: 0,
        seats,
        isReservable: tableModal.isReservable,
        isCombinable: tableModal.isCombinable,
        metadata: {
          capacity: {
            minPartySize,
            maxPartySize
          },
          manualFeatures: {
            hasTvView: tableModal.hasTvView,
            hasWindowView: tableModal.hasWindowView
          }
        }
      }
    ]);
    setCombinationKeys((current) => [...current, ...draftCombinationKeys]);
    setSelectedItemId(itemId);
    setHasUnsavedChanges(true);
    closeTableModal();
  }

  function handleCanvasDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!canvasSurfaceRef.current) return;

    const raw = event.dataTransfer.getData("application/foodie-item");
    if (!raw) return;

    const palette = JSON.parse(raw) as (typeof paletteItems)[number];
    const point = getCanvasPoint(event.clientX, event.clientY);
    if (!point) return;

    const nextX = clamp(point.x - palette.width / 2, 0, workspaceWidth - palette.width);
    const nextY = clamp(point.y - palette.height / 2, 0, workspaceHeight - palette.height);

    if (isTableKind(palette.kind)) {
      setPendingTableDraft({
        kind: palette.kind,
        label: palette.label,
        x: nextX,
        y: nextY,
        width: palette.width,
        height: palette.height,
        seats: palette.seats || 4
      });
      setTableModal({
        label: "",
        zoneId: "",
        seats: String(palette.seats || 4),
        minPartySize: "1",
        maxPartySize: String(palette.seats || 4),
        isReservable: true,
        isCombinable: false,
        hasTvView: false,
        hasWindowView: false,
        combinationTableIds: []
      });
      return;
    }

    pushUndoSnapshot();
    const itemId = `local-${palette.kind}-${Date.now()}`;
    setEditorItems((current) => [
      ...current,
      {
        id: itemId,
        kind: palette.kind,
        label: palette.label,
        x: nextX,
        y: nextY,
        width: palette.width,
        height: palette.height,
        rotation: 0
      }
    ]);
    setSelectedItemId(itemId);
    setHasUnsavedChanges(true);
  }

  function deleteItem(itemId: string) {
    pushUndoSnapshot();
    setEditorItems((current) => current.filter((item) => item.id !== itemId));
    if (selectedItemId === itemId) {
      setSelectedItemId("");
    }
    if (openItemMenuId === itemId) {
      setOpenItemMenuId("");
    }
    setHasUnsavedChanges(true);
  }

  function toggleCombination(key: string) {
    pushUndoSnapshot();
    setCombinationKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
    setHasUnsavedChanges(true);
  }

  async function deleteTableWithImpact(itemId: string) {
    setLayoutError("");
    const tableId = editorItems.find((item) => item.id === itemId)?.tableId || itemId;
    const deletionSnapshot = createSnapshot();
    const nextEditorItems = editorItems.filter((item) => item.id !== itemId);
    deleteItem(itemId);

    const payload = buildLayoutPayload(nextEditorItems);
    if (!payload || !selectedRoomId) return;

    setIsSavingLayout(true);
    try {
      const impact = await loadRoomLayoutImpact(selectedRoomId, payload, tableId);
      if (impact.reservations.length) {
        setPendingLayoutPayload(payload);
        setLayoutImpact(impact);
        setPendingTableDeletionSnapshot(deletionSnapshot);
        setLayoutImpactFocusTableId(tableId);
      } else {
        setPendingTableDeletionSnapshot(null);
        setLayoutImpactFocusTableId("");
      }
    } catch (error) {
      setLayoutError(error instanceof Error ? error.message : "No se pudo revisar el impacto de las reservas.");
    } finally {
      setIsSavingLayout(false);
    }
  }

  function deleteEditingTable() {
    if (!editingTableItemId) return;
    void deleteTableWithImpact(editingTableItemId);
    closeTableModal();
  }

  function clearLayoutImpact() {
    setLayoutImpact(null);
    setPendingLayoutPayload(null);
    setPendingTableDeletionSnapshot(null);
    setLayoutImpactFocusTableId("");
    setImpactReassignReservation(null);
  }

  function restorePendingTableDeletion() {
    if (pendingTableDeletionSnapshot) {
      const lastSnapshot = undoStackRef.current[undoStackRef.current.length - 1];
      if (lastSnapshot && serializeSnapshot(lastSnapshot) === serializeSnapshot(pendingTableDeletionSnapshot)) {
        undoStackRef.current.pop();
      }
      setEditorItems(pendingTableDeletionSnapshot.items);
      setCombinationKeys(pendingTableDeletionSnapshot.combinationKeys);
      setSelectedItemId("");
    }
    clearLayoutImpact();
  }

  function addZone() {
    const name = newZoneName.trim();
    if (!name || editorZones.some((zone) => zone.name.toLowerCase() === name.toLowerCase())) return;
    const slug = name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `zona-${Date.now()}`;
    setEditorZones((current) => [...current, { id: `local-zone-${Date.now()}`, name, slug }]);
    setNewZoneName("");
    setHasUnsavedChanges(true);
  }

  function removeZone(zoneId: string) {
    setEditorZones((current) => current.filter((zone) => zone.id !== zoneId));
    setEditorItems((current) => current.map((item) => item.zoneId === zoneId ? { ...item, zoneId: null } : item));
    setHasUnsavedChanges(true);
  }

  function buildLayoutPayload(items: EditorItem[] = editorItems): LayoutPayload | null {
    if (!selectedRoomId || !roomDetail) return null;
    const tableItems = items.filter((item) => isTableKind(item.kind));
    const fixedItems = items.filter((item) => !isTableKind(item.kind));
    const combinations = activeCombinationKeys
      .map((key, index) => {
        const [leftId, rightId] = key.split("__");
        const left = tableItems.find((item) => item.id === leftId);
        const right = tableItems.find((item) => item.id === rightId);

        if (!left || !right) return null;

        const parentTableId = left.tableId || left.id;
        const childTableId = right.tableId || right.id;

        return {
          id: `${selectedRoomId}-combo-${index + 1}`,
          parentTableId,
          childTableId,
          combinedSeats: totalTableCapacity([left, right])
        };
      })
      .filter((item): item is { id: string; parentTableId: string; childTableId: string; combinedSeats: number } => Boolean(item));

    return {
      zones: editorZones,
      items: fixedItems.map((item) => ({
        id: item.id,
        kind: item.kind,
        label: item.label,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        rotation: item.rotation,
        metadata: item.metadata || {}
      })),
      tables: tableItems.map((item) => ({
        id: item.tableId || item.id,
        label: item.label,
        shape: item.kind,
        seats: item.seats || 1,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        rotation: item.rotation,
        isReservable: item.isReservable ?? true,
        metadata: deriveTableMetadata(item, items),
        zoneId: item.zoneId || null
      })),
      combinations
    };
  }

  async function persistLayout(payload: LayoutPayload) {
    if (!selectedRoomId) return;
    setIsSavingLayout(true);
    setLayoutError("");

    try {
      await saveRoomLayout(selectedRoomId, payload);
      baselineSnapshotRef.current = serializeSnapshot(createSnapshot());
      setPendingTableDeletionSnapshot(null);
      setHasUnsavedChanges(false);
      setLastSavedAt(
        new Date().toLocaleTimeString("es-AR", {
          hour: "2-digit",
          minute: "2-digit"
        })
      );
    } catch (error) {
      setLayoutError(error instanceof Error ? error.message : "No pudimos guardar el salón. Tus cambios siguen en pantalla; intentá de nuevo.");
      throw error;
    } finally {
      setIsSavingLayout(false);
    }
  }

  async function refreshLayoutImpact(payload: LayoutPayload) {
    if (!selectedRoomId) return;
    try {
      setLayoutImpact(await loadRoomLayoutImpact(selectedRoomId, payload, layoutImpactFocusTableId || undefined));
    } catch (error) {
      setLayoutError(error instanceof Error ? error.message : "No se pudo revisar el impacto de las reservas.");
    }
  }

  async function completeImpactReservation(reservationId: string) {
    if (!pendingLayoutPayload || completingImpactReservationId) return;
    setCompletingImpactReservationId(reservationId);
    try {
      await moveReservation(reservationId, "release");
      await refreshLayoutImpact(pendingLayoutPayload);
    } finally {
      setCompletingImpactReservationId("");
    }
  }

  async function saveDesignChanges() {
    if (isSavingLayout) return;
    const payload = buildLayoutPayload();
    if (!payload || !selectedRoomId) return;
    setLayoutError("");
    setIsSavingLayout(true);
    try {
      const impact = await loadRoomLayoutImpact(selectedRoomId, payload);
      if (impact.reservations.length) {
        setPendingLayoutPayload(payload);
        setLayoutImpact(impact);
        setLayoutImpactFocusTableId("");
        return;
      }
      await persistLayout(payload);
    } catch (error) {
      setLayoutError(error instanceof Error ? error.message : "No pudimos guardar el salón. Tus cambios siguen en pantalla; intentá de nuevo.");
    } finally {
      setIsSavingLayout(false);
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undoLastChange();
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selectedItemId) {
        event.preventDefault();
        const selectedItem = editorItems.find((item) => item.id === selectedItemId);
        if (selectedItem && isTableKind(selectedItem.kind)) {
          void deleteTableWithImpact(selectedItemId);
        } else {
          deleteItem(selectedItemId);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedItemId, editorItems, combinationKeys]);

  return (
    <WorkspaceShell
      title="Salones y plano."
      description="Disena el layout por salon. Aqui solo se define el espacio, las mesas, sus reglas de reserva y las combinaciones posibles."
    >
      {!isEditorOpen ? (
        <section className="rounded-[28px] border border-brand-line bg-white p-5">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-brand-line pb-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-neutral-400">Branch</label>
                <FoodieSelect
                  value={selectedBranchId}
                  onChange={(event) => {
                    const next = event.target.value;
                    setSelectedBranchId(next);
                    setSelectedRoomId("");
                    setOpenedRoomId("");
                    resetRoomEditor();
                    setRoomPendingDelete(null);
                  }}
                  className="min-w-[240px] font-medium"
                >
                  {bootstrap?.branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </FoodieSelect>
              </div>
              <div>
                <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-neutral-400">Fecha</label>
                <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="foodie-input font-medium" />
              </div>
              <div>
                <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-neutral-400">Turno</label>
                <FoodieSelect value={selectedTurn} onChange={(event) => setSelectedTurn(event.target.value as "mediodia" | "noche")} className="min-w-[140px] font-medium">
                  <option value="mediodia">Mediodía</option>
                  <option value="noche">Noche</option>
                </FoodieSelect>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-brand-ink">Salones creados</p>
              <p className="mt-1 text-sm text-neutral-500">{rooms.length} salones en esta sucursal.</p>
            </div>

            <button
              type="button"
              onClick={openCreateRoomModal}
              className="rounded-full bg-brand-orange px-5 py-3 text-sm font-medium text-white"
            >
              Agregar salon
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {rooms.map((room, roomIndex) => {
              const metrics = getRoomMetrics(room);
              const block = roomBlocks.find((item) => item.roomId === room.id);

              return (
                <article
                  key={room.id}
                  className="rounded-[24px] border border-brand-line bg-[#FCFAF7] p-4 transition hover:border-brand-orange hover:shadow-[0_18px_40px_rgba(31,31,33,0.07)]"
                >
                  <button type="button" onClick={() => openEditor(room.id)} className="block w-full text-left">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-brand-ink">{room.name}</p>
                        <p className="mt-1 text-xs text-neutral-500">{room.description || "Sin descripcion"}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="rounded-full border border-brand-line bg-white px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                          {room.isOutdoor ? "Exterior" : "Interior"}
                        </span>
                        <span className="text-[11px] font-semibold text-brand-orange">Prioridad {room.bookingPriority}</span>
                      </div>
                    </div>

                    {block ? <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700"><LockKeyhole className="h-3.5 w-3.5" />Cerrado en este turno</div> : null}

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-2xl border border-brand-line bg-white px-3 py-2.5">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">Mesas</p>
                        <p className="mt-1 text-lg font-semibold text-brand-ink">{room.tables.length}</p>
                      </div>
                      <div className="rounded-2xl border border-brand-line bg-white px-3 py-2.5">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">Capacidad</p>
                        <p className="mt-1 text-lg font-semibold text-brand-ink">{metrics.totalSeats} pax</p>
                      </div>
                      <div className="rounded-2xl border border-brand-line bg-white px-3 py-2.5">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">Reservables</p>
                        <p className="mt-1 text-lg font-semibold text-brand-ink">{metrics.reservableCount}</p>
                      </div>
                      <div className="rounded-2xl border border-brand-line bg-white px-3 py-2.5">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">Zonas</p>
                        <p className="mt-1 text-lg font-semibold text-brand-ink">{metrics.zoneCount}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-full border border-brand-line bg-white px-3 py-1 text-xs font-medium text-brand-ink">
                        {metrics.tvViewCount} mesas con vista a tele
                      </span>
                      <span className="rounded-full border border-brand-line bg-white px-3 py-1 text-xs font-medium text-brand-ink">
                        {room.isOutdoor ? "Apto exterior" : "Sector interior"}
                      </span>
                    </div>
                  </button>

                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditor(room.id)}
                      className="flex-1 rounded-full border border-brand-line bg-white px-4 py-2.5 text-sm font-semibold text-brand-ink transition hover:border-brand-orange hover:bg-[#FFF4ED] hover:text-brand-orange"
                    >
                      Abrir plano
                    </button>
                    <div className="flex rounded-full border border-brand-line">
                      <button
                        type="button"
                        aria-label={`Subir prioridad de ${room.name}`}
                        title="Subir prioridad"
                        disabled={roomIndex === 0 || isReorderingRooms}
                        onClick={() => void moveRoom(room.id, -1)}
                        className="inline-flex h-10 w-9 items-center justify-center px-2 text-brand-ink disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Bajar prioridad de ${room.name}`}
                        title="Bajar prioridad"
                        disabled={roomIndex === rooms.length - 1 || isReorderingRooms}
                        onClick={() => void moveRoom(room.id, 1)}
                        className="inline-flex h-10 w-9 items-center justify-center border-l border-brand-line px-2 text-brand-ink disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                    </div>
                    <button
                      type="button"
                      title={block ? "Abrir salon para reservas" : "Bloquear salon para reservas"}
                      aria-label={block ? `Abrir ${room.name} para reservas` : `Bloquear ${room.name} para reservas`}
                      disabled={Boolean(changingBlockRoomId)}
                      onClick={() => void toggleRoomBlock(room.id, Boolean(block))}
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border disabled:cursor-not-allowed disabled:opacity-60 ${block ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : "border-red-200 text-red-700 hover:bg-red-50"}`}
                    >
                      {changingBlockRoomId === room.id ? <span className="text-xs">...</span> : block ? <LockOpen className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      title="Programar bloqueos"
                      aria-label={`Programar bloqueos para ${room.name}`}
                      onClick={() => void openBookingRules(room)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-brand-line bg-white text-brand-ink transition hover:border-brand-orange hover:text-brand-orange"
                    >
                      <CalendarDays className="h-4 w-4" />
                    </button>
                    <div className="relative">
                      <button type="button" aria-label={`Mas acciones para ${room.name}`} title="Mas acciones" onClick={() => setOpenRoomMenuId((current) => current === room.id ? "" : room.id)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-brand-line bg-white text-brand-ink transition hover:border-brand-orange hover:text-brand-orange"><MoreHorizontal className="h-4 w-4" /></button>
                      {openRoomMenuId === room.id ? <div className="absolute bottom-12 right-0 z-20 w-40 rounded-2xl border border-brand-line bg-white p-1.5 shadow-lg">
                        <button type="button" onClick={() => { startEditRoom(room); setOpenRoomMenuId(""); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-brand-ink hover:bg-[#FFF4ED]"><Pencil className="h-4 w-4" />Editar</button>
                        <button type="button" onClick={() => { setRoomPendingDelete(room); setOpenRoomMenuId(""); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" />Borrar</button>
                      </div> : null}
                    </div>
                  </div>
                </article>
              );
            })}

            {!rooms.length ? (
              <div className="rounded-[26px] border border-dashed border-brand-line bg-[#FCFAF7] p-6 text-sm text-neutral-500">
                Todavia no hay salones para esta branch.
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="overflow-hidden rounded-[30px] border border-brand-line bg-white">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-line px-5 py-4">
            <div>
              <button
                onClick={() => {
                  setOpenedRoomId("");
                  setSelectedRoomId("");
                }}
                className="text-xs uppercase tracking-[0.18em] text-neutral-400 hover:text-brand-orange"
              >
                Volver a salones
              </button>
              <h2 className="mt-2 text-2xl font-semibold text-brand-ink">{activeRoom?.name || "Salon"}</h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <FoodieSelect
                value={selectedBranchId}
                onChange={(event) => {
                  const next = event.target.value;
                  setSelectedBranchId(next);
                  setOpenedRoomId("");
                  setSelectedRoomId("");
                  setSelectedItemId("");
                }}
                className="min-w-[220px] font-medium"
              >
                {bootstrap?.branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </FoodieSelect>

              <div className="flex items-center gap-3 rounded-2xl border border-brand-line px-4 py-3">
                <input
                  type="range"
                  min="0.3"
                  max="1.8"
                  step="0.05"
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  className="w-36 accent-[#FF5A00]"
                />
                <span className="w-12 text-right text-sm font-medium text-brand-ink">{Math.round(zoom * 100)}%</span>
              </div>

              <button
                onClick={() => void saveDesignChanges()}
                disabled={isSavingLayout || !hasUnsavedChanges}
                className={`rounded-full px-4 py-3 text-sm font-medium text-white ${
                  isSavingLayout || !hasUnsavedChanges ? "cursor-not-allowed bg-[#F0C7B2]" : "bg-brand-orange"
                }`}
              >
                {isSavingLayout ? "Guardando..." : "Guardar cambios"}
              </button>

              <span className={`text-sm ${hasUnsavedChanges ? "text-[#B65221]" : "text-neutral-500"}`}>
                {hasUnsavedChanges ? "Cambios sin guardar" : lastSavedAt ? `Guardado ${lastSavedAt}` : "Sin cambios pendientes"}
              </span>
            </div>
          </div>
          {layoutError && !layoutImpact ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm font-medium text-red-700">{layoutError}</p> : null}

          <div className="grid xl:grid-cols-[minmax(0,1fr)_360px]">
            <div
              ref={canvasRef}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleCanvasDrop}
              className="h-[78vh] min-h-[720px] min-w-0 overflow-scroll overscroll-contain bg-[#EFE9E0] p-5"
              style={{ scrollbarGutter: "stable both-edges" }}
            >
              <div className="flex min-h-full items-start justify-start" style={{ minWidth: scaledWorkspaceWidth, minHeight: scaledWorkspaceHeight }}>
                <div
                  className="relative origin-top-left overflow-hidden rounded-[28px] border border-[#D7CCBF] bg-[#F7F4EF] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]"
                  style={{ width: scaledWorkspaceWidth, height: scaledWorkspaceHeight, ...gridBackground }}
                  onClick={() => setSelectedItemId("")}
                >
                  <div
                    ref={canvasSurfaceRef}
                    className="absolute inset-0 origin-top-left"
                    style={{ width: workspaceWidth, height: workspaceHeight, transform: `scale(${zoom})`, transformOrigin: "top left" }}
                  >
                  {editorItems.map((item) => (
                    <div
                      key={item.id}
                      className="group absolute"
                      style={{ left: item.x, top: item.y, width: item.width, height: item.height }}
                    >
                      {false ? (
                        <div
                          className="absolute left-1/2 top-0 z-20 flex w-44 -translate-x-1/2 -translate-y-[calc(100%+12px)] items-center gap-2 rounded-2xl border border-brand-line bg-white px-3 py-2 shadow-[0_14px_28px_rgba(31,31,33,0.14)]"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Rotar</span>
                          <input
                            type="range"
                            min="0"
                            max="359"
                            step="1"
                            value={Math.round(item.rotation)}
                            onChange={(event) => setItemRotation(item.id, Number(event.target.value))}
                            onPointerDown={(event) => event.stopPropagation()}
                            className="w-full accent-[#FF5A00]"
                            aria-label="Rotacion del elemento"
                          />
                          <span className="w-10 text-right text-xs font-semibold text-brand-ink">{Math.round(item.rotation)}°</span>
                        </div>
                      ) : null}

                      <div
                        className={`relative h-full w-full ${
                          selectedItemId === item.id ? "ring-4 ring-[#FFB088]" : connectedTableIds.has(item.id) ? "ring-2 ring-[#6C63FF]" : ""
                        } ${shapeClass(item.kind)}`}
                        style={{ transform: `rotate(${item.rotation}deg)`, transformOrigin: "center" }}
                      >
                        {selectedItemId === item.id ? (
                          <>
                            <div className="pointer-events-none absolute inset-[-8px] border border-[#6C63FF]" />
                            <div className="pointer-events-none absolute left-1/2 top-[-32px] h-6 w-px -translate-x-1/2 bg-[#6C63FF]" />
                            <button
                              type="button"
                              onPointerDown={(event) => beginRotate(event, item)}
                              className="absolute left-1/2 top-[-46px] z-20 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border border-[#6C63FF] bg-white text-sm text-[#6C63FF] shadow-sm"
                              aria-label="Rotar elemento"
                            >
                              ↻
                            </button>
                            {getResizeHandles(item.kind).map((handle) => (
                              <button
                                key={handle}
                                type="button"
                                onPointerDown={(event) => beginResizeHandle(event, item, handle)}
                                className={`absolute z-20 h-4 w-4 rounded-full border border-[#6C63FF] bg-white shadow-sm ${resizeHandlePosition(handle)}`}
                                aria-label={`Redimensionar ${item.label}`}
                              />
                            ))}
                          </>
                        ) : null}

                        {isTableKind(item.kind) ? (
                          <div className="absolute -left-2 -top-2 z-20">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedItemId(item.id);
                                setOpenItemMenuId((current) => (current === item.id ? "" : item.id));
                              }}
                              className="pointer-events-none flex h-7 w-7 items-center justify-center rounded-full border border-brand-line bg-white text-sm font-bold text-brand-ink opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100"
                              aria-label="Acciones de mesa"
                            >
                              ⋯
                            </button>

                            {openItemMenuId === item.id ? (
                              <div className="absolute left-0 top-8 flex flex-col gap-2 rounded-[18px] border border-brand-line bg-white p-2 shadow-[0_12px_24px_rgba(31,31,33,0.12)]">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setOpenItemMenuId("");
                                    openTableModal(item);
                                  }}
                                  className="flex h-7 w-7 items-center justify-center rounded-full border border-brand-line text-sm text-brand-ink hover:border-brand-orange"
                                  aria-label="Editar mesa"
                                >
                                  ✎
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void deleteTableWithImpact(item.id);
                                  }}
                                  className="flex h-7 w-7 items-center justify-center rounded-full border border-[#F0C7B2] text-sm text-[#B65221] hover:bg-[#FFF4ED]"
                                  aria-label="Borrar mesa"
                                >
                                  🗑
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              deleteItem(item.id);
                            }}
                            className="pointer-events-none absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-[#F0C7B2] bg-white text-xs font-bold text-[#B65221] opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100"
                            aria-label="Borrar elemento"
                          >
                            x
                          </button>
                        )}

                        <button
                          type="button"
                          onPointerDown={(event) => beginPointerDrag(event, item)}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedItemId(item.id);
                            setOpenItemMenuId("");
                            if (dragMovedRef.current) {
                              dragMovedRef.current = false;
                              return;
                            }
                          }}
                          className={`flex h-full w-full items-center justify-center border-2 text-center shadow-sm ${
                            shapeClass(item.kind)
                          } ${staticItemClass(item.kind)}`}
                        >
                          <span
                            className={`inline-block px-2 text-xs font-semibold ${item.kind === "wall" || item.kind === "screen" ? "text-white" : "text-brand-ink"}`}
                            style={isTableKind(item.kind) ? { transform: `rotate(${-item.rotation}deg)` } : undefined}
                          >
                            {item.label}
                            {item.seats ? (
                              <>
                                <br />
                                {item.seats} pax
                                <br />
                                {item.isReservable ? "reservable" : "sin reserva"}
                                {activeCombinationKeys.some((key) => key.split("__").includes(item.id)) ? <><br /><span className="text-[10px] text-[#6C63FF]">compatible</span></> : null}
                              </>
                            ) : null}
                          </span>
                        </button>

                        {canResize(item.kind) ? (
                          <button
                            type="button"
                            onPointerDown={(event) => beginResize(event, item)}
                            className={`pointer-events-none absolute flex items-center justify-center border border-brand-line bg-white text-[10px] text-brand-ink opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100 ${
                              item.kind === "corridor"
                                ? "-bottom-2 -right-2 h-6 w-6 rounded-full cursor-nwse-resize"
                                : "right-[-10px] top-1/2 h-16 w-4 -translate-y-1/2 rounded-full cursor-ew-resize"
                            }`}
                            aria-label="Estirar elemento"
                          >
                            {isLinearResize(item.kind) ? (
                              <span className="flex items-center gap-[2px]">
                                <span className="h-8 w-[2px] rounded-full bg-[#1F1F21]" />
                                <span className="h-8 w-[2px] rounded-full bg-[#1F1F21]" />
                              </span>
                            ) : (
                              <ResizeHandleIcon mode="xy" />
                            )}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
              </div>
            </div>

            <aside className="border-t border-brand-line bg-[#FCFAF7] xl:border-l xl:border-t-0">
              <div className="border-b border-brand-line px-5 py-5">
                <p className="text-sm font-semibold text-brand-ink">Zonas del salón</p>
                <p className="mt-1 text-sm text-neutral-500">Creá zonas para que puedan elegirse en una reserva.</p>
                <div className="mt-3 flex gap-2">
                  <input
                    value={newZoneName}
                    onChange={(event) => setNewZoneName(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") addZone(); }}
                    placeholder="Ej: Patio"
                    className="min-w-0 flex-1 rounded-2xl border border-brand-line bg-white px-3 py-2.5 text-sm text-brand-ink outline-none focus:border-brand-orange"
                  />
                  <button type="button" onClick={addZone} disabled={!newZoneName.trim()} className="rounded-full bg-brand-orange px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Agregar</button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {editorZones.map((zone) => (
                    <span key={zone.id} className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-white px-3 py-1.5 text-xs font-medium text-brand-ink">
                      {zone.name}
                      <button type="button" onClick={() => removeZone(zone.id)} className="font-bold text-neutral-400 hover:text-red-600" aria-label={`Eliminar zona ${zone.name}`}>×</button>
                    </span>
                  ))}
                  {!editorZones.length ? <span className="text-xs text-neutral-400">Todavía no hay zonas creadas.</span> : null}
                </div>
              </div>
              <div className="border-b border-brand-line px-5 py-5">
                <p className="text-sm font-semibold text-brand-ink">Paleta visual</p>
                <p className="mt-1 text-sm text-neutral-500">Arrastra elementos desde aqui hacia el plano.</p>
              </div>

              <div className="max-h-[42vh] overflow-y-auto px-5 py-5">
                <div className="grid gap-3">
                  {paletteItems.map((item) => (
                    <button
                      key={item.kind}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("application/foodie-item", JSON.stringify(item));
                        event.dataTransfer.effectAllowed = "copy";
                      }}
                      className="rounded-[24px] border border-brand-line bg-white px-4 py-4 text-left transition hover:border-brand-orange"
                    >
                      <PalettePreview kind={item.kind} label={item.label} seats={item.seats} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-brand-line px-5 py-5">
                <div className="rounded-[24px] border border-brand-line bg-white p-4">
                  <p className="text-sm font-semibold text-brand-ink">Elemento seleccionado</p>
                  {selectedItem ? (
                    <>
                      <p className="mt-2 text-sm text-neutral-500">{selectedItem.label}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-neutral-400">{selectedItem.kind}</p>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => rotateItem(selectedItem.id, -90)}
                          className="flex-1 rounded-full border border-brand-line px-4 py-3 text-sm font-medium text-brand-ink"
                        >
                          Girar -90
                        </button>
                        <span className="w-16 text-center text-sm font-semibold text-brand-ink">{selectedItem.rotation}°</span>
                        <button
                          type="button"
                          onClick={() => rotateItem(selectedItem.id, 90)}
                          className="flex-1 rounded-full border border-brand-line px-4 py-3 text-sm font-medium text-brand-ink"
                        >
                          Girar +90
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-neutral-500">Selecciona un elemento del plano para rotarlo.</p>
                  )}
                </div>
              </div>

            </aside>

            <section className="border-t border-brand-line bg-[#FCFAF7] px-5 py-6 xl:col-span-2 xl:px-7">
              <div className="rounded-[20px] border border-[#E4DEF9] bg-[#F7F5FF] px-4 py-3">
                  <p className="text-sm font-semibold text-brand-ink">Combinaciones de mesas</p>
                  <p className="mt-1 text-xs leading-5 text-neutral-500">Los vínculos directos se editan abajo. Las cadenas posibles se calculan solas y no modifican el plano.</p>
              </div>

              <div className="mt-5 grid gap-5 xl:grid-cols-2">
                <div className="rounded-[24px] border border-brand-line bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Vínculos directos</p>
                      <p className="mt-1 text-xs text-neutral-400">Uniones configuradas entre dos mesas. Usá el tachito para quitar un vínculo.</p>
                    </div>
                    <span className="rounded-full bg-[#FFF0E7] px-2.5 py-1 text-xs font-semibold text-[#B65221]">{activeCombinationKeys.length}</span>
                  </div>
                  <div className="mt-3 max-h-[30vh] space-y-2 overflow-y-auto pr-1">
                    {activeCombinationKeys.length ? (
                      activeCombinationKeys.map((key) => {
                        const [leftId, rightId] = key.split("__");
                        const left = editorItems.find((item) => item.id === leftId);
                        const right = editorItems.find((item) => item.id === rightId);
                        if (!left || !right) return null;
                        const combinedSeats = totalTableCapacity([left, right]);
                        return (
                          <div key={key} className="flex items-center gap-3 rounded-2xl border border-brand-orange bg-[#FFF8F4] px-3 py-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-brand-ink">{left.label} ↔ {right.label}</p>
                              <p className="mt-0.5 text-xs text-neutral-500">2 mesas conectadas</p>
                            </div>
                            <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#B65221]">{combinedSeats} pax</span>
                            <button type="button" onClick={() => toggleCombination(key)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#F0C7B2] text-[#B65221] transition hover:bg-white" aria-label={`Quitar compatibilidad entre ${left.label} y ${right.label}`} title="Quitar compatibilidad">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <p className="rounded-2xl border border-dashed border-brand-line px-3 py-4 text-xs leading-5 text-neutral-500">Todavía no hay vínculos. Editá una mesa y elegí con cuáles se puede combinar.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-[24px] border border-brand-line bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Cadenas posibles</p>
                      <p className="mt-1 text-xs text-neutral-400">Vista informativa de las combinaciones reservables.</p>
                    </div>
                    <span className="rounded-full bg-[#EEEAFE] px-2.5 py-1 text-xs font-semibold text-[#5B52B9]">{possibleTableChains.length}</span>
                  </div>
                  <div className="mt-3 max-h-[30vh] space-y-4 overflow-y-auto pr-1">
                    {possibleTableChains.length ? (
                      [2, 3, 4].map((size) => {
                        const chains = possibleTableChains.filter((chain) => size === 4 ? chain.length >= 4 : chain.length === size);
                        if (!chains.length) return null;
                        return (
                          <div key={size}>
                            <p className="mb-2 text-xs font-medium text-neutral-500">{size === 4 ? "4 o más mesas" : `${size} mesas`}</p>
                            <div className="space-y-2">
                              {chains.map((chain) => {
                                const seats = totalTableCapacity(chain);
                                return (
                                  <div key={chain.map((table) => table.id).sort().join("__")} className="flex items-center gap-3 rounded-2xl border border-[#E4DEF9] bg-[#FAF9FF] px-3 py-3">
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm font-semibold text-brand-ink">{chain.map((table) => table.label).join(" + ")}</p>
                                      <p className="mt-0.5 text-xs text-neutral-500">{chain.length} mesas conectadas</p>
                                    </div>
                                    <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#5B52B9]">{seats} pax</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="rounded-2xl border border-dashed border-[#D9D3F5] bg-[#FAF9FF] px-3 py-4 text-xs leading-5 text-neutral-500">Cuando agregues vínculos directos, acá vas a ver todas las combinaciones que pueden formarse.</p>
                  )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </section>
      )}

      <AppModal
        open={Boolean(bookingRuleRoom)}
        title={`Bloqueos programados${bookingRuleRoom ? ` · ${bookingRuleRoom.name}` : ""}`}
        description="Cerrá este salón de forma recurrente sin tener que bloquear cada fecha manualmente."
        onClose={() => setBookingRuleRoom(null)}
        widthClassName="max-w-3xl"
        footer={
          <>
            <button type="button" onClick={() => setBookingRuleRoom(null)} className="rounded-full border border-brand-line px-4 py-3 text-sm font-medium text-brand-ink">Cerrar</button>
            <button type="button" disabled={bookingRuleSaving || !bookingRuleForm.weekdays.length || !bookingRuleForm.turns.length || !bookingRuleForm.startsAt} onClick={() => void saveBookingRule()} className="rounded-full bg-brand-orange px-4 py-3 text-sm font-medium text-white disabled:opacity-60">{bookingRuleSaving ? "Guardando..." : bookingRuleForm.id ? "Actualizar bloqueo" : "Programar bloqueo"}</button>
          </>
        }
      >
        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold text-white">Días de cierre</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {weekdayOptions.map((label, weekday) => {
                const active = bookingRuleForm.weekdays.includes(weekday);
                return <button key={label} type="button" onClick={() => setBookingRuleForm((current) => ({ ...current, weekdays: active ? current.weekdays.filter((item) => item !== weekday) : [...current.weekdays, weekday].sort() }))} className={`rounded-full border px-3 py-2 text-xs font-semibold ${active ? "border-brand-orange bg-brand-orange text-white" : "border-white/20 bg-white/5 text-white"}`}>{label}</button>;
              })}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Turnos</p>
            <div className="mt-3 flex gap-2">
              {(["mediodia", "noche"] as const).map((turn) => {
                const active = bookingRuleForm.turns.includes(turn);
                return <button key={turn} type="button" onClick={() => setBookingRuleForm((current) => ({ ...current, turns: active ? current.turns.filter((item) => item !== turn) : [...current.turns, turn] }))} className={`rounded-full border px-4 py-2 text-sm font-semibold ${active ? "border-brand-orange bg-brand-orange text-white" : "border-white/20 bg-white/5 text-white"}`}>{turn === "mediodia" ? "Mediodía" : "Noche"}</button>;
              })}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-2"><span className="text-sm font-semibold text-white">Desde</span><input type="date" value={bookingRuleForm.startsAt} onChange={(event) => setBookingRuleForm((current) => ({ ...current, startsAt: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-brand-ink" /></label>
            <label className="block space-y-2"><span className="text-sm font-semibold text-white">Hasta (opcional)</span><input type="date" min={bookingRuleForm.startsAt} value={bookingRuleForm.endsAt} onChange={(event) => setBookingRuleForm((current) => ({ ...current, endsAt: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-brand-ink" /></label>
          </div>
          <label className="block space-y-2"><span className="text-sm font-semibold text-white">Motivo (opcional)</span><input value={bookingRuleForm.reason} maxLength={500} onChange={(event) => setBookingRuleForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Ej.: Cerrado días hábiles" className="w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-brand-ink placeholder:text-neutral-400" /></label>
          {bookingRuleError ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{bookingRuleError}</p> : null}
          <div className="border-t border-white/10 pt-5">
            <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-white">Reglas guardadas</p><p className="mt-1 text-xs text-white/70">Podés editar una regla o eliminarla para volver a habilitar el salón.</p></div>{bookingRuleForm.id ? <button type="button" onClick={() => setBookingRuleForm(newBookingRuleForm(selectedDate))} className="text-xs font-semibold text-brand-orange">Nueva regla</button> : null}</div>
            <div className="mt-3 space-y-2">
              {bookingRulesLoading ? <p className="text-sm text-white/70">Cargando bloqueos...</p> : bookingRules.length ? bookingRules.map((rule) => <div key={rule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-3"><div className="text-sm text-white"><p className="font-semibold">{rule.weekdays.map((weekday) => weekdayOptions[weekday].slice(0, 3)).join(", ")} · {rule.turns.map((turn) => turn === "mediodia" ? "Mediodía" : "Noche").join(" y ")}</p><p className="mt-1 text-xs text-white/70">Desde {rule.startsAt.slice(0, 10)}{rule.endsAt ? ` hasta ${rule.endsAt.slice(0, 10)}` : " · sin fecha de fin"}{rule.reason ? ` · ${rule.reason}` : ""}</p></div><div className="flex gap-2"><button type="button" onClick={() => editBookingRule(rule)} className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white">Editar</button><button type="button" onClick={() => void removeBookingRule(rule.id)} className="rounded-full border border-red-300/60 px-3 py-1.5 text-xs font-semibold text-red-200">Eliminar</button></div></div>) : <p className="text-sm text-white/70">Todavía no hay bloqueos recurrentes.</p>}
            </div>
          </div>
        </div>
      </AppModal>

      <AppModal
        open={roomModalMode === "create" || roomModalMode === "edit"}
        title={roomModalMode === "edit" ? "Editar salon" : "Crear salon"}
        description="Completa los datos base del salon. El layout se configura despues desde su plano."
        onClose={closeRoomModal}
        footer={
          <>
            <button
              type="button"
              onClick={closeRoomModal}
              className="flex-1 rounded-full border border-brand-line px-4 py-3 text-sm font-medium text-brand-ink"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void (roomModalMode === "edit" ? handleUpdateRoom() : handleCreateRoom())}
              className="flex-1 rounded-full bg-brand-orange px-4 py-3 text-sm font-medium text-white"
            >
              {roomModalMode === "edit" ? "Guardar cambios" : "Crear salon"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-white">Nombre del salon</span>
            <input
              value={roomModalMode === "edit" ? roomEditor.name : roomForm.name}
              onChange={(event) =>
                roomModalMode === "edit"
                  ? setRoomEditor((current) => ({ ...current, name: event.target.value }))
                  : setRoomForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Ej: Terraza"
              className="w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-brand-ink outline-none placeholder:text-neutral-400 focus:border-brand-orange"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-white">Descripcion</span>
            <input
              value={roomModalMode === "edit" ? roomEditor.description : roomForm.description}
              onChange={(event) =>
                roomModalMode === "edit"
                  ? setRoomEditor((current) => ({ ...current, description: event.target.value }))
                  : setRoomForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="Ej: Sector exterior con mesas altas"
              className="w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-brand-ink outline-none placeholder:text-neutral-400 focus:border-brand-orange"
            />
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white">
            <input
              type="checkbox"
              checked={roomModalMode === "edit" ? roomEditor.isOutdoor : roomForm.isOutdoor}
              onChange={(event) =>
                roomModalMode === "edit"
                  ? setRoomEditor((current) => ({ ...current, isOutdoor: event.target.checked }))
                  : setRoomForm((current) => ({ ...current, isOutdoor: event.target.checked }))
              }
              className="h-4 w-4 accent-brand-orange"
            />
            Salon exterior
          </label>
        </div>
      </AppModal>

      <ConfirmDialog
        open={Boolean(roomPendingDelete)}
        title="Eliminar salon"
        description={`Vas a eliminar ${roomPendingDelete?.name || "este salon"}. Esta accion no usa alertas del navegador y requiere confirmacion propia.`}
        confirmLabel="Eliminar salon"
        tone="danger"
        onCancel={() => setRoomPendingDelete(null)}
        onConfirm={() => {
          if (!roomPendingDelete) return;
          void handleDeleteRoom(roomPendingDelete.id);
        }}
      />

      <AppModal
        open={Boolean(layoutImpact && pendingLayoutPayload)}
        title="Reservas afectadas por los cambios"
        description="Revisá las reservas vinculadas antes de guardar el plano. Las reservas pendientes o confirmadas que queden incompatibles deben reasignarse."
        onClose={isSavingLayout ? () => undefined : restorePendingTableDeletion}
        widthClassName="max-w-3xl"
        footer={
          <>
            <button
              type="button"
              disabled={isSavingLayout}
              onClick={restorePendingTableDeletion}
              className="flex-1 rounded-full border border-brand-line px-4 py-3 text-sm font-medium text-brand-ink disabled:opacity-60"
            >
              Volver al plano
            </button>
            <button
              type="button"
              disabled={isSavingLayout || Boolean(layoutImpact?.reservations.some((item) => item.requiresReassignment || item.blocksLayout))}
              onClick={() => {
                if (!pendingLayoutPayload) return;
                void persistLayout(pendingLayoutPayload).then(clearLayoutImpact).catch(() => undefined);
              }}
              className="flex-1 rounded-full bg-brand-orange px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
            >
              {isSavingLayout ? "Guardando..." : "Continuar y guardar"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {layoutError ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{layoutError}</p> : null}
          {layoutImpact?.reservations.map((item) => (
            <article key={item.reservation.id} className={`rounded-2xl border p-4 ${item.blocksLayout ? "border-red-300 bg-red-50" : item.requiresReassignment ? "border-amber-300 bg-amber-50" : "border-brand-line bg-white"}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-brand-ink">{item.reservation.fullName} · {item.reservation.code}</p>
                  <p className="mt-1 text-sm text-neutral-600">{item.reservation.serviceDate.slice(0, 10)} · {item.reservation.serviceTime} · {item.reservation.partySize} comensales</p>
                  <p className="mt-1 text-xs text-neutral-500">Mesa{item.affectedTables.length === 1 ? "" : "s"} afectada{item.affectedTables.length === 1 ? "" : "s"}: {item.affectedTables.join(", ")}</p>
                  {item.reasons.map((reason) => <p key={reason} className="mt-1 text-sm font-medium text-[#B65221]">{reason}</p>)}
                  {!item.requiresReassignment && !item.blocksLayout ? <p className="mt-2 text-xs text-neutral-500">La reserva se conserva; el cambio no altera su asignación ni su capacidad.</p> : null}
                </div>
                {item.requiresReassignment ? <button type="button" onClick={() => setImpactReassignReservation(item.reservation)} className="shrink-0 rounded-full border border-brand-orange px-4 py-2 text-sm font-semibold text-brand-orange">Cambiar mesa</button> : null}
                {item.blocksLayout ? <div className="flex shrink-0 flex-wrap items-center gap-2"><span className="rounded-full bg-red-100 px-3 py-2 text-xs font-bold text-red-700">Servicio en curso</span><button type="button" disabled={Boolean(completingImpactReservationId)} onClick={() => void completeImpactReservation(item.reservation.id)} className="rounded-full bg-[#146C37] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{completingImpactReservationId === item.reservation.id ? "Completando..." : "Completar reserva"}</button></div> : null}
              </div>
            </article>
          ))}
        </div>
      </AppModal>

      <ReservationTableReassignModal
        reservation={impactReassignReservation}
        excludedTableIds={layoutImpact?.excludedTableIds || []}
        onClose={() => setImpactReassignReservation(null)}
        onComplete={() => {
          setImpactReassignReservation(null);
          if (pendingLayoutPayload) void refreshLayoutImpact(pendingLayoutPayload);
        }}
      />

      <AppModal
        open={Boolean(pendingTableDraft || editingTableItemId)}
        title={editingTableItemId ? "Editar mesa" : "Configurar mesa"}
        description="Define si la mesa acepta reservas, si puede entrar en combinaciones y si tiene vista a la tele o a la ventana."
        onClose={closeTableModal}
        widthClassName="max-w-md"
        footer={
          <>
            <button
              type="button"
              onClick={closeTableModal}
              className="flex-1 rounded-full border border-brand-line px-4 py-3 text-sm font-medium text-brand-ink"
            >
              Cancelar
            </button>
            {editingTableItemId ? (
              <button
                type="button"
                onClick={deleteEditingTable}
                disabled={isSavingLayout}
                className="rounded-full bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
              >
                Eliminar mesa
              </button>
            ) : null}
            <button
              type="button"
              onClick={submitTableModal}
              className="flex-1 rounded-full bg-brand-orange px-4 py-3 text-sm font-medium text-white"
            >
              {editingTableItemId ? "Guardar mesa" : "Crear mesa"}
            </button>
          </>
        }
      >
        <>
            <div className="mt-5 space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-white">Nombre de la mesa</span>
                <input
                  value={tableModal.label}
                  onChange={(event) => setTableModal((current) => ({ ...current, label: event.target.value }))}
                  placeholder="Ej: M1"
                  className="w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-brand-ink outline-none placeholder:text-neutral-400 focus:border-brand-orange"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-white">Zona</span>
                <FoodieSelect value={tableModal.zoneId} onChange={(event) => setTableModal((current) => ({ ...current, zoneId: event.target.value }))}>
                  <option value="">Sin zona</option>
                  {editorZones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
                </FoodieSelect>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-white">Comensales base</span>
                <input
                  type="number"
                  min="1"
                  value={tableModal.seats}
                  onChange={(event) => setTableModal((current) => ({ ...current, seats: event.target.value }))}
                  placeholder="Ej: 4"
                  className="w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-brand-ink outline-none placeholder:text-neutral-400 focus:border-brand-orange"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-white">Minimo de comensales</span>
                  <input
                    type="number"
                    min="1"
                    value={tableModal.minPartySize}
                    onChange={(event) => setTableModal((current) => ({ ...current, minPartySize: event.target.value }))}
                    placeholder="Ej: 2"
                    className="w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-brand-ink outline-none placeholder:text-neutral-400 focus:border-brand-orange"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-white">Maximo de comensales</span>
                  <input
                    type="number"
                    min="1"
                    value={tableModal.maxPartySize}
                    onChange={(event) => setTableModal((current) => ({ ...current, maxPartySize: event.target.value }))}
                    placeholder="Ej: 3"
                    className="w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-brand-ink outline-none placeholder:text-neutral-400 focus:border-brand-orange"
                  />
                </label>
              </div>

              <label className="flex items-center gap-3 text-sm font-semibold text-white">
                <input
                  type="checkbox"
                  checked={tableModal.isReservable}
                  onChange={(event) => setTableModal((current) => ({ ...current, isReservable: event.target.checked }))}
                  className="h-4 w-4 accent-brand-orange"
                />
                Reservable
              </label>

              <label className="flex items-center gap-3 text-sm font-semibold text-white">
                <input
                  type="checkbox"
                  checked={tableModal.isCombinable}
                  onChange={(event) =>
                    setTableModal((current) => ({
                      ...current,
                      isCombinable: event.target.checked,
                      combinationTableIds: event.target.checked ? current.combinationTableIds : []
                    }))
                  }
                  className="h-4 w-4 accent-brand-orange"
                />
                Permitir combinaciones
              </label>

              {tableModal.isCombinable ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">Compatible con</p>
                  <p className="mt-1 text-xs leading-5 text-white/65">Seleccioná las mesas que pueden unirse físicamente. Foodie formará cadenas válidas de mesas libres automáticamente.</p>
                  <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
                    {tableCombinationOptions.length ? (
                      tableCombinationOptions.map((table) => (
                        <label key={table.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white px-3 py-2 text-sm font-semibold text-[#1F1F21]">
                          <span className="text-[#1F1F21]">{table.label || "Mesa sin nombre"} - {table.seats || 0} pax</span>
                          <input
                            type="checkbox"
                            checked={tableModal.combinationTableIds.includes(table.id)}
                            onChange={(event) =>
                              setTableModal((current) => ({
                                ...current,
                                combinationTableIds: event.target.checked
                                  ? [...current.combinationTableIds, table.id]
                                  : current.combinationTableIds.filter((id) => id !== table.id)
                              }))
                            }
                            className="h-4 w-4 accent-brand-orange"
                          />
                        </label>
                      ))
                    ) : (
                      <p className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white/70">
                        Agrega otra mesa al plano para poder seleccionarla como combinable.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}

              <label className="flex items-center gap-3 text-sm font-semibold text-white">
                <input
                  type="checkbox"
                  checked={tableModal.hasTvView}
                  onChange={(event) => setTableModal((current) => ({ ...current, hasTvView: event.target.checked }))}
                  className="h-4 w-4 accent-brand-orange"
                />
                Vista a tele
              </label>


              <label className="flex items-center gap-3 text-sm font-semibold text-white">
                <input
                  type="checkbox"
                  checked={tableModal.hasWindowView}
                  onChange={(event) => setTableModal((current) => ({ ...current, hasWindowView: event.target.checked }))}
                  className="h-4 w-4 accent-brand-orange"
                />
                Vista a ventana
              </label>
              {editingTableItemId && selectedItem && isTableKind(selectedItem.kind) ? (
                <div className="rounded-2xl border border-brand-line bg-[#FCFAF7] p-4 text-sm text-neutral-600">
                  <p className="font-semibold text-brand-ink">Deteccion automatica</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(deriveTableMetadata(selectedItem, editorItems).derivedFeatures || {})
                      .filter(([, active]) => active)
                      .map(([key]) => (
                        <span key={key} className="rounded-full border border-brand-line bg-white px-3 py-1 text-xs font-medium text-brand-ink">
                          {key === "nearWindow"
                            ? "Cerca de ventana"
                            : key === "nearColumn"
                              ? "Cerca de columna"
                              : key === "nearWall"
                                ? "Cerca de pared"
                                : "Cerca de pasillo"}
                        </span>
                      ))}
                    {!Object.values(deriveTableMetadata(selectedItem, editorItems).derivedFeatures || {}).some(Boolean) ? (
                      <span className="text-xs text-neutral-500">Sin cercanias detectadas</span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
        </>
      </AppModal>
    </WorkspaceShell>
  );
}
