"use client";
import { useState } from "react";
import { WorkspaceShell } from "../workspace-shell";
import { DepositsPanel } from "./deposits-panel";
export function DemoDepositsChat() {
  const [phone, setPhone] = useState(""); const [contact, setContact] = useState("");
  return <WorkspaceShell title="Chat de prueba" description="Simulación interna de la cuenta demo. No envía mensajes ni se conecta a PupuIA."><form className="mb-4 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); setContact(phone.replace(/\D/g, "")); }}><label>Teléfono del contacto de prueba<input className="foodie-input" required minLength={7} value={phone} onChange={(event) => setPhone(event.target.value)} /></label><button className="self-end rounded-full border px-4 py-3 font-bold">Abrir contacto</button></form>{contact && <><p className="mb-3 rounded-xl bg-orange-50 p-4 text-sm">Conversación simulada · {contact}. Los comprobantes y pagos se registran únicamente en este restaurante demo.</p><DepositsPanel key={contact} phone={contact} /></>}</WorkspaceShell>;
}
