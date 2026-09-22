"use client";

import { ChevronDown, Info, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getEnabledChatModules } from "./chat/chat-module-registry";
import { StatusAlert } from "./status-alert";
import { useWorkspace } from "./workspace-provider";

const restaurantNavigationItems = [
  { href: "/panel", label: "Panel" },
  { href: "/chat", label: "Chat" },
  { href: "/salon", label: "Salon" },
  { href: "/reservas", label: "Reservas" },
  { href: "/clientes", label: "Clientes" }
];
const receptionNavigationItems = restaurantNavigationItems.filter((item) => ["/panel", "/chat", "/salon", "/reservas"].includes(item.href));
const eventsNavigationItems = receptionNavigationItems;

const platformNavigationItems = [
  { href: "/admin", label: "Restaurantes" },
  { href: "/admin/users", label: "Usuarios" }
];

type NavigationItem = { href: string; label: string; children?: Array<{ href: string; label: string }> };

export function WorkspaceHeaderBrand() {
  return (
    <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white px-4 py-2">
      <Image src="/brand/logo-primary.png" alt="Foodie AI" width={138} height={46} className="h-auto w-[138px]" />
    </div>
  );
}

function PageInfoTooltip({ description }: { description: string }) {
  if (!description) return null;

  return (
    <div className="group relative flex justify-end">
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-[#FF5A00]/30 bg-white text-brand-orange transition hover:bg-[#FFF4ED]"
        aria-label="Informacion de la pantalla"
      >
        <Info className="h-4 w-4" />
      </button>
      <div className="pointer-events-none absolute right-0 top-10 z-30 w-[min(360px,80vw)] translate-y-1 rounded-[22px] border border-white/10 bg-[#1F1F21] px-5 py-4 text-sm leading-6 text-white opacity-0 shadow-[0_18px_45px_rgba(0,0,0,0.28)] transition group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
        {description}
      </div>
    </div>
  );
}

function RestaurantAvatar({ image, name, size = "lg" }: { image?: string | null; name: string; size?: "md" | "lg" }) {
  const sizeClass = size === "lg" ? "h-14 w-14" : "h-12 w-12";
  const imageSize = size === "lg" ? 48 : 42;

  return (
    <div className={`flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-orange`}>
      {image ? (
        <img src={image} alt={name} className="h-full w-full object-cover" />
      ) : (
        <Image src="/brand/mark.png" alt="Foodie AI" width={imageSize} height={imageSize} className="h-10 w-10 object-contain brightness-0 invert" priority />
      )}
    </div>
  );
}

export function WorkspaceShell({
  children,
  title,
  description,
  hideIntro = false,
  fillViewport = false
}: {
  children: React.ReactNode;
  title: string;
  description: string;
  hideIntro?: boolean;
  fillViewport?: boolean;
}) {
  const pathname = usePathname();
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { bootstrap, chatSession, currentUser, feedback, userName, logout, selectedBranchId } = useWorkspace();

  const branch = bootstrap?.branches.find((item) => item.id === selectedBranchId);
  const isReception = currentUser?.scope === "restaurant" && currentUser.role === "host";
  const isEvents = currentUser?.scope === "restaurant" && currentUser.role === "events";
  const chatNavigationItems =
    currentUser?.scope === "restaurant" && !isReception && !isEvents
      ? getEnabledChatModules(chatSession.user).map((module) => ({
          href: module.href,
          label: module.label
        }))
      : [];
const configurationItems: NavigationItem["children"] = [{ href: "/configuracion/personalizar", label: "Restaurante" }, { href: "/configuracion/asistente", label: "Asistente virtual" }, { href: "/configuracion/reservas", label: "Reservas" }, { href: "/configuracion/reservas-online", label: "Reservas online" }];
  const restaurantBaseNavigationItems: NavigationItem[] =
    currentUser?.role === "restaurant_owner"
      ? [...restaurantNavigationItems, { href: "/configuracion/personalizar", label: "Configuración", children: configurationItems }, { href: "/usuarios", label: "Usuarios" }]
      : isEvents ? eventsNavigationItems : isReception ? receptionNavigationItems : restaurantNavigationItems;
  const giftCardNavigationItems: NavigationItem[] = currentUser?.scope === "restaurant" && currentUser.role === "restaurant_owner" ? [{ href: "/gift-cards", label: "Gift Cards" }] : [];
  const navigationItems: NavigationItem[] = currentUser?.scope === "platform" ? platformNavigationItems : [...restaurantBaseNavigationItems, ...giftCardNavigationItems, ...chatNavigationItems];
  const workspaceLabel = currentUser?.scope === "platform" ? "Administracion" : "Operacion";
  const workspaceName = currentUser?.scope === "platform" ? "Foodie AI" : bootstrap?.name || "Restaurante";
  const workspaceImage = currentUser?.scope === "restaurant" ? bootstrap?.profileImageUrl : "";
  const mobileNavigationItems = navigationItems.flatMap((item) => item.children ? item.children : [item]);
  const activeMobileNavigationItem = mobileNavigationItems.find((item) => pathname === item.href || (item.href !== "/chat" && pathname.startsWith(`${item.href}/`)));

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenuOpen]);

  return (
    <div className="h-screen overflow-hidden bg-black">
      <div className="grid h-screen overflow-x-hidden bg-[radial-gradient(circle_at_85%_10%,rgba(0,0,0,0.85)_0,rgba(0,0,0,0.94)_31%,transparent_52%),linear-gradient(135deg,#F4511E_0%,#7A372C_42%,#050505_76%)] xl:grid-cols-[clamp(220px,14vw,272px)_minmax(0,1fr)]">
        <aside className="hidden h-screen overflow-hidden border-r border-white/10 bg-[#1F1F21] text-white xl:block">
          <div className="flex h-full flex-col px-6 py-7 2xl:px-8 2xl:py-8">
            <div className="flex items-center gap-3">
              <RestaurantAvatar image={workspaceImage} name={workspaceName} />
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold leading-tight text-white 2xl:text-base">{workspaceName}</p>
                <p className="mt-0.5 text-xs font-semibold italic text-white 2xl:text-sm">by Foodie AI</p>
              </div>
            </div>

            <nav className="workspace-nav-scroll mt-7 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-2 2xl:mt-8 2xl:space-y-2">
              {navigationItems.map((item) => {
                const active = pathname === item.href || (item.href !== "/chat" && pathname.startsWith(`${item.href}/`));
                const isConfigurationOpen = Boolean(item.children) && (configurationOpen || pathname.startsWith("/configuracion"));
                return (
                  item.children ? <div key={item.href} className="space-y-1.5"><button type="button" onClick={() => setConfigurationOpen((current) => !current)} className={`flex w-full items-center gap-3 rounded-full px-5 py-2.5 text-left text-sm font-bold transition 2xl:text-base ${pathname.startsWith("/configuracion") ? "bg-brand-orange text-white" : "text-white hover:bg-white/10"}`}>{item.label}<ChevronDown className={`ml-auto h-4 w-4 transition ${isConfigurationOpen ? "rotate-180" : ""}`} /></button>{isConfigurationOpen ? <div className="ml-3 space-y-1 border-l border-white/20 pl-3">{item.children.map((child) => <Link key={child.href} href={child.href} className={`block rounded-full px-3 py-1.5 text-xs font-bold 2xl:text-sm ${pathname === child.href ? "bg-white text-brand-orange" : "text-white/75 hover:text-white"}`}>{child.label}</Link>)}</div> : null}</div> : <Link key={item.href} href={item.href} className={`flex items-center rounded-full px-5 py-2.5 text-sm font-bold transition 2xl:text-base ${active ? "bg-brand-orange text-white" : "text-white hover:bg-white/10"}`}>{item.label}</Link>
                );
              })}
            </nav>

            {currentUser?.scope === "restaurant" ? (
              <div className="mt-5 rounded-[18px] border border-white/10 bg-white/5 p-3 2xl:p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-white/45">Sucursal activa</p>
                <p className="mt-2 text-sm font-semibold text-white">{branch?.name || "-"}</p>
              </div>
            ) : (
              <div className="mt-5 rounded-[18px] border border-white/10 bg-white/5 p-3 2xl:p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-white/45">Acceso</p>
                <p className="mt-2 text-sm font-semibold text-white">Administrador de plataforma</p>
              </div>
            )}

            <div className="mt-4 shrink-0 rounded-[14px] bg-white px-5 py-3 text-[#1F1F21] 2xl:px-6 2xl:py-4">
              <p className="text-xs font-medium 2xl:text-sm">{userName}</p>
              <button onClick={logout} className="mt-1 text-xs font-extrabold uppercase text-brand-orange hover:text-[#D64213] 2xl:text-sm">
                Cerrar sesion
              </button>
              {feedback ? <StatusAlert message={feedback} /> : null}
            </div>
          </div>
        </aside>

        <main className={`h-screen min-w-0 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-5 sm:py-6 md:px-8 ${fillViewport ? "xl:px-4 xl:py-4 2xl:px-8 2xl:py-4" : "xl:px-8 xl:py-8 2xl:px-12 2xl:py-10"}`}>
          <div className="relative z-40 mb-5 rounded-[26px] border border-white/10 bg-[#1F1F21] p-4 text-white shadow-[0_18px_40px_rgba(0,0,0,0.18)] xl:hidden">
            <div className="flex items-center gap-3">
              <RestaurantAvatar image={workspaceImage} name={workspaceName} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-white">{workspaceName}</p>
                <p className="text-xs font-semibold italic text-white">by Foodie AI</p>
              </div>
              <button onClick={logout} className="ml-auto rounded-full bg-white px-4 py-2 text-xs font-extrabold uppercase text-brand-orange">
                Salir
              </button>
            </div>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((current) => !current)}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-workspace-menu"
              className="mt-4 flex w-full items-center justify-between rounded-2xl bg-white/10 px-4 py-3 text-left text-sm font-bold text-white"
            >
              <span className="truncate">{activeMobileNavigationItem?.label || "Menú"}</span>
              {mobileMenuOpen ? <X className="h-4 w-4 shrink-0" /> : <Menu className="h-4 w-4 shrink-0" />}
            </button>
            {mobileMenuOpen ? (
              <>
                <button type="button" aria-label="Cerrar menú" onClick={() => setMobileMenuOpen(false)} className="fixed inset-0 z-30 cursor-default bg-black/45" />
                <nav id="mobile-workspace-menu" className="absolute left-0 right-0 top-full z-50 mt-3 rounded-[22px] border border-white/10 bg-[#1F1F21] p-2 shadow-[0_20px_45px_rgba(0,0,0,0.4)]">
                  {mobileNavigationItems.map((item) => {
                    const active = pathname === item.href || (item.href !== "/chat" && pathname.startsWith(`${item.href}/`));
                    return <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)} className={`block rounded-2xl px-4 py-3 text-sm font-bold transition ${active ? "bg-brand-orange text-white" : "text-white hover:bg-white/10"}`}>{item.label}</Link>;
                  })}
                </nav>
              </>
            ) : null}
          </div>

          <div className={`${fillViewport ? "xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:rounded-[26px] xl:p-4 2xl:rounded-[30px] 2xl:p-5" : "xl:rounded-[32px] 2xl:rounded-[36px]"} min-h-[70vh] rounded-[28px] border border-white/70 bg-white p-4 shadow-[0_32px_70px_rgba(0,0,0,0.18)] sm:p-5 md:p-8`}>
            {hideIntro ? null : (
              <div className={`${fillViewport ? "xl:shrink-0 xl:gap-3 xl:pb-3" : "pb-6 md:pb-7"} grid gap-4 border-b border-brand-line lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start`}>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.42em] text-brand-orange md:text-xs md:tracking-[0.5em]">{workspaceLabel}</p>
                  <h1 className={`${fillViewport ? "xl:mt-1 xl:text-3xl 2xl:text-4xl" : "md:mt-4 md:text-5xl 2xl:text-6xl"} mt-3 text-4xl font-extrabold tracking-[-0.06em] text-brand-ink`}>{title}</h1>
                </div>
                <PageInfoTooltip description={description} />
              </div>
            )}

            <div className={`${hideIntro ? "" : fillViewport ? "mt-3" : "mt-6"} ${fillViewport ? "xl:min-h-0 xl:flex-1" : ""} grid gap-6`}>{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
