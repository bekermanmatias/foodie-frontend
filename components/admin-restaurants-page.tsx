"use client";

import { Building2, Copy, Mail, MessageCircle, Pencil, Plus, UserCog, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppModal } from "./app-modal";
import { WorkspaceShell } from "./workspace-shell";
import { useWorkspace } from "./workspace-provider";

type RestaurantFormState = {
  restaurantName: string;
  slug: string;
  profileImageUrl: string;
  branchName: string;
  timezone: string;
  ownerFullName: string;
  ownerEmail: string;
  ownerPassword: string;
};

type EditRestaurantFormState = {
  name: string;
  slug: string;
  profileImageUrl: string;
  chatPhoneNumberId: string;
  branchName: string;
  branchId: string;
  isActive: boolean;
};

type ChatCredentialsFormState = {
  email: string;
  password: string;
};

const initialRestaurantForm: RestaurantFormState = {
  restaurantName: "",
  slug: "",
  profileImageUrl: "",
  branchName: "",
  timezone: "America/Argentina/Buenos_Aires",
  ownerFullName: "",
  ownerEmail: "",
  ownerPassword: ""
};

export function AdminRestaurantsPage() {
  const { currentUser, platformRestaurants, createPlatformRestaurant, updatePlatformRestaurant, updatePlatformBranch, uploadPlatformRestaurantProfileImage, rotatePlatformRestaurantToken, configurePlatformRestaurantChat } = useWorkspace();
  const [restaurantModalOpen, setRestaurantModalOpen] = useState(false);
  const [restaurantForm, setRestaurantForm] = useState<RestaurantFormState>(initialRestaurantForm);
  const [profileUploading, setProfileUploading] = useState(false);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [generatingApiKey, setGeneratingApiKey] = useState("");
  const [editingRestaurant, setEditingRestaurant] = useState<(typeof platformRestaurants)[number] | null>(null);
  const [editForm, setEditForm] = useState<EditRestaurantFormState>({ name: "", slug: "", profileImageUrl: "", chatPhoneNumberId: "", branchName: "", branchId: "", isActive: true });
  const [chatRestaurant, setChatRestaurant] = useState<(typeof platformRestaurants)[number] | null>(null);
  const [chatCredentials, setChatCredentials] = useState<ChatCredentialsFormState>({ email: "", password: "" });
  const [savingChatCredentials, setSavingChatCredentials] = useState(false);
  useEffect(() => {
    const persisted = Object.fromEntries(platformRestaurants.flatMap((restaurant) => {
      const key = restaurant.integrationTokens.find((token) => token.isActive)?.apiKey;
      return key ? [[restaurant.id, key]] : [];
    }));
    setApiKeys((current) => ({ ...persisted, ...current }));
  }, [platformRestaurants]);
  const profileInputRef = useRef<HTMLInputElement>(null);

  const metrics = useMemo(() => {
    return platformRestaurants.reduce(
      (acc, restaurant) => {
        acc.restaurants += 1;
        if (restaurant.isActive) acc.activeRestaurants += 1;
        acc.users += restaurant.users.length;
        acc.reservations += restaurant._count.reservations;
        acc.customers += restaurant._count.customers;
        return acc;
      },
      { restaurants: 0, activeRestaurants: 0, users: 0, reservations: 0, customers: 0 }
    );
  }, [platformRestaurants]);

  async function submitRestaurant() {
    await createPlatformRestaurant(restaurantForm);
    setRestaurantModalOpen(false);
    setRestaurantForm(initialRestaurantForm);
  }

  async function selectProfileImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    setProfileUploading(true);
    try {
      const imageUrl = await uploadPlatformRestaurantProfileImage(file);
      if (editingRestaurant) {
        setEditForm((current) => ({ ...current, profileImageUrl: imageUrl }));
      } else {
        setRestaurantForm((current) => ({ ...current, profileImageUrl: imageUrl }));
      }
    } finally {
      setProfileUploading(false);
    }
  }

  async function copyRestaurantIntegrationIds(restaurant: (typeof platformRestaurants)[number]) {
    const lines = [
      `FOODIE_RESTAURANT_ID=${restaurant.id}`,
      ...restaurant.branches.flatMap((branch, branchIndex) => [
        `FOODIE_BRANCH_${branchIndex + 1}_ID=${branch.id}`,
        ...((branch.rooms || []).map((room, roomIndex) => `FOODIE_BRANCH_${branchIndex + 1}_ROOM_${roomIndex + 1}_ID=${room.id}`))
      ])
    ];

    await navigator.clipboard.writeText(lines.join("\n"));
  }

  function openEditRestaurant(restaurant: (typeof platformRestaurants)[number]) {
    setEditingRestaurant(restaurant);
    const branch = restaurant.branches[0];
    setEditForm({ name: restaurant.name, slug: restaurant.slug, profileImageUrl: restaurant.profileImageUrl || "", chatPhoneNumberId: restaurant.chatPhoneNumberId || "", branchName: branch?.name || "", branchId: branch?.id || "", isActive: restaurant.isActive });
  }

  async function submitEditRestaurant() {
    if (!editingRestaurant) return;
    await updatePlatformRestaurant(editingRestaurant.id, editForm);
    if (editForm.branchId && editForm.branchName.trim()) {
      const originalBranchName = editingRestaurant.branches.find((branch) => branch.id === editForm.branchId)?.name;
      if (editForm.branchName.trim() !== originalBranchName) {
        await updatePlatformBranch(editingRestaurant.id, editForm.branchId, { name: editForm.branchName });
      }
    }
    setEditingRestaurant(null);
  }

  async function generateRestaurantApiKey(restaurantId: string) {
    setGeneratingApiKey(restaurantId);
    try {
      const result = await rotatePlatformRestaurantToken(restaurantId);
      setApiKeys((current) => ({ ...current, [restaurantId]: result.rawApiToken }));
    } finally {
      setGeneratingApiKey("");
    }
  }

  function openChatConfiguration(restaurant: (typeof platformRestaurants)[number]) {
    setChatRestaurant(restaurant);
    setChatCredentials({ email: "", password: "" });
  }

  function closeChatConfiguration() {
    if (savingChatCredentials) return;
    setChatRestaurant(null);
    setChatCredentials({ email: "", password: "" });
  }

  async function saveChatConfiguration() {
    if (!chatRestaurant) return;
    setSavingChatCredentials(true);
    try {
      await configurePlatformRestaurantChat(chatRestaurant.id, chatCredentials);
      setChatRestaurant(null);
      setChatCredentials({ email: "", password: "" });
    } finally {
      setSavingChatCredentials(false);
    }
  }

  if (currentUser?.scope !== "platform") {
    return (
      <WorkspaceShell title="Restaurantes" description="Acceso restringido para administradores de plataforma.">
        <section className="rounded-[28px] border border-brand-line bg-white p-10 text-center text-sm text-neutral-500">
          Este panel solo esta disponible para usuarios `platform_admin`.
        </section>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell
      title="Restaurantes"
      description="Gestiona las cuentas de restaurantes, sus owners iniciales y la fotografia operativa general de cada tenant."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Restaurantes", value: metrics.restaurants, icon: Building2 },
          { label: "Activos", value: metrics.activeRestaurants, icon: Building2 },
          { label: "Usuarios", value: metrics.users, icon: Users },
          { label: "Reservas", value: metrics.reservations, icon: UserCog },
          { label: "Clientes", value: metrics.customers, icon: Mail }
        ].map((card) => (
          <article key={card.label} className="rounded-[24px] border border-brand-line bg-white px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-neutral-500">{card.label}</p>
              <card.icon className="h-4 w-4 text-brand-orange" />
            </div>
            <p className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-brand-ink">{card.value}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[28px] border border-brand-line bg-white">
        <div className="flex items-center justify-between gap-4 border-b border-brand-line px-5 py-4">
          <div>
            <p className="text-lg font-semibold text-brand-ink">Listado de restaurantes</p>
            <p className="mt-1 text-sm text-neutral-500">Cada fila resume sucursales, usuarios, reservas y clientes acumulados.</p>
          </div>
          <button
            type="button"
            onClick={() => setRestaurantModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-brand-orange px-4 py-2.5 text-sm font-medium text-white"
          >
            <Plus className="h-4 w-4" />
            Crear restaurante
          </button>
        </div>

        <div className="hidden grid-cols-[minmax(0,1.2fr)_140px_140px_140px_140px] gap-4 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400 md:grid">
          <span>Restaurante</span>
          <span>Usuarios</span>
          <span>Reservas</span>
          <span>Clientes</span>
          <span>Estado</span>
        </div>

        <div className="divide-y divide-brand-line">
          {platformRestaurants.map((restaurant) => (
            <article key={restaurant.id} className="px-5 py-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_140px_140px_140px_140px] md:items-center">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F4511E]">
                    {restaurant.profileImageUrl ? (
                      <img src={restaurant.profileImageUrl} alt={restaurant.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-lg font-extrabold text-white">{restaurant.name.slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-brand-ink">{restaurant.name}</p>
                    <p className="mt-1 truncate text-sm text-neutral-500">{restaurant.slug}</p>
                    <p className="mt-1 break-all font-mono text-[11px] text-neutral-400">restaurantId: {restaurant.id}</p>
                  </div>
                </div>
                <p className="text-sm text-brand-ink">{restaurant.users.length}</p>
                <p className="text-sm text-brand-ink">{restaurant._count.reservations}</p>
                <p className="text-sm text-brand-ink">{restaurant._count.customers}</p>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${restaurant.isActive ? "bg-[#E8F7EE] text-[#146C37]" : "bg-[#F1F1F1] text-[#5F5F5F]"}`}>
                      {restaurant.isActive ? "Activo" : "Inactivo"}
                    </span>
                    <button type="button" onClick={() => openEditRestaurant(restaurant)} aria-label={`Editar ${restaurant.name}`} className="rounded-full border border-brand-line p-2 text-brand-ink transition hover:border-brand-orange hover:text-brand-orange">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-[22px] border border-brand-line bg-[#FCFAF7] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-orange">Credencial para WhatsApp</p>
                    <p className="mt-1 text-xs text-neutral-500">Generada por el superusuario. Identifica únicamente a este restaurante en la API externa.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyRestaurantIntegrationIds(restaurant)}
                    className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-white px-3 py-2 text-xs font-semibold text-brand-ink transition hover:border-brand-orange hover:text-brand-orange"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copiar IDs
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-brand-line bg-white p-3">
                  <div>
                    <p className="text-xs font-semibold text-brand-ink">Cuenta de Chat Pupia</p>
                    <p className="mt-1 text-xs text-neutral-500">Define qué cuenta de Pupia abre Foodie para mostrar sus conversaciones.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openChatConfiguration(restaurant)}
                    className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-white px-3 py-2 text-xs font-semibold text-brand-ink transition hover:border-brand-orange hover:text-brand-orange"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Configurar Chat
                  </button>
                </div>
                <div className="mt-3 rounded-[18px] border border-brand-line bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-brand-ink">API key del restaurante</p>
                      {apiKeys[restaurant.id] ? <p className="mt-1 break-all font-mono text-xs text-brand-ink">{apiKeys[restaurant.id]}</p> : <p className="mt-1 text-xs text-neutral-400">Todavía no se generó una credencial en esta sesión.</p>}
                    </div>
                    <div className="flex gap-2">
                      {apiKeys[restaurant.id] ? <button type="button" onClick={() => void navigator.clipboard.writeText(apiKeys[restaurant.id])} className="inline-flex items-center gap-2 rounded-full border border-brand-line px-3 py-2 text-xs font-semibold text-brand-ink"><Copy className="h-3.5 w-3.5" />Copiar key</button> : null}
                      <button type="button" disabled={generatingApiKey === restaurant.id} onClick={() => void generateRestaurantApiKey(restaurant.id)} className="rounded-full bg-brand-orange px-3 py-2 text-xs font-semibold text-white">{generatingApiKey === restaurant.id ? "Generando..." : apiKeys[restaurant.id] ? "Rotar key" : "Generar key"}</button>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-neutral-500">Al rotarla, la credencial anterior deja de funcionar. Guardala en n8n porque Foodie no almacena el valor original.</p>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {restaurant.branches.map((branch) => (
                    <div key={branch.id} className="rounded-[18px] border border-brand-line bg-white p-3">
                      <p className="text-sm font-semibold text-brand-ink">{branch.name}</p>
                      <p className="mt-1 break-all font-mono text-[11px] text-neutral-500">branchId: {branch.id}</p>
                      {(branch.rooms || []).length ? (
                        <div className="mt-3 space-y-2">
                          {(branch.rooms || []).map((room) => (
                            <div key={room.id} className="rounded-2xl bg-[#F7F4EF] px-3 py-2">
                              <p className="text-xs font-semibold text-brand-ink">{room.name}</p>
                              <p className="mt-1 break-all font-mono text-[11px] text-neutral-500">roomId: {room.id}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-neutral-400">
                          {restaurant._count.rooms > 0
                            ? "Hay salones creados, pero el endpoint admin no los devolvio. Reinicia backend y recarga."
                            : "Sin salones disponibles para esta sucursal."}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <AppModal
        open={restaurantModalOpen}
        onClose={() => {
          setRestaurantModalOpen(false);
          setRestaurantForm(initialRestaurantForm);
        }}
        title="Crear restaurante"
        description="Alta completa del tenant con su primera sucursal y usuario owner."
        widthClassName="max-w-3xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setRestaurantModalOpen(false);
                setRestaurantForm(initialRestaurantForm);
              }}
              className="flex-1 rounded-full border border-brand-line px-4 py-3 text-sm font-medium text-brand-ink"
            >
              Cancelar
            </button>
            <button type="button" onClick={() => void submitRestaurant()} className="flex-1 rounded-full bg-brand-orange px-4 py-3 text-sm font-medium text-white">
              Crear restaurante
            </button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <span className="mb-2 block text-sm font-medium text-white">Foto de perfil del restaurante</span>
            <div className="flex items-center gap-4 rounded-[22px] border border-white/10 bg-white/5 p-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-orange">
                {restaurantForm.profileImageUrl ? (
                  <img src={restaurantForm.profileImageUrl} alt="Preview restaurante" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-2xl font-extrabold text-white">
                    {(restaurantForm.restaurantName || "R").slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => profileInputRef.current?.click()}
                  disabled={profileUploading}
                  className="rounded-full bg-white px-5 py-3 text-sm font-extrabold text-brand-orange"
                >
                  {profileUploading ? "Subiendo..." : "Subir foto"}
                </button>
                <p className="mt-2 text-xs leading-5 text-white/70">PNG, JPG o WEBP hasta 2MB. Se guarda como archivo y la base conserva solo la URL.</p>
                <input
                  ref={profileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => void selectProfileImage(event.target.files?.[0])}
                />
              </div>
            </div>
          </div>
          {[
            ["restaurantName", "Nombre del restaurante"],
            ["slug", "Slug"],
            ["branchName", "Primera sucursal"],
            ["timezone", "Timezone"],
            ["ownerFullName", "Owner"],
            ["ownerEmail", "Email owner"],
            ["ownerPassword", "Password owner"]
          ].map(([key, label]) => (
            <label key={key} className={`space-y-2 text-sm text-brand-ink ${key === "ownerPassword" ? "md:col-span-2" : ""}`}>
              <span className="font-medium">{label}</span>
              <input
                type={key === "ownerPassword" ? "password" : "text"}
                value={restaurantForm[key as keyof RestaurantFormState]}
                onChange={(event) => setRestaurantForm((current) => ({ ...current, [key]: event.target.value }))}
                placeholder={
                  key === "restaurantName"
                    ? "Ej: La Esquina de Barrio"
                    : key === "slug"
                      ? "Ej: la-esquina"
                      : key === "branchName"
                        ? "Ej: Sucursal Centro"
                        : key === "timezone"
                          ? "Ej: America/Argentina/Buenos_Aires"
                          : key === "ownerFullName"
                            ? "Ej: Owner Restaurante"
                            : key === "ownerEmail"
                              ? "Ej: owner@restaurante.com"
                              : "Minimo 4 caracteres"
                }
                className="w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange"
              />
            </label>
          ))}
        </div>
      </AppModal>

      <AppModal
        open={Boolean(editingRestaurant)}
        onClose={() => setEditingRestaurant(null)}
        title="Editar restaurante"
        description="Actualiza los datos visibles y el estado de esta cuenta."
        footer={
          <>
            <button type="button" onClick={() => setEditingRestaurant(null)} className="flex-1 rounded-full border border-brand-line px-4 py-3 text-sm font-medium text-brand-ink">Cancelar</button>
            <button type="button" onClick={() => void submitEditRestaurant()} className="flex-1 rounded-full bg-brand-orange px-4 py-3 text-sm font-medium text-white">Guardar cambios</button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-[18px] border border-brand-line bg-[#FCFAF7] p-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-orange">
              {editForm.profileImageUrl ? <img src={editForm.profileImageUrl} alt="Preview restaurante" className="h-full w-full object-cover" /> : <span className="text-lg font-extrabold text-white">{(editForm.name || "R").slice(0, 1).toUpperCase()}</span>}
            </div>
            <div>
              <button type="button" onClick={() => profileInputRef.current?.click()} disabled={profileUploading} className="rounded-full bg-brand-orange px-4 py-2 text-xs font-semibold text-white">{profileUploading ? "Subiendo..." : "Cambiar foto"}</button>
              <p className="mt-1 text-xs text-neutral-500">PNG, JPG o WEBP hasta 2MB.</p>
            </div>
          </div>
          <label className="block space-y-2 text-sm text-brand-ink">
            <span className="font-medium">Nombre del restaurante</span>
            <input value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange" />
          </label>
          <label className="block space-y-2 text-sm text-brand-ink">
            <span className="font-medium">Nombre de la sede</span>
            <input value={editForm.branchName} onChange={(event) => setEditForm((current) => ({ ...current, branchName: event.target.value }))} className="w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange" />
          </label>
          <label className="block space-y-2 text-sm text-brand-ink">
            <span className="font-medium">Slug público</span>
            <input value={editForm.slug} onChange={(event) => setEditForm((current) => ({ ...current, slug: event.target.value }))} className="w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange" />
          </label>
          <label className="block space-y-2 text-sm text-brand-ink">
            <span className="font-medium">WhatsApp Phone Number ID</span>
            <input value={editForm.chatPhoneNumberId} onChange={(event) => setEditForm((current) => ({ ...current, chatPhoneNumberId: event.target.value }))} placeholder="Ej: 1357479224108088" className="w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange" />
            <span className="text-xs text-neutral-500">ID del número de WhatsApp (Meta) del restaurante. Se usa para enviar las Gift Cards por chat.</span>
          </label>
          <label className="flex items-center gap-3 text-sm text-brand-ink">
            <input type="checkbox" checked={editForm.isActive} onChange={(event) => setEditForm((current) => ({ ...current, isActive: event.target.checked }))} className="h-4 w-4 accent-brand-orange" />
            Restaurante activo
          </label>
        </div>
      </AppModal>

      <AppModal
        open={Boolean(chatRestaurant)}
        onClose={closeChatConfiguration}
        title="Conectar Chat de Pupia"
        description={`Foodie iniciará sesión en Pupia con esta cuenta para ${chatRestaurant?.name || "el restaurante"}. Usá el usuario que muestra el historial nuevo.`}
        footer={
          <>
            <button type="button" disabled={savingChatCredentials} onClick={closeChatConfiguration} className="flex-1 rounded-full border border-brand-line px-4 py-3 text-sm font-medium text-brand-ink disabled:opacity-60">Cancelar</button>
            <button type="button" disabled={savingChatCredentials || !chatCredentials.email || chatCredentials.password.length < 4} onClick={() => void saveChatConfiguration()} className="flex-1 rounded-full bg-brand-orange px-4 py-3 text-sm font-medium text-white disabled:opacity-60">{savingChatCredentials ? "Guardando..." : "Guardar conexión"}</button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="rounded-2xl bg-white/10 px-4 py-3 text-sm leading-6 text-white/85">No copies el Client ID, WABA ni token de Pupia aquí. Solo ingresá el email y contraseña del perfil de Pupia que ya ve los chats nuevos.</p>
          <label className="block space-y-2 text-sm text-brand-ink">
            <span className="font-medium">Email de Pupia</span>
            <input type="email" autoComplete="username" value={chatCredentials.email} onChange={(event) => setChatCredentials((current) => ({ ...current, email: event.target.value }))} placeholder="usuario@correo.com" className="w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange" />
          </label>
          <label className="block space-y-2 text-sm text-brand-ink">
            <span className="font-medium">Contraseña de Pupia</span>
            <input type="password" autoComplete="current-password" value={chatCredentials.password} onChange={(event) => setChatCredentials((current) => ({ ...current, password: event.target.value }))} placeholder="Contraseña actual" className="w-full rounded-2xl border border-brand-line px-4 py-3 outline-none focus:border-brand-orange" />
          </label>
          <p className="text-xs leading-5 text-white/70">La contraseña se guarda cifrada y no vuelve a mostrarse. Después de guardar, cerrá e iniciá sesión en Foodie para renovar la sesión de Chat.</p>
        </div>
      </AppModal>
    </WorkspaceShell>
  );
}
