import { createTradeSchema } from "@/lib/validation";
import { jsonError, normalizePiUsername, requireAppUser } from "@/server/auth";
import { createNotification } from "@/server/notifications";
import {
  rateLimit,
  rateLimitProfiles,
  readJsonBody,
  secureJson,
} from "@/server/security";
import {
  getServiceClientOrThrow,
  insertTradeEvent,
  listTradesForUser,
} from "@/server/trades";

export async function GET(request: Request) {
  try {
    rateLimit(request, { key: "trades:get", ...rateLimitProfiles.read });
    const user = await requireAppUser(request);
    const payload = await listTradesForUser(user);

    return secureJson(payload);
  } catch (error) {
    return jsonError(error, 401);
  }
}

export async function POST(request: Request) {
  try {
    rateLimit(request, { key: "trades:post", ...rateLimitProfiles.write });
    const user = await requireAppUser(request);
    const parsed = createTradeSchema.safeParse(await readJsonBody(request));

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid trade form.");
    }

    const targetBuyerPiUsernames = parsed.data.targetBuyerPiUsernames;
    const normalizedSeller = normalizePiUsername(user.username);

    if (targetBuyerPiUsernames.includes(normalizedSeller)) {
      throw new Error("You cannot send a private offer to your own Pi username.");
    }

    const visibility =
      parsed.data.visibility === "private" && targetBuyerPiUsernames.length > 0
        ? "private"
        : "public";

    const supabase = getServiceClientOrThrow();
    const { data, error } = await supabase
      .from("trades")
      .insert({
        seller_user_id: user.id,
        seller_pi_username: normalizedSeller,
        buyer_user_id: null,
        title: parsed.data.title,
        description: parsed.data.description,
        amount_test_pi: parsed.data.amountTestPi,
        status: "Draft",
        visibility,
        target_buyer_pi_usernames: targetBuyerPiUsernames,
        location_label: parsed.data.locationLabel,
        location_area: parsed.data.locationArea || null,
        delivery_terms: parsed.data.deliveryTerms,
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Could not create trade.");
    }

    await insertTradeEvent(
      data.id as string,
      user.id,
      visibility === "private"
        ? "Private offer finalized"
        : "Seller posted public listing",
      visibility === "private"
        ? `Seller sent this private offer to @${targetBuyerPiUsernames[0]}.`
        : "Seller opened the listing for buyer interest.",
    );

    if (visibility === "private") {
      const { data: buyer } = await supabase
        .from("users")
        .select("id")
        .eq("pi_username", targetBuyerPiUsernames[0])
        .maybeSingle();

      await createNotification({
        userId: buyer?.id as string | undefined,
        tradeId: data.id as string,
        type: "private_offer",
        title: "Private trade request",
        body: `@${normalizedSeller} sent you a private PiScrow offer.`,
      });
    }

    const payload = await listTradesForUser(user);
    return secureJson(payload);
  } catch (error) {
    return jsonError(error);
  }
}
