import { createServiceSupabaseClient } from "@/lib/supabase";
import { secureJson } from "@/server/security";

export async function GET() {
  const supabase = createServiceSupabaseClient();

  if (!supabase) {
    return secureJson(
      {
        ok: false,
        error: "Supabase service client is not configured.",
      },
      { status: 500 },
    );
  }

  const { count, error } = await supabase
    .from("trades")
    .select("id", { count: "exact", head: true });

  if (error) {
    return secureJson(
      {
        ok: false,
        error: "Supabase health check failed.",
      },
      { status: 500 },
    );
  }

  return secureJson({
    ok: true,
    table: "trades",
    count: count ?? 0,
  });
}
