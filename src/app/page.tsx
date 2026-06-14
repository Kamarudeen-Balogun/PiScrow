import { PiScrowApp } from "@/components/piscrow-app";

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{
    consent?: string;
    demo?: string;
    maintenance?: string;
  }>;
}) {
  const params = await searchParams;

  return (
    <PiScrowApp
      consentAction={params?.consent}
      allowDemo={params?.demo === "1"}
      forceMaintenance={params?.maintenance === "1"}
    />
  );
}
