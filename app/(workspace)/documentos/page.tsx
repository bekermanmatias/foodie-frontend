import { redirect } from "next/navigation";
import { DocumentsPage } from "../../../components/deposits/documents-page";

export default async function Page({ searchParams }: { searchParams: Promise<{ connection?: string }> }) {
  const { connection } = await searchParams;
  if (connection === "cancelled" || connection === "failed") redirect(`/documentos/drive?connection=${connection}`);
  return <DocumentsPage />;
}
