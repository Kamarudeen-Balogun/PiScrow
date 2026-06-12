import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { createNotification } from "@/server/notifications";
import { getCompletedPaymentForTrade } from "@/server/pi-payments";
import { addTradeChatSystemMessage, closeTradeChatRoom } from "@/server/trade-chat";
import {
  getServiceClientOrThrow,
  insertTradeEvent,
  type TradeRow,
} from "@/server/trades";
import { executeEscrowRelease, markEscrowReleaseFailed } from "@/server/escrow-release";
import type { AppUser } from "@/server/auth";
import type {
  Trade,
  TradeHandoffCodeStatus,
  TradeHandoffCodeSummary,
} from "@/types/trade";

const HANDOFF_CODE_BYTES = 16;
const HANDOFF_CODE_GROUP_SIZE = 4;
const HANDOFF_CODE_TTL_MS = 30 * 60 * 1000;
const HANDOFF_VERIFY_ATTEMPT_LIMIT = 6;
const HANDOFF_VERIFY_WINDOW_MS = 15 * 60 * 1000;

type TradeHandoffCodeRow = {
  id: string;
  trade_id: string;
  buyer_user_id: string;
  seller_user_id: string;
  code_hash: string;
  code_last4: string;
  expires_at: string;
  generated_at: string;
  last_revealed_at: string | null;
  reveal_count: number;
  verify_attempt_count: number;
  last_attempt_at: string | null;
  used_at: string | null;
  used_by_user_id: string | null;
  invalidated_at: string | null;
  invalidation_reason: string | null;
  created_at: string;
  updated_at: string;
};

type GenerateHandoffCodeResult = {
  code: string;
  summary: TradeHandoffCodeSummary;
};

function handoffCodeSecret() {
  const secret = process.env.PISCROW_HANDOFF_CODE_SECRET?.trim() || "";

  if (!secret) {
    throw new Error(
      "PISCROW_HANDOFF_CODE_SECRET is not configured. Add a strong server secret before using local handoff codes.",
    );
  }

  return secret;
}

function normalizeCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, "");
}

function formatCode(raw: string) {
  return raw.match(/.{1,4}/g)?.join("-") ?? raw;
}

function generateRawCode() {
  return randomBytes(HANDOFF_CODE_BYTES).toString("base64url").replace(/[^A-Z2-7]/gi, "").toUpperCase().slice(0, 20);
}

function hashCode(code: string) {
  return createHash("sha256")
    .update(`${handoffCodeSecret()}:${normalizeCode(code)}`)
    .digest("base64url");
}

function compareCode(candidate: string, expectedHash: string) {
  const candidateHash = hashCode(candidate);
  const left = Buffer.from(candidateHash);
  const right = Buffer.from(expectedHash);

  return left.length === right.length && timingSafeEqual(left, right);
}

function mapStatus(row: TradeHandoffCodeRow): TradeHandoffCodeStatus {
  if (row.used_at) {
    return "used";
  }

  if (row.invalidated_at) {
    return "invalidated";
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return "expired";
  }

  return "active";
}

export function mapTradeHandoffCodeSummary(
  row: TradeHandoffCodeRow | null | undefined,
): TradeHandoffCodeSummary | undefined {
  if (!row) {
    return undefined;
  }

  return {
    status: mapStatus(row),
    codeLast4: row.code_last4,
    maskedCode: `••••-••••-••••-••••-${row.code_last4}`,
    generatedAt: row.generated_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at ?? undefined,
    invalidatedAt: row.invalidated_at ?? undefined,
    invalidationReason: row.invalidation_reason ?? undefined,
  };
}

async function getHandoffCodeRow(tradeId: string) {
  const supabase = getServiceClientOrThrow();
  const { data, error } = await supabase
    .from("trade_handoff_codes")
    .select("*")
    .eq("trade_id", tradeId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as TradeHandoffCodeRow | null) ?? null;
}

function assertHandoffTradeEligible(trade: TradeRow) {
  if (trade.status !== "Funded") {
    throw new Error("Handoff codes are available only while the trade is funded and undisputed.");
  }

  if (!trade.buyer_user_id || !trade.seller_user_id) {
    throw new Error("Both buyer and seller must be assigned before generating a handoff code.");
  }
}

async function assertEscrowFundingReady(trade: TradeRow) {
  const payment = await getCompletedPaymentForTrade(trade.id);

  if (!payment) {
    throw new Error("Buyer funding must complete before handoff codes can be used.");
  }
}

export async function getTradeHandoffSummary(tradeId: string) {
  return mapTradeHandoffCodeSummary(await getHandoffCodeRow(tradeId));
}

