"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { argentinaToday } from "../lib/argentina-date";
import type {
  AuthResponse,
  Bootstrap,
  ChatActivityLog,
  CreateReservationForm,
  Customer,
  CustomerDetail,
  ManualReservationTableOption,
  RoomLayoutImpact,
  PlatformRestaurantDetail,
  PlatformRestaurantSummary,
  Reservation,
  ReservationTableAvailability,
  ReservationTableOption,
  RestaurantActivityLog,
  RestaurantStaffUserDetail,
  RestaurantStaffUser,
  RestaurantUserRole,
  RoomBookingBlock,
  RoomBookingRule,
  RoomDetail,
  ServiceState,
  SpecialService,
  WorkspaceUser
} from "../lib/types";
import { initialReservationForm } from "../lib/types";
import type { ChatClientFeatureFlags } from "./chat/chat-feature-flags";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/v1";
const CHAT_API_URL = "https://chat.pupuia.com/api";
const LAYOUT_SAVE_FALLBACK = "No pudimos guardar el salón. Tus cambios siguen en pantalla; intentá de nuevo.";

function roomLayoutErrorMessage(error: unknown, fallback = LAYOUT_SAVE_FALLBACK): string {
  if (!(error instanceof Error)) return fallback;
  try {
    const response = JSON.parse(error.message) as { statusCode?: number; message?: string | string[] };
    const message = Array.isArray(response.message) ? response.message[0] : response.message;
    if (response.statusCode === 401 || response.statusCode === 403) return "Tu sesión no permite guardar este salón. Volvé a ingresar e intentá de nuevo.";
    if (response.statusCode === 404) return "Este salón ya no está disponible. Actualizá la página antes de continuar.";
    if ([400, 409, 503].includes(response.statusCode || 0) && typeof message === "string" && message.trim()) return message;
  } catch {
    // Network errors and non-JSON responses use the same safe message.
  }
  return fallback;
}

type ChatSession = {
  token: string;
  user: {
    id?: string;
    _id?: string;
    name: string;
    email: string;
    role: string;
    clientId?: string;
    advisorId?: string;
    featureFlags?: Partial<ChatClientFeatureFlags>;
  } | null;
};

