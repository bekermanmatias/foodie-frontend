import { redirect } from "next/navigation";
import { DepositsPage } from "../../../components/deposits/deposits-page";

export default async function Page({ searchParams }: {
  searchParams: Promise<{ tab?: string; connection?: string }>;
}) {
  const { tab, connection } = await searchParams;
  if (tab === "drive") {
    const status = connection === "cancelled" || connection === "failed" ? `?connection=${connection}` : "";
    redirect(`/documentos/drive${status}`);
  }
  return <DepositsPage />;
}