export async function generateTradeHandoffCode(
  trade: TradeRow,
  user: AppUser,
): Promise<GenerateHandoffCodeResult> {
  assertHandoffTradeEligible(trade);

  if (trade.buyer_user_id !== user.id) {
    throw new Error("Only the buyer can generate a handoff code.");
  }

  await assertEscrowFundingReady(trade);

  const supabase = getServiceClientOrThrow();
  const now = new Date().toISOString();
  const rawCode = generateRawCode();
  const formattedCode = formatCode(rawCode);
  const expiresAt = new Date(Date.now() + HANDOFF_CODE_TTL_MS).toISOString();
  const existing = await getHandoffCodeRow(trade.id);

  if (existing && !existing.used_at && !existing.invalidated_at) {
    await supabase
      .from("trade_handoff_codes")
      .update({
        invalidated_at: now,
        invalidation_reason: "rotated",
        updated_at: now,
      })
      .eq("id", existing.id);

    await insertTradeEvent(
      trade.id,
      user.id,
      "Handoff code rotated",
      "Buyer generated a new one-time handoff code and revoked the previous code.",
    );
  }

  const payload = {
    trade_id: trade.id,
    buyer_user_id: trade.buyer_user_id,
    seller_user_id: trade.seller_user_id,
    code_hash: hashCode(formattedCode),
    code_last4: formattedCode.slice(-4),
    expires_at: expiresAt,
    generated_at: now,
    last_revealed_at: now,
    reveal_count: 1,
    verify_attempt_count: 0,
    last_attempt_at: null,
    used_at: null,
    used_by_user_id: null,
    invalidated_at: null,
    invalidation_reason: null,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("trade_handoff_codes")
    .upsert(payload, { onConflict: "trade_id" })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not create the handoff code.");
  }

  await insertTradeEvent(
    trade.id,
    user.id,
    "Handoff code generated",
    "Buyer generated a one-time local handoff code.",
    { expiresAt },
  );
  await addTradeChatSystemMessage(
    trade,
    `Buyer @${user.username} generated a one-time handoff code for local delivery verification.`,
  );
  await createNotification({
    userId: trade.seller_user_id,
    tradeId: trade.id,
    type: "handoff_code_ready",
    title: "Buyer generated handoff code",
    body: "The buyer generated a one-time handoff code. Meet and verify it to release escrow automatically.",
  });

  const row = data as TradeHandoffCodeRow;

  return {
    code: formattedCode,
    summary: mapTradeHandoffCodeSummary(row)!,
  };
}

