export type AuthResponse = {
  accessToken: string;
  chatSession?: {
    token: string;
    user: {
      id?: string;
      _id?: string;
      name: string;
      email: string;
      role: string;
      clientId?: string;
      advisorId?: string;
      featureFlags?: Record<string, boolean>;
    };
  } | null;
  user: {
    sub: string;
    scope: "platform" | "restaurant";
    role: string;
    email: string;
    fullName: string;
    restaurantId?: string;
  };
};

export type WorkspaceUser = AuthResponse["user"];

export type Room = {
  id: string;
  branchId: string;
  name: string;
  description?: string | null;
  isOutdoor: boolean;
  bookingPriority: number;
  zones: Array<{ id: string; name: string; slug: string }>;
  tables: Array<{
    id: string;
    label: string;
    seats: number;
    shape: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    isReservable: boolean;
    metadata?: {
      manualFeatures?: {
        hasTvView?: boolean;
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
    } | null;
    zoneId?: string | null;
  }>;
};

export type RoomBookingBlock = {
  id: string;
  roomId: string;
  serviceDate: string;
  turn: "mediodia" | "noche";
  reason?: string | null;
  createdAt: string;
};

export type RoomBookingRule = {
  id: string;
  roomId: string;
  weekdays: number[];
  turns: Array<"mediodia" | "noche">;
  startsAt: string;
  endsAt?: string | null;
  reason?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Branch = {
  id: string;
  name: string;
  timezone: string;
  rooms: Room[];
};

export type Bootstrap = {
  id: string;
  name: string;
  slug: string;
  profileImageUrl?: string | null;
  branches: Branch[];
};

export type RestaurantUserRole = "restaurant_owner" | "restaurant_manager" | "host" | "waiter" | "cashier" | "kitchen" | "events";

export type RestaurantStaffUser = {
  id: string;
  fullName: string;
  email: string;
  role: RestaurantUserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  createdBy?: {
    id: string;
    fullName: string;
    email: string;
  } | null;
};

export type RestaurantStaffUserDetail = RestaurantStaffUser & {
  _count?: {
    auditLogs: number;
    chatActivityLogs: number;
    createdUsers: number;
  };
};

export type RestaurantActivityLog = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  restaurantUser?: {
    id: string;
    fullName: string;
    email: string;
    role: string;
  } | null;
  platformUser?: {
    id: string;
    fullName: string;
    email: string;
    role: string;
  } | null;
};

export type ChatActivityLog = {
  id: string;
  action: string;
  status: "success" | "error";
  chatId: string;
  chatClientId?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  messageType: "text" | "media" | "template";
  messageContent?: string | null;
  templateId?: string | null;
  templateName?: string | null;
  templateParameters?: unknown;
  fileName?: string | null;
  fileMimeType?: string | null;
  fileSize?: number | null;
  externalMessageId?: string | null;
  externalResponse?: unknown;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  restaurantUser?: {
    id: string;
    fullName: string;
    email: string;
    role: string;
  } | null;
};

export type PlatformRestaurantSummary = {
  id: string;
  name: string;
  slug: string;
  profileImageUrl?: string | null;
  isActive: boolean;
  chatModuleEnabled: boolean;
  chatPhoneNumberId?: string | null;
  createdAt: string;
  branches: Array<{
    id: string;
    name: string;
    timezone: string;
    rooms?: Array<{ id: string; name: string; branchId: string }>;
  }>;
  users: Array<{
    id: string;
    fullName: string;
    email: string;
    role: string;
    isActive: boolean;
  }>;
  integrationTokens: Array<{
    id: string;
    label: string;
    isActive: boolean;
    createdAt: string;
    apiKey?: string | null;
  }>;
  _count: {
    rooms: number;
    customers: number;
    reservations: number;
  };
};

export type PlatformRestaurantDetail = {
  id: string;
  name: string;
  slug: string;
  profileImageUrl?: string | null;
  isActive: boolean;
  chatModuleEnabled: boolean;
  chatClientId?: string | null;
  chatWabaId?: string | null;
  chatWorkflowId?: string | null;
  chatPhoneNumberId?: string | null;
  createdAt: string;
  branches: Array<{
    id: string;
    name: string;
    timezone: string;
    createdAt: string;
    rooms?: Array<{ id: string; name: string; branchId: string }>;
  }>;
  users: Array<{
    id: string;
    fullName: string;
    email: string;
    role: string;
    isActive: boolean;
    createdAt: string;
  }>;
  integrationTokens: Array<{
    id: string;
    label: string;
    isActive: boolean;
    lastUsedAt?: string | null;
    createdAt: string;
    apiKey?: string | null;
  }>;
  _count: {
    rooms: number;
    customers: number;
    reservations: number;
  };
};

export type Reservation = {
  id: string;
  code: string;
  fullName: string;
  phone: string;
  email: string;
  partySize: number;
  status: string;
  source?: "admin" | "integration" | "public_web";
  turn: "mediodia" | "noche";
  serviceDate: string;
  serviceTime: string;
  durationMinutes?: number;
  turnoverMinutes?: number;
  specialService?: { id: string; label: string } | null;
  preferredZone?: string | null;
  notes?: string | null;
  branch?: { id: string; name: string };
  room: { id: string; name: string };
  eventRoomAssignments?: Array<{
    roomId: string;
    allocatedCovers: number;
    usage: "partial" | "full";
    room: { id: string; name: string };
  }>;
  customer?: { id: string; fullName: string; tags: Array<{ id: string; label: string }> } | null;
  tables: Array<{ table: { id: string; label: string; seats: number; metadata?: { capacity?: { maxPartySize?: number } } | null } }>;
};

export type ReservationTableOption = {
  tableIds: string[];
  tableLabels: string[];
  seats: number;
  combination?: boolean;
};

export type Customer = {
  id: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  birthday?: string | null;
  notes?: string | null;
  reservationCount: number;
  tags: Array<{ id: string; label: string }>;
  reservations: Array<{
    id: string;
    code: string;
    serviceDate: string;
    status: string;
    room?: { id: string; name: string } | null;
    tables?: Array<{ table: { id: string; label: string; seats: number } }>;
  }>;
};

export type CustomerDetail = Customer & {
  reservations: Customer["reservations"];
};

export type ServiceState = {
  id: string;
  tableId: string;
  reservationId?: string | null;
  status: "free" | "reserved" | "occupied" | "blocked";
};

export type RoomDetail = Room & {
  floorPlanItems: Array<{
    id: string;
    kind: string;
    label?: string | null;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    metadata?: Record<string, unknown> | null;
  }>;
  combinations: Array<{
    id: string;
    parentTableId: string;
    childTableId: string;
    combinedSeats: number;
  }>;
};

export type CreateReservationForm = {
  reservationKind: "standard" | "event";
  fullName: string;
  phone: string;
  email: string;
  partySize: string;
  serviceTime: string;
  preferredZone: string;
  preferredTags: string;
  birthday: string;
  notes: string;
  selectedTableIds: string[];
  tableSelectionMode: "automatic" | "configured" | "manual";
  eventRooms: Array<{ roomId: string; allocatedCovers: string; usage: "partial" | "full" }>;
};

export type ReservationTableAvailability = {
  roomId: string;
  isBookable: boolean;
  unavailableReason?: string | null;
  tables: Array<{
    id: string;
    label: string;
    seats: number;
    isAvailable: boolean;
    unavailableReason?: string | null;
  }>;
};

export type RoomLayoutImpact = {
  affectedTableIds: string[];
  excludedTableIds: string[];
  reservations: Array<{
    reservation: Reservation;
    affectedTables: string[];
    requiresReassignment: boolean;
    blocksLayout: boolean;
    reasons: string[];
    finalCapacity: number;
  }>;
};

export type SpecialService = {
  id: string;
  branchId: string;
  serviceDate: string;
  label: string;
  startTime: string;
  endTime: string;
  intervalMin: number;
  durationMinutes: number;
  turnoverMinutes: number;
  position: number;
};

export const initialReservationForm: CreateReservationForm = {
  reservationKind: "standard",
  fullName: "",
  phone: "",
  email: "",
  partySize: "2",
  serviceTime: "20:00",
  preferredZone: "",
  preferredTags: "",
  birthday: "",
  notes: "",
  selectedTableIds: [],
  tableSelectionMode: "automatic",
  eventRooms: []
};

export type ManualReservationTableOption = {
  id: string;
  label: string;
  seats: number;
};
