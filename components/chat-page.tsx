"use client";

import { Suspense } from "react";
import Link from "next/link";
import { ChatDeepLink } from "./chat/chat-deep-link";
import { ChatAuthProvider } from "./chat/chat-auth";
import { ChatDashboard } from "./chat/chat-dashboard";
import { ChatProvider } from "./chat/chat-context";
import { WorkspaceShell } from "./workspace-shell";
import { useWorkspace } from "./workspace-provider";

export function ChatPage() {
  const { chatSession } = useWorkspace();

  return (
    <WorkspaceShell
      title="Chat y WhatsApp."
      description="Opera WhatsApp desde Foodie con una vista unificada de conversaciones, control manual, etiquetas y exportacion."
      fillViewport
      compactShortDesktop
    >
      {chatSession.token && chatSession.user ? (
        <ChatAuthProvider>
          <ChatProvider>
            <Suspense fallback={null}><ChatDeepLink /></Suspense>
            <ChatDashboard />
          </ChatProvider>
        </ChatAuthProvider>
      ) : (
        <section className="rounded-[28px] border border-brand-line bg-white p-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-orange">Sesion requerida</p>
          <p className="mt-3 text-2xl font-semibold text-brand-ink">No hay una sesión de chat disponible. Volvé a ingresar para abrir la conversación.</p>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-neutral-500">Podés volver a Notificaciones para reintentar. La alerta sigue pendiente de atención.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <button className="rounded-full bg-brand-orange px-4 py-2 text-sm font-bold text-white" onClick={() => window.location.reload()}>Reintentar conexión</button>
            <Link href="/notificaciones" className="rounded-full border border-brand-line px-4 py-2 text-sm">Volver a Notificaciones</Link>
          </div>
        </section>
      )}
    </WorkspaceShell>
  );
}
