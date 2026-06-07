import { NextResponse } from "next/server";

import { createServiceSupabaseClient } from "@/lib/supabase";

export async function GET() {
  const supabase = createServiceSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
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
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    table: "trades",
    count: count ?? 0,
  });
}
