import { secureJson } from "@/server/security";

export function GET() {
  return secureJson({
    app: "PiScrow",
    target: "Pi Testnet / Sandbox",
    ok: true,
  });
}
