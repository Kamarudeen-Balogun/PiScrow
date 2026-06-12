import { jsonError } from "@/server/auth";
import { rateLimit, rateLimitProfiles, secureJson } from "@/server/security";
import { listPublicLedger } from "@/server/trades";

type PublicLedgerResponse = Awaited<ReturnType<typeof listPublicLedger>> & {
  stale?: boolean;
  staleAt?: string;
};

let publicLedgerCache: PublicLedgerResponse | null = null;

export async function GET(request: Request) {
  try {
    await rateLimit(request, { key: "public-feed:get", ...rateLimitProfiles.read });
    const payload = await listPublicLedger();
    publicLedgerCache = payload;
    return secureJson(payload);
  } catch (error) {
    if (publicLedgerCache) {
      return secureJson(
        {
          ...publicLedgerCache,
          stale: true,
          staleAt: new Date().toISOString(),
        } satisfies PublicLedgerResponse,
      );
    }

    return jsonError(error, 500);
  }
}
