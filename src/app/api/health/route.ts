import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    app: "PiScrow",
    target: "Pi Testnet / Sandbox",
    ok: true,
  });
}
