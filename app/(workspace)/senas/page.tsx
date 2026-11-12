import { DepositsPage } from "../../../components/deposits/deposits-page";

export default async function Page({ searchParams }: {
  searchParams: Promise<{ tab?: string; connection?: string }>;
}) {
  const { tab, connection } = await searchParams;
  return <DepositsPage
    initialTab={tab === "drive" ? "drive" : "deposits"}
    driveConnection={connection === "cancelled" || connection === "failed" ? connection : undefined}
  />;
}
