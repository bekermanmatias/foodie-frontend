import { Clock3 } from "lucide-react";
import { WorkspaceShell } from "../../../components/workspace-shell";

export default function DepositsComingSoonPage() {
  return (
    <WorkspaceShell
      title="Señas en desarrollo"
      description="El módulo de señas todavía no está disponible. Estamos trabajando para que puedas gestionarlas desde Foodie."
    >
      <section className="flex min-h-[360px] flex-col items-center justify-center rounded-[26px] border border-brand-line bg-white p-8 text-center">
        <div className="mb-5 rounded-full bg-brand-orange/10 p-4 text-brand-orange">
          <Clock3 className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-extrabold text-brand-ink">Estamos preparando este módulo</h2>
        <p className="mt-2 max-w-md text-sm text-neutral-500">
          Próximamente vas a poder consultar y gestionar las señas de tus reservas desde esta sección.
        </p>
      </section>
    </WorkspaceShell>
  );
}
