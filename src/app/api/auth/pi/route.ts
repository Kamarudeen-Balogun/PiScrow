import { NextResponse } from "next/server";

import { jsonError, requireAppUser } from "@/server/auth";

export async function POST(request: Request) {
  try {
    const user = await requireAppUser(request);

    return NextResponse.json({ user });
  } catch (error) {
    return jsonError(error, 401);
  }
}
