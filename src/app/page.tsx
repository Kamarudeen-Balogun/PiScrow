import { PiScrowApp } from "@/components/piscrow-app";

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ demo?: string }>;
}) {
  const params = await searchParams;

  return <PiScrowApp allowDemo={params?.demo === "1"} />;
}
