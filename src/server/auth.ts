import { NextResponse } from "next/server";

import { verifyPiAccessToken } from "@/lib/pi-platform";
import { createServiceSupabaseClient } from "@/lib/supabase";
import type { PiUser } from "@/types/pi";

export type AppUser = PiUser & {
  id: string;
  isAdmin: boolean;
};

export function normalizePiUsername(username: string) {
  return username.trim().replace(/^@+/, "").toLowerCase();
}

export function getAdminUsernames() {
  return (process.env.PISCROW_ADMIN_PI_USERNAMES ?? "")
    .split(",")
    .map(normalizePiUsername)
    .filter(Boolean);
}

export function isAdminUsername(username: string) {
  return getAdminUsernames().includes(normalizePiUsername(username));
}

export function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? "";
}

export async function requireAppUser(request: Request): Promise<AppUser> {
  const accessToken = getBearerToken(request);

  if (!accessToken) {
    throw new Error("Missing Pi access token.");
  }

  const piUser = await verifyPiAccessToken(accessToken);
  const supabase = createServiceSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase service client is not configured.");
  }

  const normalizedUsername = normalizePiUsername(piUser.username);
  const { data, error } = await supabase
    .from("users")
    .upsert(
      {
        pi_uid: piUser.uid,
        pi_username: normalizedUsername,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "pi_uid" },
    )
    .select("id, pi_uid, pi_username")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not upsert PiScrow user.");
  }

  return {
    id: data.id as string,
    uid: data.pi_uid as string,
    username: data.pi_username as string,
    isAdmin: isAdminUsername(data.pi_username as string),
  };
}

export function jsonError(error: unknown, status = 400) {
  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : "Unexpected PiScrow error.",
    },
    { status },
  );
}
