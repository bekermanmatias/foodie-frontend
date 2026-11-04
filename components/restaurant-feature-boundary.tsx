"use client";
import { DemoDepositsChat } from "./deposits/demo-deposits-chat";
import { usePathname } from "next/navigation";
import { useWorkspace } from "./workspace-provider";
import { WorkspaceShell } from "./workspace-shell";
import { unavailableRoute } from "../lib/restaurant-features";

export function RestaurantFeatureBoundary({ children }: { children: React.ReactNode }) {
  const { bootstrap, currentUser } = useWorkspace();
  const pathname = usePathname();
  if (currentUser?.scope !== "restaurant") return children;
  if (bootstrap?.isDemo && bootstrap.features?.deposits && pathname === "/chat") return <DemoDepositsChat />;
  const message = bootstrap ? ((pathname === "/notificaciones" || pathname.startsWith("/notificaciones/")) && bootstrap.features?.notifications === false ? "Notificaciones no esta habilitado para este restaurante." : unavailableRoute(bootstrap, pathname)) : "Cargando disponibilidad del restaurante…";
  if (message) return <WorkspaceShell title="Disponibilidad" description="Módulos del restaurante"><p role="status" className="rounded-2xl bg-white p-6">{message}</p></WorkspaceShell>;
  return children;
}
