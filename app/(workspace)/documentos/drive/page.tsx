import { DocumentsPage } from "../../../../components/deposits/documents-page";

export default async function Page({ searchParams }: { searchParams: Promise<{ connection?: string }> }) {
  const { connection } = await searchParams;
  return <DocumentsPage configuration driveConnection={connection === "cancelled" || connection === "failed" ? connection : undefined} />;
}