type WorkspaceContextValue = {
  token: string;
  currentUser: WorkspaceUser | null;
  userName: string;
  loginError: string;
  loading: boolean;
  bootstrap: Bootstrap | null;
  platformRestaurants: PlatformRestaurantSummary[];
  selectedBranchId: string;
  selectedRoomId: string;
  selectedDate: string;
  selectedTurn: "mediodia" | "noche";
  specialServices: SpecialService[];
  selectedSpecialServiceId: string;
  roomDetail: RoomDetail | null;
  reservations: Reservation[];
  customers: Customer[];
  tableStates: ServiceState[];
  roomBlocks: RoomBookingBlock[];
  reservationForm: CreateReservationForm;
  roomForm: { name: string; description: string; isOutdoor: boolean };
  chatSession: ChatSession;
  feedback: string;
  setSelectedBranchId: (value: string) => void;
  setSelectedRoomId: (value: string) => void;
  setSelectedDate: (value: string) => void;
  setSelectedTurn: (value: "mediodia" | "noche") => void;
  setSelectedSpecialServiceId: (value: string) => void;
  setReservationForm: React.Dispatch<React.SetStateAction<CreateReservationForm>>;
  setRoomForm: React.Dispatch<React.SetStateAction<{ name: string; description: string; isOutdoor: boolean }>>;
  handleLogin: (formData: FormData) => Promise<void>;
  logout: () => void;
  createRoom: () => Promise<void>;
  updateRoom: (roomId: string, input: { name: string; description: string; isOutdoor: boolean }) => Promise<void>;
  reorderRooms: (branchId: string, roomIds: string[]) => Promise<void>;
  blockRoom: (roomId: string, reason?: string) => Promise<void>;
  unblockRoom: (roomId: string) => Promise<void>;
  loadRoomBookingRules: (roomId: string) => Promise<RoomBookingRule[]>;
  createRoomBookingRule: (roomId: string, input: Omit<RoomBookingRule, "id" | "roomId" | "createdAt" | "updatedAt">) => Promise<RoomBookingRule>;
  updateRoomBookingRule: (roomId: string, ruleId: string, input: Omit<RoomBookingRule, "id" | "roomId" | "createdAt" | "updatedAt">) => Promise<RoomBookingRule>;
  deleteRoomBookingRule: (roomId: string, ruleId: string) => Promise<void>;
  deleteRoom: (roomId: string) => Promise<void>;
  saveRoomLayout: (roomId: string, payload: unknown) => Promise<void>;
  loadRoomLayoutImpact: (roomId: string, payload: unknown, focusTableId?: string) => Promise<RoomLayoutImpact>;
  createReservation: () => Promise<void>;
  moveReservation: (reservationId: string, action: "check-in" | "release") => Promise<void>;
  rescheduleReservation: (reservationId: string, serviceDate: string) => Promise<Reservation>;
  cancelReservation: (reservationId: string, reason?: string) => Promise<Reservation>;
  deleteReservation: (reservationId: string) => Promise<void>;
  loadReservationTableOptions: (reservationId: string) => Promise<ReservationTableOption[]>;
  loadReservationTableAvailability: (reservationId: string, roomId: string, excludedTableIds?: string[]) => Promise<ReservationTableAvailability>;
  loadAvailableReservationTableOptions: (input: { branchId: string; roomId: string; partySize: number; serviceDate: string; serviceTime: string; preferredZone?: string }) => Promise<ReservationTableOption[]>;
  loadAvailableManualReservationTables: (input: { branchId: string; roomId: string; serviceDate: string; serviceTime: string; preferredZone?: string }) => Promise<ManualReservationTableOption[]>;
  reassignReservationTables: (reservationId: string, input: { roomId: string; tableIds: string[] }) => Promise<void>;
  setTableState: (tableId: string, status: ServiceState["status"]) => Promise<void>;
  createCustomer: (input: {
    fullName: string;
    phone?: string | null;
    email?: string | null;
    birthday?: string | null;
    notes?: string | null;
    tags?: string[];
  }) => Promise<void>;
  updateCustomer: (
    customerId: string,
    input: {
      fullName?: string;
      phone?: string | null;
      email?: string | null;
      birthday?: string | null;
      notes?: string | null;
      tags?: string[];
    }
  ) => Promise<void>;
  deleteCustomer: (customerId: string) => Promise<void>;
  loadCustomerDetail: (customerId: string) => Promise<CustomerDetail>;
  loadReservationHistory: (filters: {
    branchId?: string;
    dateFrom?: string;
    dateTo?: string;
    turn?: "mediodia" | "noche" | "all";
    status?: string;
    search?: string;
  }) => Promise<Reservation[]>;
  loadRestaurantUsers: () => Promise<RestaurantStaffUser[]>;
  loadRestaurantUserDetail: (userId: string) => Promise<RestaurantStaffUserDetail>;
  createRestaurantUser: (input: { fullName: string; email: string; password: string; role: RestaurantUserRole }) => Promise<void>;
  updateRestaurantUser: (
    userId: string,
    input: { fullName?: string; email?: string; password?: string; role?: RestaurantUserRole; isActive?: boolean }
  ) => Promise<void>;
  deleteRestaurantUser: (userId: string) => Promise<void>;
  loadRestaurantActivity: (filters?: { restaurantUserId?: string; limit?: number }) => Promise<RestaurantActivityLog[]>;
  loadRestaurantChatActivity: (filters?: { restaurantUserId?: string; limit?: number }) => Promise<ChatActivityLog[]>;
  loadPlatformRestaurantDetail: (restaurantId: string) => Promise<PlatformRestaurantDetail>;
  updatePlatformRestaurant: (restaurantId: string, input: { name?: string; slug?: string; profileImageUrl?: string | null; isActive?: boolean }) => Promise<void>;
  updatePlatformBranch: (restaurantId: string, branchId: string, input: { name: string }) => Promise<void>;
  rotatePlatformRestaurantToken: (restaurantId: string) => Promise<{ rawApiToken: string }>;
  uploadPlatformRestaurantProfileImage: (file: File) => Promise<string>;
  configurePlatformRestaurantChat: (restaurantId: string, input: { email: string; password: string }) => Promise<void>;
  createPlatformRestaurant: (input: {
    restaurantName: string;
    slug: string;
    profileImageUrl?: string;
    branchName: string;
    timezone: string;
    ownerFullName: string;
    ownerEmail: string;
    ownerPassword: string;
  }) => Promise<void>;
  createPlatformRestaurantUser: (
    restaurantId: string,
    input: { fullName: string; email: string; password: string; role: RestaurantUserRole }
  ) => Promise<void>;
  updatePlatformRestaurantUser: (
    restaurantId: string,
    userId: string,
    input: {
      fullName?: string;
      email?: string;
      password?: string;
      role?: RestaurantUserRole;
      isActive?: boolean;
    }
  ) => Promise<void>;
  deletePlatformRestaurantUser: (restaurantId: string, userId: string) => Promise<void>;
  refreshAll: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [token, setToken] = useState("");
  const [currentUser, setCurrentUser] = useState<WorkspaceUser | null>(null);
  const [userName, setUserName] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [platformRestaurants, setPlatformRestaurants] = useState<PlatformRestaurantSummary[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [selectedDate, setSelectedDate] = useState(argentinaToday());
  const [selectedTurn, setSelectedTurn] = useState<"mediodia" | "noche">("noche");
  const [specialServices, setSpecialServices] = useState<SpecialService[]>([]);
  const [selectedSpecialServiceId, setSelectedSpecialServiceId] = useState("");
  const [roomDetail, setRoomDetail] = useState<RoomDetail | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tableStates, setTableStates] = useState<ServiceState[]>([]);
  const [roomBlocks, setRoomBlocks] = useState<RoomBookingBlock[]>([]);
  const [reservationForm, setReservationForm] = useState<CreateReservationForm>(initialReservationForm);
  const [roomForm, setRoomForm] = useState({ name: "", description: "", isOutdoor: false });
  const [chatSession, setChatSession] = useState<ChatSession>({
    token: "",
    user: null
  });
  const [feedback, setFeedback] = useState("");

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {})
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Request failed");
    }

    return response.json();
  }

  function clearChatSession() {
    window.localStorage.removeItem("auth_token");
    window.localStorage.removeItem("user_data");
    setChatSession({
      token: "",
      user: null
    });
  }

  async function validateStoredChatSession(chatToken: string) {
    const response = await fetch(`${CHAT_API_URL}/auth`, {
      headers: {
        "x-auth-token": chatToken
      }
    });

    if (!response.ok) {
      throw new Error("Sesion de chat invalida");
    }

    const user = await response.json();
    window.localStorage.setItem("user_data", JSON.stringify(user));
    setChatSession({
      token: chatToken,
      user
    });
  }


  async function loadBootstrap(authToken = token) {
    const response = await fetch(`${API_URL}/restaurant/bootstrap`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    if (!response.ok) {
      throw new Error("No se pudo cargar el restaurante");
    }

    const data: Bootstrap = await response.json();
    setBootstrap(data);

    const branchId = selectedBranchId || data.branches[0]?.id || "";
    setSelectedBranchId(branchId);
    const roomId = selectedRoomId || data.branches.find((branch) => branch.id === branchId)?.rooms[0]?.id || "";
    setSelectedRoomId(roomId);
  }

  async function loadPlatformRestaurants() {
    const data = await api<PlatformRestaurantSummary[]>("/platform/restaurants");
    const hydrated = await Promise.all(
      data.map(async (restaurant) => {
        try {
          const detail = await api<PlatformRestaurantDetail>(`/platform/restaurants/${restaurant.id}`);
          return {
            ...restaurant,
            chatPhoneNumberId: detail.chatPhoneNumberId ?? null,
            branches: detail.branches.map((branch) => ({
              id: branch.id,
              name: branch.name,
              timezone: branch.timezone,
              rooms: branch.rooms || []
            }))
          };
        } catch (error) {
          setFeedback(error instanceof Error ? error.message : "No se pudieron cargar los salones del restaurante");
          return {
            ...restaurant,
            branches: restaurant.branches.map((branch) => ({
              ...branch,
              rooms: branch.rooms || []
            }))
          };
        }
      })
    );
    setPlatformRestaurants(hydrated);
    return hydrated;
  }

  async function loadOperationalData() {
    if (!selectedBranchId) return;
    const [reservationsData, customersData, statesData] = await Promise.all([
      api<Reservation[]>(`/restaurant/reservations?branchId=${selectedBranchId}&serviceDate=${selectedDate}&turn=${selectedTurn}${selectedSpecialServiceId ? `&specialServiceId=${selectedSpecialServiceId}` : ""}`),
      api<Customer[]>(`/restaurant/customers?branchId=${selectedBranchId}`),
      api<ServiceState[]>(`/restaurant/tables/states?branchId=${selectedBranchId}&serviceDate=${selectedDate}&turn=${selectedTurn}${selectedSpecialServiceId ? `&specialServiceId=${selectedSpecialServiceId}` : ""}`)
    ]);
    setReservations(reservationsData);
    setCustomers(customersData);
    setTableStates(statesData);
  }

  async function loadRoomBlocks() {
    if (!selectedBranchId) return;
    const blocks = await api<RoomBookingBlock[]>(`/restaurant/rooms/blocks?branchId=${selectedBranchId}&serviceDate=${selectedDate}&turn=${selectedTurn}`);
    setRoomBlocks(blocks);
  }

  async function loadRoomDetail() {
    if (!selectedRoomId) {
      setRoomDetail(null);
      return;
    }
    const detail = await api<RoomDetail>(`/restaurant/rooms/${selectedRoomId}/layout`);
    setRoomDetail(detail);
  }

  async function loadSpecialServices() {
    if (!selectedBranchId) return;
    const services = await api<SpecialService[]>(`/restaurant/online-booking/special-services?branchId=${selectedBranchId}&serviceDate=${selectedDate}`);
    setSpecialServices(services);
    setSelectedSpecialServiceId((current) => services.some((service) => service.id === current) ? current : services[0]?.id || "");
  }

  async function refreshAll() {
    if (currentUser?.scope === "platform") {
      await loadPlatformRestaurants();
      return;
    }

    await Promise.all([loadBootstrap(), loadOperationalData(), loadRoomDetail(), loadRoomBlocks(), loadSpecialServices()]);
  }

  useEffect(() => {
    const savedToken = window.localStorage.getItem("foodie_token");
    const savedUserName = window.localStorage.getItem("foodie_user_name");
    const savedUser = window.localStorage.getItem("foodie_user");
    const savedChatToken = window.localStorage.getItem("auth_token");
    if (savedToken) {
      setToken(savedToken);
      setUserName(savedUserName || "");
      setCurrentUser(savedUser ? JSON.parse(savedUser) : null);
      if (savedChatToken) {
        setChatSession({
          token: savedChatToken,
          user: null
        });
        validateStoredChatSession(savedChatToken).catch(() => clearChatSession());
      }
    } else if (pathname !== "/") {
      router.replace("/");
    }
  }, [pathname, router]);

  useEffect(() => {
    if (!token || !currentUser) return;

    if (currentUser.scope === "restaurant" && ["host", "events"].includes(currentUser.role)) {
      const receptionPaths = ["/panel", "/chat", "/salon", "/reservas"];
      const hasReceptionAccess = receptionPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
      if (!hasReceptionAccess) {
        router.replace("/panel");
        return;
      }
    }

    const load = async () => {
      try {
        if (currentUser.scope === "platform") {
          await loadPlatformRestaurants();
          if (pathname === "/") router.replace("/admin");
          return;
        }

        await loadBootstrap(token);
        if (pathname === "/") router.replace("/panel");
      } catch (error) {
        setLoginError(error instanceof Error ? error.message : "No se pudo cargar la sesion");
        logout();
      }
    };

    void load();
  }, [token, currentUser, pathname, router]);

  useEffect(() => {
    if (!token || currentUser?.scope !== "restaurant" || !selectedBranchId) return;
    loadSpecialServices().catch((error) => setFeedback(error.message));
  }, [token, currentUser, selectedBranchId, selectedDate]);

  useEffect(() => {
    const selectedService = specialServices.find((service) => service.id === selectedSpecialServiceId);
    if (!selectedService) return;

    setSelectedTurn(Number(selectedService.startTime.slice(0, 2)) < 17 ? "mediodia" : "noche");
  }, [specialServices, selectedSpecialServiceId]);

  useEffect(() => {
    if (!token || currentUser?.scope !== "restaurant" || !selectedBranchId) return;
    loadOperationalData().catch((error) => setFeedback(error.message));
    loadRoomBlocks().catch((error) => setFeedback(error.message));
  }, [token, currentUser, selectedBranchId, selectedDate, selectedTurn, selectedSpecialServiceId]);

  useEffect(() => {
    if (!token || currentUser?.scope !== "restaurant" || !selectedRoomId) return;
    loadRoomDetail().catch((error) => setFeedback(error.message));
  }, [token, currentUser, selectedRoomId]);

  async function handleLogin(formData: FormData) {
    setLoading(true);
    setLoginError("");
    try {
      const email = String(formData.get("email") || "");
      const password = String(formData.get("password") || "");
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password
        })
      });
      if (!response.ok) throw new Error("Credenciales invalidas");
      const data: AuthResponse = await response.json();
      window.localStorage.setItem("foodie_token", data.accessToken);
      window.localStorage.setItem("foodie_user_name", data.user.fullName);
      window.localStorage.setItem("foodie_user", JSON.stringify(data.user));
      setToken(data.accessToken);
      setUserName(data.user.fullName);
      setCurrentUser(data.user);
      if (data.user.scope === "restaurant") {
        if (data.chatSession?.token && data.chatSession.user) {
          window.localStorage.setItem("auth_token", data.chatSession.token);
          window.localStorage.setItem("user_data", JSON.stringify(data.chatSession.user));
          setChatSession(data.chatSession);
        } else {
          clearChatSession();
          setFeedback("Chat no esta configurado o las credenciales del restaurante no son validas.");
        }
      } else {
        clearChatSession();
      }
      router.replace(data.user.scope === "platform" ? "/admin" : "/panel");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Login fallido");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    window.localStorage.removeItem("foodie_token");
    window.localStorage.removeItem("foodie_user_name");
    window.localStorage.removeItem("foodie_user");
    clearChatSession();
    setToken("");
    setCurrentUser(null);
    setUserName("");
    setBootstrap(null);
    setPlatformRestaurants([]);
    setSelectedBranchId("");
    setSelectedRoomId("");
    setReservations([]);
    setCustomers([]);
    setTableStates([]);
    setRoomDetail(null);
    router.replace("/");
  }

  async function createRoom() {
    if (!selectedBranchId || !roomForm.name.trim()) return;
    try {
      await api("/restaurant/rooms", {
        method: "POST",
        body: JSON.stringify({
          branchId: selectedBranchId,
          name: roomForm.name,
          description: roomForm.description,
          isOutdoor: roomForm.isOutdoor
        })
      });
      setRoomForm({ name: "", description: "", isOutdoor: false });
      await loadBootstrap();
      setFeedback("Salon creado");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo crear el salon");
    }
  }

  async function updateRoom(roomId: string, input: { name: string; description: string; isOutdoor: boolean }) {
    try {
      await api(`/restaurant/rooms/${roomId}`, {
        method: "PATCH",
        body: JSON.stringify(input)
      });
      await loadBootstrap();
      if (selectedRoomId === roomId) {
        await loadRoomDetail();
      }
      setFeedback("Salon actualizado");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo actualizar el salon");
    }
  }

  async function deleteRoom(roomId: string) {
    try {
      await api(`/restaurant/rooms/${roomId}`, {
        method: "DELETE"
      });

      const nextRoomId =
        bootstrap?.branches
          .find((branch) => branch.id === selectedBranchId)
          ?.rooms.find((room) => room.id !== roomId)?.id || "";

      if (selectedRoomId === roomId) {
        setSelectedRoomId(nextRoomId);
      }

      await loadBootstrap();
      setFeedback("Salon eliminado");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo eliminar el salon");
    }
  }

  async function saveRoomLayout(roomId: string, payload: unknown) {
    try {
      await api(`/restaurant/rooms/${roomId}/layout`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      const refresh = await Promise.allSettled([loadBootstrap(), loadRoomDetail()]);
      if (refresh.some((result) => result.status === "rejected")) {
        setFeedback("Plano guardado. No pudimos actualizar la vista; recargá la página para ver la versión guardada.");
        return;
      }
      setFeedback("Layout guardado");
    } catch (error) {
      const message = roomLayoutErrorMessage(error);
      setFeedback(message);
      throw new Error(message);
    }
  }

  async function createReservation() {
    if (!selectedBranchId || (reservationForm.reservationKind === "standard" && !selectedRoomId)) {
      const message = "Selecciona una sucursal y un salon antes de crear la reserva";
      setFeedback(message);
      throw new Error(message);
    }
    try {
      const isEvent = reservationForm.reservationKind === "event";
      await api(isEvent ? "/restaurant/reservations/events" : "/restaurant/reservations", {
        method: "POST",
        body: JSON.stringify({
          branchId: selectedBranchId,
          fullName: reservationForm.fullName,
          phone: reservationForm.phone,
          email: reservationForm.email,
          partySize: Number(reservationForm.partySize),
          serviceDate: selectedDate,
          serviceTime: reservationForm.serviceTime,
          ...(isEvent
            ? {
                rooms: reservationForm.eventRooms.map((room) => ({
                  roomId: room.roomId,
                  allocatedCovers: Number(room.allocatedCovers),
                  usage: room.usage
                }))
              }
            : {
                roomId: selectedRoomId,
                preferredZone: reservationForm.preferredZone || undefined,
                preferredTags: reservationForm.preferredTags.split(",").map((item) => item.trim()).filter(Boolean),
                birthday: reservationForm.birthday || undefined,
                tableIds: reservationForm.selectedTableIds.length ? reservationForm.selectedTableIds : undefined,
                manualTableSelection: reservationForm.tableSelectionMode === "manual" || undefined
              }),
          notes: reservationForm.notes || undefined,
        })
      });
      setReservationForm(initialReservationForm);
      await loadOperationalData();
      setFeedback("Reserva creada");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo crear la reserva";
      setFeedback(message);
      throw new Error(message);
    }
  }

  async function moveReservation(reservationId: string, action: "check-in" | "release") {
    try {
      await api(`/restaurant/reservations/${reservationId}/${action}`, { method: "POST" });
      await loadOperationalData();
      setFeedback(action === "check-in" ? "Mesa ocupada" : "Mesa liberada");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo actualizar la reserva");
    }
  }

  async function setTableState(tableId: string, status: ServiceState["status"]) {
    if (!selectedRoomId || !selectedBranchId) return;
    try {
      await api("/restaurant/tables/states", {
        method: "POST",
        body: JSON.stringify({
          tableId,
          roomId: selectedRoomId,
          branchId: selectedBranchId,
          serviceDate: selectedDate,
          turn: selectedTurn,
          status
        })
      });
      await loadOperationalData();
      setFeedback(`Mesa actualizada a ${status}`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo actualizar la mesa");
    }
  }

  async function createCustomer(input: {
    fullName: string;
    phone?: string | null;
    email?: string | null;
    birthday?: string | null;
    notes?: string | null;
    tags?: string[];
  }) {
    try {
      await api("/restaurant/customers", {
        method: "POST",
        body: JSON.stringify({
          branchId: selectedBranchId || undefined,
          ...input
        })
      });
      await loadOperationalData();
      setFeedback("Cliente creado");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo crear el cliente";
      setFeedback(message);
      throw error;
    }
  }

  async function updateCustomer(
    customerId: string,
    input: {
      fullName?: string;
      phone?: string | null;
      email?: string | null;
      birthday?: string | null;
      notes?: string | null;
      tags?: string[];
    }
  ) {
    try {
      await api(`/restaurant/customers/${customerId}`, {
        method: "PATCH",
        body: JSON.stringify(input)
      });
      await loadOperationalData();
      setFeedback("Cliente actualizado");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar el cliente";
      setFeedback(message);
      throw error;
    }
  }

  async function deleteCustomer(customerId: string) {
    try {
      await api(`/restaurant/customers/${customerId}`, {
        method: "DELETE"
      });
      await loadOperationalData();
      setFeedback("Cliente eliminado");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo eliminar el cliente";
      setFeedback(message);
      throw error;
    }
  }

  async function loadCustomerDetail(customerId: string) {
    return api<CustomerDetail>(`/restaurant/customers/${customerId}`);
  }

  async function loadReservationHistory(filters: {
    branchId?: string;
    dateFrom?: string;
    dateTo?: string;
    turn?: "mediodia" | "noche" | "all";
    status?: string;
    search?: string;
  }) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return api<Reservation[]>(`/restaurant/reservations/history?${params.toString()}`);
  }

  async function loadRestaurantUsers() {
    return api<RestaurantStaffUser[]>("/restaurant/users");
  }

  async function loadRestaurantUserDetail(userId: string) {
    return api<RestaurantStaffUserDetail>(`/restaurant/users/${userId}`);
  }

  async function createRestaurantUser(input: { fullName: string; email: string; password: string; role: RestaurantUserRole }) {
    try {
      await api("/restaurant/users", {
        method: "POST",
        body: JSON.stringify(input)
      });
      setFeedback("Usuario creado");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo crear el usuario";
      setFeedback(message);
      throw error;
    }
  }

  async function updateRestaurantUser(
    userId: string,
    input: { fullName?: string; email?: string; password?: string; role?: RestaurantUserRole; isActive?: boolean }
  ) {
    try {
      await api(`/restaurant/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(input)
      });
      setFeedback("Usuario actualizado");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar el usuario";
      setFeedback(message);
      throw error;
    }
  }

  async function deleteRestaurantUser(userId: string) {
    try {
      await api(`/restaurant/users/${userId}`, { method: "DELETE" });
      setFeedback("Usuario eliminado");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo eliminar el usuario";
      setFeedback(message);
      throw error;
    }
  }

  async function loadRestaurantActivity(filters?: { restaurantUserId?: string; limit?: number }) {
    const params = new URLSearchParams();
    params.set("limit", String(filters?.limit || 120));
    if (filters?.restaurantUserId) params.set("restaurantUserId", filters.restaurantUserId);
    return api<RestaurantActivityLog[]>(`/restaurant/activity?${params.toString()}`);
  }

  async function loadRestaurantChatActivity(filters?: { restaurantUserId?: string; limit?: number }) {
    const params = new URLSearchParams();
    params.set("limit", String(filters?.limit || 120));
    if (filters?.restaurantUserId) params.set("restaurantUserId", filters.restaurantUserId);
    return api<ChatActivityLog[]>(`/restaurant/chat-activity?${params.toString()}`);
  }

  async function loadPlatformRestaurantDetail(restaurantId: string) {
    return api<PlatformRestaurantDetail>(`/platform/restaurants/${restaurantId}`);
  }

  async function loadRoomLayoutImpact(roomId: string, payload: unknown, focusTableId?: string) {
    try {
      return await api<RoomLayoutImpact>(`/restaurant/rooms/${roomId}/layout-impact`, {
        method: "POST",
        body: JSON.stringify(focusTableId ? { ...(payload as Record<string, unknown>), focusTableId } : payload)
      });
    } catch (error) {
      throw new Error(roomLayoutErrorMessage(error, "No pudimos revisar las reservas afectadas. Tus cambios siguen en pantalla; intentá de nuevo."));
    }
  }

  async function cancelReservation(reservationId: string, reason?: string) {
    try {
      const updated = await api<Reservation>(`/restaurant/reservations/${reservationId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: reason?.trim() || undefined })
      });
      await loadOperationalData();
      setFeedback("Reserva cancelada");
      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cancelar la reserva";
      setFeedback(message);
      throw new Error(message);
    }
  }

  async function rescheduleReservation(reservationId: string, serviceDate: string) {
    try {
      const updated = await api<Reservation>("/restaurant/reservations/" + reservationId + "/reschedule", {
        method: "POST",
        body: JSON.stringify({ serviceDate })
      });
      await loadOperationalData();
      setFeedback("Fecha de reserva actualizada");
      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cambiar la fecha de la reserva";
      setFeedback(message);
      throw new Error(message);
    }
  }

  async function deleteReservation(reservationId: string) {
    try {
      await api(`/restaurant/reservations/${reservationId}`, { method: "DELETE" });
      await loadOperationalData();
      setFeedback("Reserva eliminada");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo eliminar la reserva";
      setFeedback(message);
      throw new Error(message);
    }
  }

  async function loadReservationTableOptions(reservationId: string) {
    return api<ReservationTableOption[]>(`/restaurant/reservations/${reservationId}/table-options`);
  }

  async function loadReservationTableAvailability(reservationId: string, roomId: string, excludedTableIds: string[] = []) {
    const query = new URLSearchParams({ roomId });
    if (excludedTableIds.length) query.set("excludeTableIds", excludedTableIds.join(","));
    return api<ReservationTableAvailability>(`/restaurant/reservations/${reservationId}/table-availability?${query.toString()}`);
  }

  async function loadAvailableReservationTableOptions(input: { branchId: string; roomId: string; partySize: number; serviceDate: string; serviceTime: string; preferredZone?: string }) {
    const query = new URLSearchParams({
      branchId: input.branchId,
      roomId: input.roomId,
      partySize: String(input.partySize),
      serviceDate: input.serviceDate,
      serviceTime: input.serviceTime,
      ...(input.preferredZone ? { preferredZone: input.preferredZone } : {})
    });
    return api<ReservationTableOption[]>(`/restaurant/reservations/available-table-options?${query.toString()}`);
  }

  async function loadAvailableManualReservationTables(input: { branchId: string; roomId: string; serviceDate: string; serviceTime: string; preferredZone?: string }) {
    const query = new URLSearchParams({
      branchId: input.branchId,
      roomId: input.roomId,
      serviceDate: input.serviceDate,
      serviceTime: input.serviceTime,
      ...(input.preferredZone ? { preferredZone: input.preferredZone } : {})
    });
    return api<ManualReservationTableOption[]>(`/restaurant/reservations/available-manual-tables?${query.toString()}`);
  }

  async function reassignReservationTables(reservationId: string, input: { roomId: string; tableIds: string[] }) {
    try {
      await api(`/restaurant/reservations/${reservationId}/reassign-tables`, {
        method: "POST",
        body: JSON.stringify(input)
      });
      await loadOperationalData();
      setFeedback("Mesas y salon reasignados");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo reasignar la mesa";
      setFeedback(message);
      throw new Error(message);
    }
  }

  async function updatePlatformRestaurant(
    restaurantId: string,
    input: { name?: string; slug?: string; profileImageUrl?: string | null; isActive?: boolean; chatPhoneNumberId?: string | null }
  ) {
    try {
      await api(`/platform/restaurants/${restaurantId}`, { method: "PATCH", body: JSON.stringify(input) });
      await loadPlatformRestaurants();
      setFeedback("Restaurante actualizado");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar el restaurante";
      setFeedback(message);
      throw error;
    }
  }

  async function updatePlatformBranch(restaurantId: string, branchId: string, input: { name: string }) {
    try {
      await api(`/platform/restaurants/${restaurantId}/branches/${branchId}`, { method: "PATCH", body: JSON.stringify(input) });
      await loadPlatformRestaurants();
      setFeedback("Sede actualizada");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar la sede";
      setFeedback(message);
      throw error;
    }
  }

  async function uploadPlatformRestaurantProfileImage(file: File) {
    const formData = new FormData();
    formData.set("file", file);

    const response = await fetch(`${API_URL}/platform/restaurants/profile-image`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: formData
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "No se pudo subir la foto");
    }

    const data: { url: string } = await response.json();
    return data.url;
  }

  async function configurePlatformRestaurantChat(restaurantId: string, input: { email: string; password: string }) {
    try {
      await api(`/platform/restaurants/${restaurantId}/chat-auth`, {
        method: "PATCH",
        body: JSON.stringify(input)
      });
      setFeedback("Credenciales de Chat configuradas para el restaurante");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudieron guardar las credenciales de Chat";
      setFeedback(message);
      throw error;
    }
  }

  async function reorderRooms(branchId: string, roomIds: string[]) {
    try {
      await api("/restaurant/rooms/reorder", {
        method: "PUT",
        body: JSON.stringify({ branchId, roomIds })
      });
      await loadBootstrap();
      setFeedback("Prioridad de salones actualizada");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo actualizar la prioridad de salones");
      throw error;
    }
  }

  async function blockRoom(roomId: string, reason?: string) {
    try {
      const block = await api<RoomBookingBlock>(`/restaurant/rooms/${roomId}/blocks`, { method: "POST", body: JSON.stringify({ serviceDate: selectedDate, turn: selectedTurn, reason: reason || undefined }) });
      setRoomBlocks((current) => [...current.filter((item) => item.roomId !== roomId), block]);
      void loadRoomBlocks().catch(() => undefined);
      setFeedback("Salon bloqueado para reservas");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo bloquear el salon";
      setFeedback(message);
      throw error;
    }
  }

  async function unblockRoom(roomId: string) {
    try {
      await api(`/restaurant/rooms/${roomId}/blocks?serviceDate=${selectedDate}&turn=${selectedTurn}`, { method: "DELETE" });
      setRoomBlocks((current) => current.filter((item) => item.roomId !== roomId));
      void loadRoomBlocks().catch(() => undefined);
      setFeedback("Salon habilitado para reservas");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo habilitar el salon";
      setFeedback(message);
      throw error;
    }
  }

  async function loadRoomBookingRules(roomId: string) {
    return api<RoomBookingRule[]>(`/restaurant/rooms/${roomId}/booking-rules`);
  }

  async function createRoomBookingRule(roomId: string, input: Omit<RoomBookingRule, "id" | "roomId" | "createdAt" | "updatedAt">) {
    const rule = await api<RoomBookingRule>(`/restaurant/rooms/${roomId}/booking-rules`, { method: "POST", body: JSON.stringify(input) });
    setFeedback("Bloqueo programado guardado");
    return rule;
  }

  async function updateRoomBookingRule(roomId: string, ruleId: string, input: Omit<RoomBookingRule, "id" | "roomId" | "createdAt" | "updatedAt">) {
    const rule = await api<RoomBookingRule>(`/restaurant/rooms/${roomId}/booking-rules/${ruleId}`, { method: "PATCH", body: JSON.stringify(input) });
    setFeedback("Bloqueo programado actualizado");
    return rule;
  }

  async function deleteRoomBookingRule(roomId: string, ruleId: string) {
    await api(`/restaurant/rooms/${roomId}/booking-rules/${ruleId}`, { method: "DELETE" });
    setFeedback("Bloqueo programado eliminado");
  }

  async function createPlatformRestaurant(input: {
    restaurantName: string;
    slug: string;
    profileImageUrl?: string;
    branchName: string;
    timezone: string;
    ownerFullName: string;
    ownerEmail: string;
    ownerPassword: string;
  }) {
    try {
      await api("/platform/restaurants/onboarding", {
        method: "POST",
        body: JSON.stringify(input)
      });
      await loadPlatformRestaurants();
      setFeedback("Restaurante creado");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo crear el restaurante";
      setFeedback(message);
      throw error;
    }
  }

  async function rotatePlatformRestaurantToken(restaurantId: string) {
    return api<{ rawApiToken: string }>(`/platform/restaurants/${restaurantId}/integration-tokens/rotate`, {
      method: "POST",
      body: JSON.stringify({ label: "WhatsApp assistant" })
    });
  }

  async function createPlatformRestaurantUser(
    restaurantId: string,
    input: { fullName: string; email: string; password: string; role: RestaurantUserRole }
  ) {
    try {
      await api(`/platform/restaurants/${restaurantId}/users`, {
        method: "POST",
        body: JSON.stringify(input)
      });
      await loadPlatformRestaurants();
      setFeedback("Usuario creado");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo crear el usuario";
      setFeedback(message);
      throw error;
    }
  }

  async function updatePlatformRestaurantUser(
    restaurantId: string,
    userId: string,
    input: {
      fullName?: string;
      email?: string;
      password?: string;
      role?: RestaurantUserRole;
      isActive?: boolean;
    }
  ) {
    try {
      await api(`/platform/restaurants/${restaurantId}/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(input)
      });
      await loadPlatformRestaurants();
      setFeedback("Usuario actualizado");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar el usuario";
      setFeedback(message);
      throw error;
    }
  }

  async function deletePlatformRestaurantUser(restaurantId: string, userId: string) {
    try {
      await api(`/platform/restaurants/${restaurantId}/users/${userId}`, {
        method: "DELETE"
      });
      await loadPlatformRestaurants();
      setFeedback("Usuario eliminado");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo eliminar el usuario";
      setFeedback(message);
      throw error;
    }
  }

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      token,
      currentUser,
      userName,
      loginError,
      loading,
      bootstrap,
      platformRestaurants,
      selectedBranchId,
      selectedRoomId,
      selectedDate,
      selectedTurn,
      specialServices,
      selectedSpecialServiceId,
      roomDetail,
      reservations,
      customers,
      tableStates,
      roomBlocks,
      reservationForm,
      roomForm,
      chatSession,
      feedback,
      setSelectedBranchId,
      setSelectedRoomId,
      setSelectedDate,
      setSelectedTurn,
      setSelectedSpecialServiceId,
      setReservationForm,
      setRoomForm,
      handleLogin,
      logout,
      createRoom,
      updateRoom,
      reorderRooms,
      blockRoom,
      unblockRoom,
      loadRoomBookingRules,
      createRoomBookingRule,
      updateRoomBookingRule,
      deleteRoomBookingRule,
      deleteRoom,
      saveRoomLayout,
      loadRoomLayoutImpact,
      createReservation,
      moveReservation,
      rescheduleReservation,
      cancelReservation,
      deleteReservation,
      loadReservationTableOptions,
      loadReservationTableAvailability,
      loadAvailableReservationTableOptions,
      loadAvailableManualReservationTables,
      reassignReservationTables,
      setTableState,
      createCustomer,
      updateCustomer,
      deleteCustomer,
      loadCustomerDetail,
      loadReservationHistory,
      loadRestaurantUsers,
      loadRestaurantUserDetail,
      createRestaurantUser,
      updateRestaurantUser,
      deleteRestaurantUser,
      loadRestaurantActivity,
      loadRestaurantChatActivity,
      loadPlatformRestaurantDetail,
      updatePlatformRestaurant,
      updatePlatformBranch,
      uploadPlatformRestaurantProfileImage,
      rotatePlatformRestaurantToken,
      configurePlatformRestaurantChat,
      createPlatformRestaurant,
      createPlatformRestaurantUser,
      updatePlatformRestaurantUser,
      deletePlatformRestaurantUser,
      refreshAll
    }),
    [
      token,
      currentUser,
      userName,
      loginError,
      loading,
      bootstrap,
      platformRestaurants,
      selectedBranchId,
      selectedRoomId,
      selectedDate,
      selectedTurn,
      specialServices,
      selectedSpecialServiceId,
      roomDetail,
      reservations,
      customers,
      tableStates,
      roomBlocks,
      reservationForm,
      roomForm,
      chatSession,
      feedback
    ]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return context;
}
