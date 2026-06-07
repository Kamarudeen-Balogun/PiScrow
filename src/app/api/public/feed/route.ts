import { NextResponse } from "next/server";

import { jsonError } from "@/server/auth";
import { listPublicLedger } from "@/server/trades";

export async function GET() {
  try {
    return NextResponse.json(await listPublicLedger());
  } catch (error) {
    return jsonError(error, 500);
  }
}
