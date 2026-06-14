import { PiScrowApp } from "@/components/piscrow-app";

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{
    consent?: string;
    connect?: string;
    debug?: string;
    demo?: string;
    maintenance?: string;
  }>;
}) {
  const params = await searchParams;

  return (
    <PiScrowApp
      consentAction={params?.consent}
      connectAction={params?.connect}
      debugMode={params?.debug === "1"}
      allowDemo={params?.demo === "1"}
      forceMaintenance={params?.maintenance === "1"}
    />
  );
}
