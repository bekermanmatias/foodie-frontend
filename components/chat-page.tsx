"use client";

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
      {chatSession.token ? (
        <ChatAuthProvider>
          <ChatProvider>
            <ChatDashboard />
          </ChatProvider>
        </ChatAuthProvider>
      ) : (
        <section className="rounded-[28px] border border-brand-line bg-white p-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-orange">Sesion requerida</p>
          <p className="mt-3 text-2xl font-semibold text-brand-ink">No hay sesion activa contra `chat.pupuia.com`</p>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-neutral-500">El dashboard se habilita automaticamente cuando el login puente al sistema de chat responde bien.</p>
        </section>
      )}
    </WorkspaceShell>
  );
}