export async function revealTradeHandoffCode(trade: TradeRow, user: AppUser) {
  assertHandoffTradeEligible(trade);

  if (trade.buyer_user_id !== user.id) {
    throw new Error("Only the buyer can reveal this handoff code.");
  }

  const supabase = getServiceClientOrThrow();
  const row = await getHandoffCodeRow(trade.id);

  if (!row) {
    throw new Error("Generate a handoff code first.");
  }

  if (mapStatus(row) !== "active") {
    throw new Error("This handoff code is no longer active.");
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("trade_handoff_codes")
    .update({
      last_revealed_at: now,
      reveal_count: row.reveal_count + 1,
      updated_at: now,
    })
    .eq("id", row.id);

  if (error) {
    throw new Error(error.message);
  }

  await insertTradeEvent(
    trade.id,
    user.id,
    "Handoff code revealed",
    "Buyer opened the active handoff code for local exchange.",
  );

  return mapTradeHandoffCodeSummary({
    ...row,
    last_revealed_at: now,
    reveal_count: row.reveal_count + 1,
    updated_at: now,
  });
}

function assertVerifyBudget(row: TradeHandoffCodeRow) {
  if (row.verify_attempt_count < HANDOFF_VERIFY_ATTEMPT_LIMIT) {
    return;
  }

  const lastAttemptAt = row.last_attempt_at ? new Date(row.last_attempt_at).getTime() : 0;

  if (Date.now() - lastAttemptAt < HANDOFF_VERIFY_WINDOW_MS) {
    throw new Error("Too many handoff code attempts. Wait before trying again.");
  }
}

export async function invalidateTradeHandoffCode(
  tradeId: string,
  reason: string,
  actorUserId?: string | null,
) {
  const supabase = getServiceClientOrThrow();
  const row = await getHandoffCodeRow(tradeId);

  if (!row || row.used_at || row.invalidated_at) {
    return;
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("trade_handoff_codes")
    .update({
      invalidated_at: now,
      invalidation_reason: reason.slice(0, 200),
      updated_at: now,
    })
    .eq("id", row.id);

  if (error) {
    throw new Error(error.message);
  }

  await insertTradeEvent(
    tradeId,
    actorUserId ?? null,
    "Handoff code invalidated",
    `Local handoff code was invalidated: ${reason}.`,
  );
}

export async function verifyTradeHandoffCode({
  code,
  trade,
  user,
}: {
  code: string;
  trade: TradeRow;
  user: AppUser;
}) {
  assertHandoffTradeEligible(trade);

  if (trade.seller_user_id !== user.id) {
    throw new Error("Only the seller can verify the buyer handoff code.");
  }

  await assertEscrowFundingReady(trade);

  const supabase = getServiceClientOrThrow();
  const row = await getHandoffCodeRow(trade.id);

  if (!row) {
    throw new Error("The buyer has not generated a handoff code yet.");
  }

  if (row.seller_user_id !== user.id || row.buyer_user_id !== trade.buyer_user_id) {
    throw new Error("This handoff code no longer matches the current trade participants.");
  }

  const status = mapStatus(row);

  if (status === "used") {
    throw new Error("This handoff code has already been used.");
  }

  if (status === "invalidated" || status === "expired") {
    throw new Error("This handoff code is no longer active.");
  }

  assertVerifyBudget(row);

  const now = new Date().toISOString();

  if (!compareCode(code, row.code_hash)) {
    const { error: attemptError } = await supabase
      .from("trade_handoff_codes")
      .update({
        verify_attempt_count: row.verify_attempt_count + 1,
        last_attempt_at: now,
        updated_at: now,
      })
      .eq("id", row.id);

    if (attemptError) {
      throw new Error(attemptError.message);
    }

    await insertTradeEvent(
      trade.id,
      user.id,
      "Handoff code verification failed",
      "Seller entered an invalid handoff code.",
    );
    throw new Error("That handoff code is invalid.");
  }

  const { error: usedError } = await supabase
    .from("trade_handoff_codes")
    .update({
      verify_attempt_count: row.verify_attempt_count + 1,
      last_attempt_at: now,
      used_at: now,
      used_by_user_id: user.id,
      updated_at: now,
    })
    .eq("id", row.id)
    .is("used_at", null)
    .is("invalidated_at", null);

  if (usedError) {
    throw new Error(usedError.message);
  }

  let releaseResult: Awaited<ReturnType<typeof executeEscrowRelease>>;

  try {
    releaseResult = await executeEscrowRelease({
      actor: user,
      notes: "Local handoff code verified by seller. PiScrow released escrow automatically.",
      releaseType: "seller_release",
      trade,
    });
  } catch (error) {
    await markEscrowReleaseFailed({
      tradeId: trade.id,
      releaseType: "seller_release",
      failure: error instanceof Error ? error.message : "Automatic seller release failed after handoff code verification.",
    }).catch(() => undefined);
    throw error;
  }

  const { error: tradeError } = await supabase
    .from("trades")
    .update({
      status: "Completed",
      completed_at: now,
      updated_at: now,
    })
    .eq("id", trade.id)
    .eq("status", "Funded");

  if (tradeError) {
    throw new Error(tradeError.message);
  }

  await insertTradeEvent(
    trade.id,
    user.id,
    "Handoff code verified",
    "Seller verified the buyer handoff code and PiScrow released escrow automatically.",
    {
      releasePiPaymentId:
        "releasePiPaymentId" in releaseResult
          ? releaseResult.releasePiPaymentId
          : releaseResult.payment.release_pi_payment_id,
      releaseTxid: releaseResult.releaseTxid,
    },
  );
  await addTradeChatSystemMessage(
    { ...trade, status: "Completed", completed_at: now, updated_at: now },
    `Seller @${user.username} verified the buyer handoff code. PiScrow released escrow automatically and marked this trade complete.`,
  );
  await closeTradeChatRoom(
    { ...trade, status: "Completed", completed_at: now, updated_at: now },
    "Local handoff verification completed. Chat is now read-only for seven days of record keeping.",
  );
  await Promise.all([
    createNotification({
      userId: trade.buyer_user_id,
      tradeId: trade.id,
      type: "handoff_code_verified",
      title: "Trade completed",
      body: "Your handoff code was verified and PiScrow released escrow to the seller.",
    }),
    createNotification({
      userId: trade.seller_user_id,
      tradeId: trade.id,
      type: "handoff_code_verified",
      title: "Escrow released",
      body: "Handoff code verified. PiScrow released escrow and completed the trade.",
    }),
  ]);

  return releaseResult;
}

export function mapTradeWithHandoffCode(
  trade: Trade,
  row: TradeHandoffCodeRow | null | undefined,
): Trade {
  return {
    ...trade,
    handoffCode: mapTradeHandoffCodeSummary(row),
  };
}
