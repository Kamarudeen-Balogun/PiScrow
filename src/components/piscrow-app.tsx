"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Eye,
  FileWarning,
  HandCoins,
  History,
  LockKeyhole,
  Megaphone,
  Plus,
  RefreshCcw,
  Send,
  ShieldCheck,
  LoaderCircle,
  Store,
  Trash2,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import {
  demoEvents,
  demoInterests,
  demoTrades,
  demoUser,
} from "@/lib/demo-data";
import {
  calculateBuyerTotal,
  calculatePlatformFee,
  calculateSellerReceivable,
  feePercentLabel,
} from "@/lib/fees";
import { formatTestPi, tradeVisibilityLabels } from "@/lib/trade-state";
import {
  createTradeInterestSchema,
  createTradeSchema,
  confirmReceiptSchema,
  deliveryProofSchema,
  disputeSchema,
} from "@/lib/validation";
import type { PiUser } from "@/types/pi";
import type { Trade, TradeEvent, TradeInterest, TradeStatus } from "@/types/trade";

type ViewMode = "market" | "sell" | "ledger" | "admin";
type SessionUser = PiUser & {
  id?: string;
  isAdmin?: boolean;
};

type TradePayload = {
  trades: Trade[];
  interests: TradeInterest[];
  events: TradeEvent[];
};

type AppNotice = {
  id: string;
  title: string;
  body: string;
  tone: "info" | "success" | "warning";
};

type SavedNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt?: string;
  createdAt: string;
};

const nextPublicSandbox =
  process.env.NEXT_PUBLIC_PI_SANDBOX === undefined
    ? true
    : process.env.NEXT_PUBLIC_PI_SANDBOX === "true";

const viewMeta: Record<
  ViewMode,
  { label: string; description: string; icon: typeof Store }
> = {
  market: {
    label: "Buyer",
    description: "Browse seller offers, submit interest, and fund selected trades.",
    icon: Store,
  },
  sell: {
    label: "Seller",
    description: "Post offers, compare buyer responses, and manage delivery.",
    icon: Megaphone,
  },
  ledger: {
    label: "Ledger",
    description: "Transparent trade activity across PiScrow testnet.",
    icon: History,
  },
  admin: {
    label: "Admin",
    description: "Resolve disputed trades from approved Pi usernames.",
    icon: LockKeyhole,
  },
};

function createEvent(
  tradeId: string,
  actor: string,
  eventType: string,
  notes: string,
): TradeEvent {
  return {
    id: `event-${crypto.randomUUID()}`,
    tradeId,
    actor,
    eventType,
    notes,
    createdAt: new Date().toISOString(),
  };
}

function normalizeUsername(username: string) {
  return username.trim().replace(/^@+/, "").toLowerCase();
}

function isTerminal(status: TradeStatus) {
  return status === "Completed" || status === "Cancelled";
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function PiScrowApp({ allowDemo = false }: { allowDemo?: boolean }) {
  const [user, setUser] = useState<SessionUser | null>(
    allowDemo ? { ...demoUser, isAdmin: true } : null,
  );
  const [piConnected, setPiConnected] = useState(false);
  const [piAccessToken, setPiAccessToken] = useState("");
  const [authState, setAuthState] = useState(
    allowDemo
      ? "Local demo mode is active. Use Pi Browser for real-user testing."
      : "Connect with Pi Browser to start using PiScrow.",
  );
  const [mode, setMode] = useState<ViewMode>("market");
  const [trades, setTrades] = useState<Trade[]>(allowDemo ? demoTrades : []);
  const [interests, setInterests] = useState<TradeInterest[]>(
    allowDemo ? demoInterests : [],
  );
  const [events, setEvents] = useState<TradeEvent[]>(allowDemo ? demoEvents : []);
  const [ledgerTrades, setLedgerTrades] = useState<Trade[]>(
    allowDemo ? demoTrades : [],
  );
  const [ledgerEvents, setLedgerEvents] = useState<TradeEvent[]>(
    allowDemo ? demoEvents : [],
  );
  const [selectedTradeId, setSelectedTradeId] = useState(
    allowDemo ? (demoTrades[0]?.id ?? "") : "",
  );
  const [expandedTradeId, setExpandedTradeId] = useState(
    allowDemo ? (demoTrades[0]?.id ?? "") : "",
  );
  const [formError, setFormError] = useState("");
  const [paymentState, setPaymentState] = useState("No payment started.");
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [notices, setNotices] = useState<AppNotice[]>([]);
  const [sellerFormResetKey, setSellerFormResetKey] = useState(0);
  const [connectingPi, setConnectingPi] = useState(false);

  const signedIn = Boolean(user);
  const normalizedUsername = normalizeUsername(user?.username ?? "");
  const navItems: ViewMode[] = user?.isAdmin
    ? ["market", "sell", "ledger", "admin"]
    : ["market", "sell", "ledger"];
  const activeMode: ViewMode = mode === "admin" && !user?.isAdmin ? "market" : mode;

  const selectedTrade =
    trades.find((trade) => trade.id === selectedTradeId) ??
    trades.find((trade) => trade.id === expandedTradeId) ??
    trades[0];

  const sellerTrades = useMemo(
    () =>
      trades.filter(
        (trade) =>
          trade.status !== "Cancelled" &&
          normalizeUsername(trade.sellerPiUsername) === normalizedUsername,
      ),
    [normalizedUsername, trades],
  );

  const buyerTrades = useMemo(
    () =>
      trades.filter((trade) => {
        if (!user) {
          return false;
        }

        if (trade.status === "Cancelled") {
          return false;
        }

        if (trade.visibility === "public") {
          return true;
        }

        return trade.targetBuyerPiUsernames.includes(normalizedUsername);
      }),
    [normalizedUsername, trades, user],
  );

  const adminTrades = useMemo(
    () => trades.filter((trade) => trade.status === "Disputed"),
    [trades],
  );

  const activeValue = trades
    .filter((trade) => !isTerminal(trade.status))
    .reduce((total, trade) => total + trade.amountTestPi, 0);

  function changeMode(nextMode: ViewMode) {
    if (nextMode === "admin" && !user?.isAdmin) {
      setMode("market");
      return;
    }

    setMode(nextMode);

    if (nextMode === "ledger") {
      void refreshPublicLedger();
    }
  }

  function applyTradePayload(payload: Partial<TradePayload>) {
    if (payload.trades) {
      setTrades(payload.trades);
      setSelectedTradeId((current) => {
        if (current && payload.trades?.some((trade) => trade.id === current)) {
          return current;
        }

        return payload.trades?.[0]?.id ?? "";
      });
    }

    if (payload.interests) {
      setInterests(payload.interests);
    }

    if (payload.events) {
      setEvents(payload.events);
    }
  }

  function pushNotice(
    title: string,
    body: string,
    tone: AppNotice["tone"] = "info",
  ) {
    setNotices((current) => [
      { id: `notice-${crypto.randomUUID()}`, title, body, tone },
      ...current,
    ].slice(0, 6));
  }

  function friendlyPiError(error: unknown) {
    const message =
      error instanceof Error ? error.message : "Pi account connection failed.";
    const lowerMessage = message.toLowerCase();

    if (
      lowerMessage.includes("not initialized") ||
      lowerMessage.includes("call init")
    ) {
      return "Pi Browser did not finish preparing the Pi SDK. Refresh this page inside Pi Browser and try again.";
    }

    if (
      lowerMessage.includes("not in pi browser") ||
      lowerMessage.includes("open this app inside pi browser")
    ) {
      return "Open PiScrow inside Pi Browser to connect your Pi account.";
    }

    if (lowerMessage.includes("access token")) {
      return "Pi Browser connected your username but did not return a valid access token. Try connecting again.";
    }

    return message;
  }

  function mergeSavedNotifications(saved: SavedNotification[]) {
    setNotices((current) => {
      const existingIds = new Set(current.map((notice) => notice.id));
      const incoming = saved
        .filter((notice) => !existingIds.has(notice.id))
        .map((notice) => ({
          id: notice.id,
          title: notice.title,
          body: notice.body,
          tone:
            notice.type.includes("dispute") || notice.type.includes("cancelled")
              ? ("warning" as const)
              : notice.type.includes("selected") ||
                  notice.type.includes("funded") ||
                  notice.type.includes("confirmed") ||
                  notice.type.includes("resolved")
                ? ("success" as const)
                : ("info" as const),
        }));

      return [...incoming, ...current].slice(0, 6);
    });
  }

  function appendEvent(
    tradeId: string,
    eventType: string,
    notes: string,
    actor = user?.username ?? "demo_actor",
  ) {
    setEvents((current) => [
      createEvent(tradeId, actor, eventType, notes),
      ...current,
    ]);
  }

  function updateTrade(
    tradeId: string,
    status: TradeStatus,
    patch: Partial<Trade> = {},
  ) {
    setTrades((current) =>
      current.map((trade) =>
        trade.id === tradeId
          ? { ...trade, ...patch, status, updatedAt: new Date().toISOString() }
          : trade,
      ),
    );
  }

  async function connectPi() {
    setFormError("");
    setConnectingPi(true);
    setAuthState("Connecting to Pi Browser...");

    if (!window.Pi) {
      const message = "Open this app inside Pi Browser to connect a Pi account.";
      setAuthState(message);
      pushNotice("Pi Browser required", message, "warning");
      setConnectingPi(false);
      return;
    }

    try {
      window.Pi.init({ version: "2.0", sandbox: nextPublicSandbox });
      const authResult = await window.Pi.authenticate(["username", "payments"], () => {
        setPaymentState(
          "An unfinished Pi payment was found. Finish or cancel it in Pi Browser, then refresh PiScrow.",
        );
      });
      const piUser = "user" in authResult ? authResult.user : authResult;
      const accessToken = "accessToken" in authResult ? authResult.accessToken : "";

      setPiAccessToken(accessToken);
      setPiConnected(Boolean(accessToken));

      if (!accessToken) {
        setUser(null);
        setAuthState(
          `Connected as @${piUser.username}, but Pi Browser did not return an access token.`,
        );
        return;
      }

      const session = await apiRequest<{ user: SessionUser }>("/api/auth/pi", accessToken, {
        method: "POST",
      });
      setUser(session.user);
      setMode("market");
      setAuthState(`Signed in as @${session.user.username}.`);

      const payload = await apiRequest<TradePayload>("/api/trades", accessToken);
      applyTradePayload(payload);
      const notificationPayload = await apiRequest<{
        notifications: SavedNotification[];
      }>("/api/notifications", accessToken);
      mergeSavedNotifications(notificationPayload.notifications);
      pushNotice("Pi account connected", "Your PiScrow workspace is ready.", "success");
    } catch (error) {
      setPiConnected(false);
      setPiAccessToken("");
      setUser(allowDemo ? { ...demoUser, isAdmin: true } : null);
      const message = friendlyPiError(error);
      setAuthState(message);
      pushNotice("Connection failed", message, "warning");
    } finally {
      setConnectingPi(false);
    }
  }

  async function refreshPublicLedger() {
    setLedgerLoading(true);
    setFormError("");

    if (allowDemo) {
      setLedgerTrades(trades);
      setLedgerEvents(events);
      setLedgerLoading(false);
      return;
    }

    try {
      const payload = await fetch("/api/public/feed").then((response) => {
        if (!response.ok) {
          throw new Error("Could not load public ledger.");
        }

        return response.json() as Promise<Pick<TradePayload, "trades" | "events">>;
      });
      setLedgerTrades(payload.trades);
      setLedgerEvents(payload.events);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not load ledger.");
    } finally {
      setLedgerLoading(false);
    }
  }

  function createTrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (!user) {
      setFormError("Connect your Pi account before posting an offer.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const parsed = createTradeSchema.safeParse({
      title: formData.get("title"),
      amountTestPi: formData.get("amountTestPi"),
      description: formData.get("description"),
      locationLabel: formData.get("locationLabel"),
      locationArea: formData.get("locationArea"),
      deliveryTerms: formData.get("deliveryTerms"),
      visibility: formData.get("visibility"),
      targetBuyerPiUsernames: formData.get("targetBuyerPiUsernames") ?? "",
    });

    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Offer form is invalid.");
      return;
    }

    if (parsed.data.visibility === "private" && parsed.data.targetBuyerPiUsernames.length === 0) {
      setFormError("Private offers need at least one buyer Pi username.");
      return;
    }

    if (parsed.data.targetBuyerPiUsernames.includes(normalizedUsername)) {
      setFormError("You cannot send a private offer to your own Pi username.");
      return;
    }

    if (piConnected && piAccessToken) {
      void apiRequest<TradePayload>("/api/trades", piAccessToken, {
        method: "POST",
        body: JSON.stringify(parsed.data),
      })
        .then(applyTradePayload)
        .then(() => {
          form.reset();
          setSellerFormResetKey((current) => current + 1);
          setMode("sell");
          pushNotice("Offer posted", "Your seller offer is now live.");
        })
        .catch((error) => {
          setFormError(
            error instanceof Error ? error.message : "Could not post offer.",
          );
        });
      return;
    }

    const now = new Date().toISOString();
    const visibility =
      parsed.data.visibility === "private" &&
      parsed.data.targetBuyerPiUsernames.length > 0
        ? "private"
        : "public";
    const trade: Trade = {
      id: `trade-${crypto.randomUUID()}`,
      sellerUserId: user.uid,
      sellerPiUsername: normalizeUsername(user.username),
      visibility,
      targetBuyerPiUsernames:
        visibility === "private" ? parsed.data.targetBuyerPiUsernames : [],
      title: parsed.data.title,
      description: parsed.data.description,
      amountTestPi: parsed.data.amountTestPi,
      status: "Draft",
      locationLabel: parsed.data.locationLabel,
      locationArea: parsed.data.locationArea || undefined,
      deliveryTerms: parsed.data.deliveryTerms,
      interestCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    setTrades((current) => [trade, ...current]);
    setSelectedTradeId(trade.id);
    setExpandedTradeId(trade.id);
    appendEvent(
      trade.id,
      visibility === "private"
        ? "Private offer finalized"
        : "Seller posted public listing",
      visibility === "private"
        ? `Seller sent this private offer to @${trade.targetBuyerPiUsernames[0]}.`
        : "Seller opened the listing for buyer interest.",
    );
    pushNotice("Offer posted", "Your seller offer is now live.");
    form.reset();
    setSellerFormResetKey((current) => current + 1);
  }

  function submitInterest(trade: Trade, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (!user) {
      setFormError("Connect your Pi account before showing interest.");
      return;
    }

    if (normalizeUsername(trade.sellerPiUsername) === normalizedUsername) {
      setFormError("You can view your seller offer here, but you cannot buy it.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const parsed = createTradeInterestSchema.safeParse({
      tradeId: trade.id,
      responseNote: formData.get("responseNote"),
    });

    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Interest form is invalid.");
      return;
    }

    if (piConnected && piAccessToken) {
      void apiRequest<TradePayload>(
        `/api/trades/${trade.id}/interests`,
        piAccessToken,
        {
          method: "POST",
          body: JSON.stringify(parsed.data),
        },
      )
        .then(applyTradePayload)
        .then(() => {
          form.reset();
          pushNotice("Interest sent", "The seller can now review your response.");
        })
        .catch((error) => {
          setFormError(
            error instanceof Error ? error.message : "Could not submit interest.",
          );
        });
      return;
    }

    const now = new Date().toISOString();
    const interest: TradeInterest = {
      id: `interest-${crypto.randomUUID()}`,
      tradeId: trade.id,
      buyerUserId: user.uid,
      buyerPiUsername: normalizeUsername(user.username),
      responseNote: parsed.data.responseNote,
      status: "Open",
      createdAt: now,
      updatedAt: now,
    };

    setInterests((current) => [interest, ...current]);
    setTrades((current) =>
      current.map((item) =>
        item.id === trade.id
          ? { ...item, interestCount: (item.interestCount ?? 0) + 1 }
          : item,
      ),
    );
    appendEvent(
      trade.id,
      "Interest submitted",
      `Buyer @${interest.buyerPiUsername} submitted interest for this listing.`,
    );
    pushNotice("Interest sent", "The seller can now review your response.");
    form.reset();
  }

  function declinePrivateOffer(trade: Trade) {
    setFormError("");

    if (!user) {
      setFormError("Connect your Pi account before declining a private request.");
      return;
    }

    if (
      trade.visibility !== "private" ||
      !trade.targetBuyerPiUsernames.includes(normalizedUsername)
    ) {
      setFormError("This private offer is not assigned to your Pi username.");
      return;
    }

    if (piConnected && piAccessToken) {
      void apiRequest<TradePayload>(
        `/api/trades/${trade.id}/decline-private`,
        piAccessToken,
        { method: "POST" },
      )
        .then(applyTradePayload)
        .then(() => {
          pushNotice(
            "Private request declined",
            "The seller can see the decline in the trade activity log.",
            "warning",
          );
        })
        .catch((error) => {
          setFormError(
            error instanceof Error
              ? error.message
              : "Could not decline private offer.",
          );
        });
      return;
    }

    setTrades((current) =>
      current.map((item) =>
        item.id === trade.id
          ? {
              ...item,
              targetBuyerPiUsernames: item.targetBuyerPiUsernames.filter(
                (username) => username !== normalizedUsername,
              ),
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    );
    appendEvent(
      trade.id,
      "Private offer declined",
      `@${normalizedUsername} declined the private offer.`,
    );
    pushNotice(
      "Private request declined",
      "The seller can see the decline in the trade activity log.",
      "warning",
    );
  }

  function selectInterest(trade: Trade, interest: TradeInterest) {
    setFormError("");

    if (piConnected && piAccessToken) {
      void apiRequest<TradePayload>(
        `/api/trades/${trade.id}/select-interest`,
        piAccessToken,
        {
          method: "POST",
          body: JSON.stringify({ interestId: interest.id }),
        },
      )
        .then(applyTradePayload)
        .then(() => {
          pushNotice(
            "Buyer selected",
            `@${interest.buyerPiUsername} can now fund the trade.`,
            "success",
          );
        })
        .catch((error) => {
          setFormError(
            error instanceof Error ? error.message : "Could not select buyer.",
          );
        });
      return;
    }

    updateTrade(trade.id, "PendingFunding", {
      buyerUserId: interest.buyerUserId,
      buyerPiUsername: interest.buyerPiUsername,
      selectedInterestId: interest.id,
    });
    setSelectedTradeId(trade.id);
    setExpandedTradeId(trade.id);
    setInterests((current) =>
      current.map((item) => {
        if (item.id === interest.id) {
          return { ...item, status: "Selected", updatedAt: new Date().toISOString() };
        }

        if (item.tradeId === trade.id && item.status === "Open") {
          return { ...item, status: "Declined", updatedAt: new Date().toISOString() };
        }

        return item;
      }),
    );
    appendEvent(
      trade.id,
      "Buyer selected",
      `Seller selected @${interest.buyerPiUsername} and moved the trade to funding.`,
    );
    pushNotice(
      "Buyer selected",
      `@${interest.buyerPiUsername} can now fund the trade.`,
      "success",
    );
  }

  function deleteOffer(trade: Trade) {
    setFormError("");

    if (piConnected && piAccessToken) {
      void apiRequest<TradePayload>(
        `/api/trades/${trade.id}/delete`,
        piAccessToken,
        { method: "POST" },
      )
        .then(applyTradePayload)
        .then(() => {
          pushNotice("Offer deleted", "The open seller offer was removed.", "warning");
        })
        .catch((error) => {
          setFormError(
            error instanceof Error ? error.message : "Could not delete offer.",
          );
        });
      return;
    }

    updateTrade(trade.id, "Cancelled");
    appendEvent(
      trade.id,
      "Offer deleted",
      "Seller removed the open offer before selecting a buyer.",
    );
    pushNotice("Offer deleted", "The open seller offer was removed.", "warning");
  }

  function fundTrade(trade: Trade) {
    setPaymentState("Preparing Test Pi payment...");
    const buyerTotal = calculateBuyerTotal(trade.amountTestPi);

    if (allowDemo && (!window.Pi || !piConnected)) {
      updateTrade(trade.id, "Funded");
      appendEvent(
        trade.id,
        "Payment completed",
        `Demo marked ${formatTestPi(buyerTotal)} buyer funding as complete.`,
      );
      setPaymentState("Demo funding complete. Pi Browser auth not active.");
      pushNotice(
        "Trade funded",
        "The buyer payment is now held for seller delivery proof.",
        "success",
      );
      return;
    }

    if (!window.Pi || !piConnected || !piAccessToken) {
      setPaymentState("Connect with Pi Browser before funding a real trade.");
      return;
    }

    window.Pi.createPayment(
      {
        amount: buyerTotal,
        memo: `PiScrow funding for ${trade.title}`,
        metadata: {
          tradeId: trade.id,
          app: "PiScrow",
          mode: "testnet",
          platformFeeTestPi: calculatePlatformFee(trade.amountTestPi),
        },
      },
      {
        onReadyForServerApproval: async (paymentId) => {
          setPaymentState("Payment is waiting for PiScrow approval.");
          await apiRequest(`/api/pi/approve`, piAccessToken, {
            method: "POST",
            body: JSON.stringify({ paymentId, tradeId: trade.id }),
          });
        },
        onReadyForServerCompletion: async (paymentId, txid) => {
          setPaymentState("Finalizing Test Pi payment...");
          const payload = await apiRequest<
            (TradePayload & { mode?: string }) | { mode: string }
          >(`/api/pi/complete`, piAccessToken, {
            method: "POST",
            body: JSON.stringify({ paymentId, tradeId: trade.id, txid }),
          });

          if ("trades" in payload) {
            applyTradePayload(payload);
          }

          setPaymentState("Test Pi payment completed.");
          pushNotice(
            "Trade funded",
            "The buyer payment is now held for seller delivery proof.",
            "success",
          );
        },
        onCancel: () => {
          setPaymentState("Payment was cancelled.");
          pushNotice("Payment cancelled", "No escrow funding was completed.", "warning");
        },
        onError: (error) => {
          setPaymentState(error.message);
          pushNotice("Payment error", error.message, "warning");
        },
      },
    );
  }

  function submitDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (!selectedTrade) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const parsed = deliveryProofSchema.safeParse({
      tradeId: selectedTrade.id,
      deliveryProofNote: formData.get("deliveryProofNote"),
      deliveryProofUrl: formData.get("deliveryProofUrl"),
      deliveryProofImagePath: "",
    });

    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Delivery proof failed.");
      return;
    }

    if (piConnected && piAccessToken) {
      void apiRequest<TradePayload>(
        `/api/trades/${selectedTrade.id}/delivery`,
        piAccessToken,
        {
          method: "POST",
          body: formData,
        },
      )
        .then(applyTradePayload)
        .then(() => {
          form.reset();
          pushNotice(
            "Package proof submitted",
            "The buyer can now review and confirm receipt.",
            "success",
          );
        })
        .catch((error) => {
          setFormError(
            error instanceof Error ? error.message : "Could not submit proof.",
          );
        });
      return;
    }

    updateTrade(selectedTrade.id, "DeliverySubmitted", {
      deliveryProofNote: parsed.data.deliveryProofNote,
      deliveryProofUrl: parsed.data.deliveryProofUrl || undefined,
    });
    appendEvent(selectedTrade.id, "Delivery submitted", parsed.data.deliveryProofNote);
    pushNotice(
      "Package proof submitted",
      "The buyer can now review and confirm receipt.",
      "success",
    );
    form.reset();
  }

  function confirmReceipt(trade: Trade, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const parsed = confirmReceiptSchema.safeParse({
      tradeId: trade.id,
      buyerReceiptNote: formData.get("buyerReceiptNote"),
      buyerReceiptProofUrl: formData.get("buyerReceiptProofUrl"),
      buyerReceiptImagePath: "",
    });

    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Receipt form failed.");
      return;
    }

    if (piConnected && piAccessToken) {
      void apiRequest<TradePayload>(`/api/trades/${trade.id}/confirm`, piAccessToken, {
        method: "POST",
        body: formData,
      })
        .then(applyTradePayload)
        .then(() => {
          form.reset();
          pushNotice("Receipt confirmed", "The trade is marked completed.", "success");
        })
        .catch((error) => {
          setFormError(
            error instanceof Error ? error.message : "Could not confirm receipt.",
          );
        });
      return;
    }

    updateTrade(trade.id, "Completed", {
      buyerReceiptNote: parsed.data.buyerReceiptNote,
      buyerReceiptProofUrl: parsed.data.buyerReceiptProofUrl || undefined,
    });
    appendEvent(trade.id, "Receipt confirmed", parsed.data.buyerReceiptNote);
    pushNotice("Receipt confirmed", "The trade is marked completed.", "success");
    form.reset();
  }

  function openDispute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (!selectedTrade) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const parsed = disputeSchema.safeParse({
      tradeId: selectedTrade.id,
      reason: formData.get("reason"),
      evidenceNote: formData.get("evidenceNote"),
    });

    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Dispute form failed.");
      return;
    }

    if (piConnected && piAccessToken) {
      void apiRequest<TradePayload>(
        `/api/trades/${selectedTrade.id}/dispute`,
        piAccessToken,
        {
          method: "POST",
          body: JSON.stringify(parsed.data),
        },
      )
        .then(applyTradePayload)
        .then(() => {
          form.reset();
          pushNotice(
            "Dispute opened",
            "The trade is frozen for admin review.",
            "warning",
          );
        })
        .catch((error) => {
          setFormError(
            error instanceof Error ? error.message : "Could not open dispute.",
          );
        });
      return;
    }

    updateTrade(selectedTrade.id, "Disputed");
    appendEvent(selectedTrade.id, "Dispute opened", parsed.data.reason);
    pushNotice("Dispute opened", "The trade is frozen for admin review.", "warning");
    form.reset();
  }

  function adminResolve(trade: Trade, status: "Completed" | "Cancelled") {
    setFormError("");

    if (piConnected && piAccessToken) {
      void apiRequest<TradePayload>(
        `/api/trades/${trade.id}/admin-resolve`,
        piAccessToken,
        {
          method: "POST",
          body: JSON.stringify({
            status,
            notes:
              status === "Completed"
                ? "Admin confirmed both parties were satisfied before release."
                : "Admin cancelled after reviewing the dispute.",
          }),
        },
      )
        .then(applyTradePayload)
        .then(() => {
          pushNotice(
            "Dispute resolved",
            status === "Completed"
              ? "Admin marked the trade complete after review."
              : "Admin cancelled the trade after review.",
            status === "Completed" ? "success" : "warning",
          );
        })
        .catch((error) => {
          setFormError(
            error instanceof Error ? error.message : "Could not resolve dispute.",
          );
        });
      return;
    }

    updateTrade(trade.id, status);
    appendEvent(
      trade.id,
      `Admin resolved as ${status.toLowerCase()}`,
      status === "Completed"
        ? "Admin confirmed both parties were satisfied before release."
        : "Admin cancelled after reviewing the dispute.",
      user?.username ?? "admin",
    );
    pushNotice(
      "Dispute resolved",
      status === "Completed"
        ? "Admin marked the trade complete after review."
        : "Admin cancelled the trade after review.",
      status === "Completed" ? "success" : "warning",
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <section className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <header className="grid gap-4 border-b border-black/10 pb-5 lg:grid-cols-[1fr_390px]">
          <div className="grid gap-4">
            <div className="inline-flex w-fit items-center gap-2 border border-black/15 bg-white px-3 py-2 text-xs font-bold uppercase text-zinc-700">
              <ShieldCheck className="h-4 w-4 text-emerald-700" />
              Pi Testnet / Sandbox
            </div>
            <div>
              <h1 className="text-4xl font-black leading-none text-zinc-950 sm:text-6xl">
                PiScrow
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-700">
                Sellers post public or private Pi testnet offers, buyers submit
                interest, and the selected buyer funds escrow-style trades with a
                transparent platform fee.
              </p>
            </div>
          </div>

          <SessionCard
            authState={authState}
            connecting={connectingPi}
            user={user}
            onConnect={connectPi}
          />
        </header>

        {!signedIn && (
          <>
            <SignInPanel
              authState={authState}
              connecting={connectingPi}
              onConnect={connectPi}
            />
            {activeMode !== "ledger" && <NotificationStack notices={notices} />}
            <PublicLedger
              trades={ledgerTrades}
              events={ledgerEvents}
              loading={ledgerLoading}
              onRefresh={refreshPublicLedger}
            />
          </>
        )}

        {signedIn && (
          <>
            <WorkspaceSwitcher
              mode={activeMode}
              navItems={navItems}
              onModeChange={changeMode}
            />

            {activeMode !== "ledger" && (
              <section className="grid gap-3 md:grid-cols-3">
                <Metric
                  icon={<Store className="h-5 w-5" />}
                  label="Open offers"
                  value={trades.filter((trade) => trade.status === "Draft").length}
                />
                <Metric
                  icon={<HandCoins className="h-5 w-5" />}
                  label="Active value"
                  value={formatTestPi(activeValue)}
                />
                <Metric
                  icon={<FileWarning className="h-5 w-5" />}
                  label="Disputes"
                  value={trades.filter((trade) => trade.status === "Disputed").length}
                />
              </section>
            )}

            {activeMode !== "ledger" && <NotificationStack notices={notices} />}

            {formError && (
              <div className="border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-950">
                {formError}
              </div>
            )}

            {activeMode === "market" && (
              <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
                <OfferFeed
                  trades={buyerTrades}
                  interests={interests}
                  currentUsername={normalizedUsername}
                  expandedTradeId={expandedTradeId}
                  onExpand={setExpandedTradeId}
                  onSelect={setSelectedTradeId}
                  onSubmitInterest={submitInterest}
                  onDeclinePrivate={declinePrivateOffer}
                  onFund={fundTrade}
                  onConfirm={confirmReceipt}
                />
                <SideRail
                  trade={selectedTrade}
                  events={events}
                  paymentState={paymentState}
                  onOpenDispute={openDispute}
                />
              </section>
            )}

            {activeMode === "sell" && (
              <section className="grid gap-5 lg:grid-cols-[430px_minmax(0,1fr)]">
                <SellerPostPanel
                  key={sellerFormResetKey}
                  username={normalizedUsername}
                  onCreateTrade={createTrade}
                />
                <SellerDesk
                  trades={sellerTrades}
                  interests={interests}
                  events={events}
                  selectedTrade={selectedTrade}
                  onSelect={(tradeId) => {
                    setSelectedTradeId(tradeId);
                    setExpandedTradeId(tradeId);
                  }}
                  onSelectInterest={selectInterest}
                  onDeleteOffer={deleteOffer}
                  onSubmitDelivery={submitDelivery}
                  onOpenDispute={openDispute}
                />
              </section>
            )}

            {activeMode === "ledger" && (
              <PublicLedger
                trades={ledgerTrades}
                events={ledgerEvents}
                loading={ledgerLoading}
                onRefresh={refreshPublicLedger}
              />
            )}

            {activeMode === "admin" && user?.isAdmin && (
              <AdminDesk
                trades={adminTrades}
                events={events}
                onResolve={adminResolve}
              />
            )}
          </>
        )}
      </section>
    </main>
  );
}

async function apiRequest<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
) {
  const isFormData = init.body instanceof FormData;
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(body?.error ?? `Request failed with ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

function SessionCard({
  authState,
  connecting,
  user,
  onConnect,
}: {
  authState: string;
  connecting: boolean;
  user: SessionUser | null;
  onConnect: () => void;
}) {
  return (
    <aside className="border border-black/10 bg-white p-4 shadow-[8px_8px_0_#111827]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-zinc-500">Session</p>
          <p className="mt-2 text-lg font-black text-zinc-950">
            {user ? `@${user.username}` : "Not connected"}
          </p>
        </div>
        <button
          className="inline-flex h-10 items-center gap-2 border border-zinc-950 bg-zinc-950 px-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:border-emerald-700 disabled:bg-emerald-700"
          type="button"
          onClick={onConnect}
          disabled={Boolean(user) || connecting}
        >
          {user ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : connecting ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <UserRoundCheck className="h-4 w-4" />
          )}
          {user ? "Connected" : connecting ? "Connecting" : "Connect"}
        </button>
      </div>
      <p className="mt-4 border-t border-black/10 pt-4 text-sm leading-6 text-zinc-600">
        {authState}
      </p>
    </aside>
  );
}

function SignInPanel({
  authState,
  connecting,
  onConnect,
}: {
  authState: string;
  connecting: boolean;
  onConnect: () => void;
}) {
  return (
    <section className="grid gap-5 border border-black/10 bg-white p-5 shadow-[8px_8px_0_#111827] md:grid-cols-[1fr_280px]">
      <div>
        <p className="text-xs font-bold uppercase text-zinc-500">
          Private Pi workspace
        </p>
        <h2 className="mt-3 text-2xl font-black text-zinc-950">
          Sign in with Pi Browser to post offers or show buyer interest.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
          Public listings and activity stay visible for transparency. Admin
          review tools only appear for approved developer usernames.
        </p>
        <p className="mt-4 border-l-4 border-emerald-700 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-950">
          {authState}
        </p>
      </div>
      <div className="flex items-center md:justify-end">
        <button
          className="inline-flex h-12 w-full items-center justify-center gap-2 bg-zinc-950 px-4 text-sm font-black text-white transition hover:bg-emerald-700 md:w-auto"
          type="button"
          onClick={onConnect}
          disabled={connecting}
        >
          {connecting ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <UserRoundCheck className="h-4 w-4" />
          )}
          {connecting ? "Connecting..." : "Connect Pi account"}
        </button>
      </div>
    </section>
  );
}

function WorkspaceSwitcher({
  mode,
  navItems,
  onModeChange,
}: {
  mode: ViewMode;
  navItems: ViewMode[];
  onModeChange: (mode: ViewMode) => void;
}) {
  const active = viewMeta[mode];
  const Icon = active.icon;

  return (
    <section className="flex flex-col gap-3 border border-black/10 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center bg-zinc-950 text-white">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-zinc-500">Workspace</p>
          <h2 className="text-lg font-black text-zinc-950">{active.label}</h2>
          <p className="text-sm leading-6 text-zinc-600">{active.description}</p>
        </div>
      </div>
      <div
        aria-label="Switch workspace"
        className="grid grid-cols-3 gap-1 border border-black/15 bg-zinc-50 p-1 sm:w-auto sm:grid-flow-col sm:auto-cols-fr sm:grid-cols-none"
        role="group"
      >
        {navItems.map((item) => {
          const ItemIcon = viewMeta[item].icon;
          const selected = mode === item;

          return (
            <button
              key={item}
              aria-pressed={selected}
              className={`inline-flex h-11 min-w-24 items-center justify-center gap-2 px-3 text-sm font-black transition ${
                selected
                  ? "bg-zinc-950 text-white shadow-[3px_3px_0_#10b981]"
                  : "text-zinc-600 hover:bg-white hover:text-zinc-950"
              }`}
              type="button"
              onClick={() => onModeChange(item)}
            >
              <ItemIcon className="h-4 w-4" />
              {viewMeta[item].label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="border border-black/10 bg-white p-4">
      <div className="flex items-center gap-3 text-zinc-500">
        {icon}
        <p className="text-xs font-bold uppercase">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-black text-zinc-950">{value}</p>
    </div>
  );
}

function NotificationStack({ notices }: { notices: AppNotice[] }) {
  if (notices.length === 0) {
    return null;
  }

  const tones: Record<AppNotice["tone"], string> = {
    info: "border-sky-200 bg-sky-50 text-sky-950",
    success: "border-emerald-200 bg-emerald-50 text-emerald-950",
    warning: "border-amber-200 bg-amber-50 text-amber-950",
  };

  return (
    <section
      aria-label="PiScrow notifications"
      className="grid gap-2 md:grid-cols-2 xl:grid-cols-3"
    >
      {notices.map((notice) => (
        <article
          key={notice.id}
          className={`border p-3 text-sm leading-6 ${tones[notice.tone]}`}
        >
          <p className="font-black">{notice.title}</p>
          <p>{notice.body}</p>
        </article>
      ))}
    </section>
  );
}

function SellerPostPanel({
  username,
  onCreateTrade,
}: {
  username: string;
  onCreateTrade: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [visibility, setVisibility] = useState<"public" | "private">("public");

  return (
    <section className="border border-black/10 bg-white p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-zinc-950">Post Seller Offer</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            @{username} posts first. Buyers compete with responses.
          </p>
        </div>
        <Plus className="h-5 w-5 text-emerald-700" />
      </div>
      <form
        className="grid gap-3"
        onReset={() => setVisibility("public")}
        onSubmit={onCreateTrade}
      >
        <input
          className="h-11 border border-black/15 bg-white px-3 text-sm outline-none focus:border-emerald-700"
          name="title"
          placeholder="Offer title"
        />
        <textarea
          className="min-h-24 border border-black/15 bg-white p-3 text-sm outline-none focus:border-emerald-700"
          name="description"
          placeholder="Item or service details"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            className="h-11 border border-black/15 bg-white px-3 text-sm outline-none focus:border-emerald-700"
            min="0.01"
            name="amountTestPi"
            placeholder="Seller price in Test Pi"
            step="0.01"
            type="number"
          />
          <input
            className="h-11 border border-black/15 bg-white px-3 text-sm outline-none focus:border-emerald-700"
            name="locationLabel"
            placeholder="Trade location"
          />
        </div>
        <input
          className="h-11 border border-black/15 bg-white px-3 text-sm outline-none focus:border-emerald-700"
          name="locationArea"
          placeholder="Area or pickup zone"
        />
        <input name="visibility" type="hidden" value={visibility} />
        <div className="grid grid-cols-2 border border-black/15 bg-zinc-50 p-1">
          {(["public", "private"] as const).map((item) => (
            <button
              key={item}
              aria-pressed={visibility === item}
              className={`h-10 text-sm font-black transition ${
                visibility === item
                  ? "bg-zinc-950 text-white shadow-[3px_3px_0_#10b981]"
                  : "text-zinc-600 hover:bg-white"
              }`}
              type="button"
              onClick={() => setVisibility(item)}
            >
              {item === "public" ? "Public" : "Private"}
            </button>
          ))}
        </div>
        {visibility === "private" && (
          <input
            className="h-11 border border-black/15 bg-white px-3 text-sm outline-none focus:border-emerald-700"
            name="targetBuyerPiUsernames"
            placeholder="@buyer_username"
          />
        )}
        <textarea
          className="min-h-24 border border-black/15 bg-white p-3 text-sm outline-none focus:border-emerald-700"
          name="deliveryTerms"
          placeholder="Delivery terms and confirmation rules"
        />
        <div className="border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-950">
          PiScrow fee: {feePercentLabel()} of the listing price. Buyers pay the
          seller price plus the platform fee during funding.
        </div>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 bg-zinc-950 px-4 text-sm font-black text-white transition hover:bg-emerald-700"
          type="submit"
        >
          Post offer
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>
    </section>
  );
}

function OfferFeed({
  trades,
  interests,
  currentUsername,
  expandedTradeId,
  onExpand,
  onSelect,
  onSubmitInterest,
  onDeclinePrivate,
  onFund,
  onConfirm,
}: {
  trades: Trade[];
  interests: TradeInterest[];
  currentUsername: string;
  expandedTradeId: string;
  onExpand: (tradeId: string) => void;
  onSelect: (tradeId: string) => void;
  onSubmitInterest: (trade: Trade, event: FormEvent<HTMLFormElement>) => void;
  onDeclinePrivate: (trade: Trade) => void;
  onFund: (trade: Trade) => void;
  onConfirm: (trade: Trade, event: FormEvent<HTMLFormElement>) => void;
}) {
  if (trades.length === 0) {
    return <EmptyState label="No buyer offers available yet." />;
  }

  return (
    <section className="grid gap-3">
      {trades.map((trade) => {
        const expanded = expandedTradeId === trade.id;
        const userInterest = interests.find(
          (interest) =>
            interest.tradeId === trade.id &&
            normalizeUsername(interest.buyerPiUsername) === currentUsername,
        );
        const selectedForUser =
          trade.buyerPiUsername &&
          normalizeUsername(trade.buyerPiUsername) === currentUsername;
        const isOwnOffer =
          normalizeUsername(trade.sellerPiUsername) === currentUsername;
        const isPrivateRequest =
          trade.visibility === "private" &&
          trade.targetBuyerPiUsernames.includes(currentUsername);

        return (
          <article
            key={trade.id}
            className="border border-black/10 bg-white p-4 transition hover:border-zinc-400"
          >
            <button
              className="grid w-full gap-3 text-left md:grid-cols-[1fr_auto]"
              type="button"
              onClick={() => {
                onExpand(expanded ? "" : trade.id);
                onSelect(trade.id);
              }}
            >
              <OfferSummary trade={trade} />
              <ChevronDown
                className={`h-5 w-5 text-zinc-500 transition ${expanded ? "rotate-180" : ""}`}
              />
            </button>

            {expanded && (
              <div className="mt-4 grid gap-4 border-t border-black/10 pt-4">
                <TradeEconomics trade={trade} />
                <LocationBlock trade={trade} />
                <TextBlock label="Description" value={trade.description} />
                <TextBlock label="Delivery terms" value={trade.deliveryTerms} />
                {isOwnOffer && (
                  <div className="border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
                    This is your seller offer. Buyers can see it, but you cannot
                    show interest or buy your own listing.
                  </div>
                )}
                {isPrivateRequest && !userInterest && (
                  <div className="grid gap-3 border border-zinc-200 bg-zinc-50 p-3">
                    <p className="text-sm font-semibold leading-6 text-zinc-700">
                      Private requested trade from @{trade.sellerPiUsername}.
                    </p>
                    <button
                      className="inline-flex h-10 items-center justify-center gap-2 border border-zinc-950 px-3 text-sm font-black text-zinc-950 transition hover:bg-zinc-950 hover:text-white"
                      type="button"
                      onClick={() => onDeclinePrivate(trade)}
                    >
                      Decline request
                    </button>
                  </div>
                )}
                {trade.status === "Draft" && !userInterest && !isOwnOffer && (
                  <form
                    className="grid gap-3"
                    onSubmit={(event) => onSubmitInterest(trade, event)}
                  >
                    <textarea
                      className="min-h-24 border border-black/15 bg-white p-3 text-sm outline-none focus:border-emerald-700"
                      name="responseNote"
                      placeholder="Tell the seller why you are the right buyer"
                    />
                    <button
                      className="inline-flex h-11 items-center justify-center gap-2 bg-emerald-700 px-4 text-sm font-black text-white"
                      type="submit"
                    >
                      <Send className="h-4 w-4" />
                      Show interest
                    </button>
                  </form>
                )}
                {userInterest && (
                  <div className="border border-cyan-200 bg-cyan-50 p-3 text-sm leading-6 text-cyan-950">
                    Your response is {userInterest.status.toLowerCase()}.
                  </div>
                )}
                {selectedForUser && trade.status === "PendingFunding" && (
                  <button
                    className="inline-flex h-11 items-center justify-center gap-2 bg-emerald-700 px-4 text-sm font-black text-white"
                    type="button"
                    onClick={() => onFund(trade)}
                  >
                    <HandCoins className="h-4 w-4" />
                    Fund {formatTestPi(calculateBuyerTotal(trade.amountTestPi))}
                  </button>
                )}
                {selectedForUser && trade.status === "DeliverySubmitted" && (
                  <form
                    className="grid gap-3 border border-emerald-200 bg-emerald-50 p-3"
                    onSubmit={(event) => onConfirm(trade, event)}
                  >
                    <textarea
                      className="min-h-24 border border-black/15 bg-white p-3 text-sm outline-none focus:border-emerald-700"
                      name="buyerReceiptNote"
                      placeholder="Confirm what you received"
                    />
                    <input
                      className="h-11 border border-black/15 bg-white px-3 text-sm outline-none focus:border-emerald-700"
                      name="buyerReceiptProofUrl"
                      placeholder="Optional receipt proof URL"
                      type="url"
                    />
                    <ProofFileInput
                      label="Receipt image"
                      name="buyerReceiptImage"
                    />
                    <button
                      className="inline-flex h-11 items-center justify-center gap-2 bg-zinc-950 px-4 text-sm font-black text-white"
                      type="submit"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Confirm receipt
                    </button>
                  </form>
                )}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

function OfferSummary({ trade }: { trade: Trade }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={trade.status} />
        <span className="inline-flex h-7 items-center border border-black/10 bg-zinc-50 px-2.5 text-xs font-semibold text-zinc-700">
          {tradeVisibilityLabels[trade.visibility]}
        </span>
        <span className="text-xs font-bold uppercase text-zinc-500">
          {trade.interestCount ?? 0} interest
        </span>
      </div>
      <h3 className="mt-3 text-lg font-black text-zinc-950">{trade.title}</h3>
      <p className="mt-1 text-sm leading-6 text-zinc-600">
        Seller @{trade.sellerPiUsername}
        {trade.buyerPiUsername ? ` selected @${trade.buyerPiUsername}` : ""}
      </p>
      {trade.locationLabel && (
        <p className="mt-1 text-sm font-semibold text-zinc-700">
          {trade.locationLabel}
          {trade.locationArea ? ` / ${trade.locationArea}` : ""}
        </p>
      )}
    </div>
  );
}

function TradeEconomics({ trade }: { trade: Trade }) {
  const fee = calculatePlatformFee(trade.amountTestPi);

  return (
    <dl className="grid gap-2 border border-black/10 bg-zinc-50 p-3 text-sm sm:grid-cols-3">
      <div>
        <dt className="font-bold text-zinc-500">Seller receives</dt>
        <dd className="mt-1 font-black text-zinc-950">
          {formatTestPi(calculateSellerReceivable(trade.amountTestPi))}
        </dd>
      </div>
      <div>
        <dt className="font-bold text-zinc-500">PiScrow fee</dt>
        <dd className="mt-1 font-black text-zinc-950">{formatTestPi(fee)}</dd>
      </div>
      <div>
        <dt className="font-bold text-zinc-500">Buyer funds</dt>
        <dd className="mt-1 font-black text-zinc-950">
          {formatTestPi(calculateBuyerTotal(trade.amountTestPi))}
        </dd>
      </div>
    </dl>
  );
}

function LedgerEconomics({ trade }: { trade: Trade }) {
  return (
    <dl className="grid gap-2 border border-black/10 bg-zinc-50 p-3 text-sm sm:grid-cols-2">
      <div>
        <dt className="font-bold text-zinc-500">Seller price</dt>
        <dd className="mt-1 font-black text-zinc-950">
          {formatTestPi(trade.amountTestPi)}
        </dd>
      </div>
      <div>
        <dt className="font-bold text-zinc-500">Location</dt>
        <dd className="mt-1 font-black text-zinc-950">
          {trade.locationLabel ?? "Not provided"}
        </dd>
      </div>
    </dl>
  );
}

function LocationBlock({ trade }: { trade: Trade }) {
  if (!trade.locationLabel && !trade.locationArea) {
    return null;
  }

  return (
    <div className="grid gap-2 border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 sm:grid-cols-2">
      {trade.locationLabel && (
        <TextBlock label="Trade location" value={trade.locationLabel} />
      )}
      {trade.locationArea && (
        <TextBlock label="Area / pickup zone" value={trade.locationArea} />
      )}
    </div>
  );
}

function SellerDesk({
  trades,
  interests,
  events,
  selectedTrade,
  onSelect,
  onSelectInterest,
  onDeleteOffer,
  onSubmitDelivery,
  onOpenDispute,
}: {
  trades: Trade[];
  interests: TradeInterest[];
  events: TradeEvent[];
  selectedTrade?: Trade;
  onSelect: (tradeId: string) => void;
  onSelectInterest: (trade: Trade, interest: TradeInterest) => void;
  onDeleteOffer: (trade: Trade) => void;
  onSubmitDelivery: (event: FormEvent<HTMLFormElement>) => void;
  onOpenDispute: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (trades.length === 0) {
    return <EmptyState label="No seller offers yet. Post one to begin." />;
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-3">
        {trades.map((trade) => {
          const tradeInterests = interests.filter(
            (interest) => interest.tradeId === trade.id,
          );

          return (
            <article
              key={trade.id}
              className={`border bg-white p-4 ${
                selectedTrade?.id === trade.id
                  ? "border-zinc-950 shadow-[6px_6px_0_#111827]"
                  : "border-black/10"
              }`}
            >
              <button
                className="w-full text-left"
                type="button"
                onClick={() => onSelect(trade.id)}
              >
                <OfferSummary trade={trade} />
              </button>
              <div className="mt-4 grid gap-3 border-t border-black/10 pt-4">
                {trade.status === "Draft" && (
                  <button
                    className="inline-flex h-10 w-fit items-center justify-center gap-2 border border-rose-700 px-3 text-sm font-black text-rose-800 transition hover:bg-rose-700 hover:text-white"
                    type="button"
                    onClick={() => onDeleteOffer(trade)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete offer
                  </button>
                )}
                {tradeInterests.length === 0 ? (
                  <p className="text-sm font-semibold text-zinc-500">
                    No buyer responses yet.
                  </p>
                ) : (
                  tradeInterests.map((interest) => (
                    <div
                      key={interest.id}
                      className="grid gap-3 border border-black/10 bg-zinc-50 p-3 md:grid-cols-[1fr_auto]"
                    >
                      <div>
                        <p className="font-black text-zinc-950">
                          @{interest.buyerPiUsername}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-zinc-600">
                          {interest.responseNote}
                        </p>
                        <p className="mt-2 text-xs font-bold uppercase text-zinc-500">
                          {interest.status}
                        </p>
                      </div>
                      {trade.status === "Draft" && interest.status === "Open" && (
                        <button
                          className="inline-flex h-10 items-center justify-center gap-2 bg-zinc-950 px-3 text-sm font-black text-white"
                          type="button"
                          onClick={() => onSelectInterest(trade, interest)}
                        >
                          Select buyer
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </article>
          );
        })}
      </div>
      <SideRail
        trade={selectedTrade}
        events={events}
        paymentState="Seller actions"
        onSubmitDelivery={onSubmitDelivery}
        onOpenDispute={onOpenDispute}
      />
    </section>
  );
}

function SideRail({
  trade,
  events,
  paymentState,
  onSubmitDelivery,
  onOpenDispute,
}: {
  trade?: Trade;
  events: TradeEvent[];
  paymentState: string;
  onSubmitDelivery?: (event: FormEvent<HTMLFormElement>) => void;
  onOpenDispute: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const tradeEvents = events.filter((event) => event.tradeId === trade?.id);

  return (
    <aside className="grid content-start gap-4">
      <section className="border border-black/10 bg-white p-4">
        {trade ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-zinc-500">
                  Trade detail
                </p>
                <h2 className="mt-2 text-xl font-black text-zinc-950">
                  {trade.title}
                </h2>
              </div>
              <StatusBadge status={trade.status} />
            </div>
            <div className="mt-4">
              <TradeEconomics trade={trade} />
            </div>
            <div className="mt-4 grid gap-3">
              <TextBlock label="Seller" value={`@${trade.sellerPiUsername}`} />
              {(trade.locationLabel || trade.locationArea) && (
                <LocationBlock trade={trade} />
              )}
              {trade.buyerPiUsername && (
                <TextBlock label="Selected buyer" value={`@${trade.buyerPiUsername}`} />
              )}
              {trade.deliveryProofNote && (
                <TextBlock
                  label="Seller package proof"
                  value={trade.deliveryProofNote}
                />
              )}
              {trade.deliveryProofUrl && (
                <ProofLink label="Seller proof image / link" url={trade.deliveryProofUrl} />
              )}
              {trade.buyerReceiptNote && (
                <TextBlock
                  label="Buyer receipt proof"
                  value={trade.buyerReceiptNote}
                />
              )}
              {trade.buyerReceiptProofUrl && (
                <ProofLink
                  label="Buyer receipt image / link"
                  url={trade.buyerReceiptProofUrl}
                />
              )}
            </div>
          </>
        ) : (
          <p className="text-sm font-semibold text-zinc-500">
            Select a trade to see details.
          </p>
        )}
      </section>

      {trade && onSubmitDelivery && trade.status === "Funded" && (
        <ActionPanel title="Package Sent Proof" icon={<ClipboardCheck className="h-4 w-4" />}>
          <form className="grid gap-3" onSubmit={onSubmitDelivery}>
            <textarea
              className="min-h-24 border border-black/15 bg-white p-3 text-sm outline-none focus:border-emerald-700"
              name="deliveryProofNote"
              placeholder="Package sent note or proof details"
            />
            <input
              className="h-11 border border-black/15 bg-white px-3 text-sm outline-none focus:border-emerald-700"
              name="deliveryProofUrl"
              placeholder="Optional proof URL"
              type="url"
            />
            <ProofFileInput label="Package proof image" name="deliveryProofImage" />
            <button
              className="inline-flex h-11 items-center justify-center gap-2 bg-emerald-700 px-4 text-sm font-black text-white"
              type="submit"
            >
              Submit proof
            </button>
          </form>
        </ActionPanel>
      )}

      {trade && !isTerminal(trade.status) && trade.status !== "Disputed" && (
        <ActionPanel title="Open Dispute" icon={<AlertTriangle className="h-4 w-4" />}>
          <form className="grid gap-3" onSubmit={onOpenDispute}>
            <textarea
              className="min-h-24 border border-black/15 bg-white p-3 text-sm outline-none focus:border-rose-700"
              name="reason"
              placeholder="Why should this trade be reviewed?"
            />
            <input
              className="h-11 border border-black/15 bg-white px-3 text-sm outline-none focus:border-rose-700"
              name="evidenceNote"
              placeholder="Optional evidence note"
            />
            <button
              className="inline-flex h-11 items-center justify-center gap-2 bg-rose-700 px-4 text-sm font-black text-white"
              type="submit"
            >
              Freeze trade
            </button>
          </form>
        </ActionPanel>
      )}

      <ActionPanel title="Payment Status" icon={<RefreshCcw className="h-4 w-4" />}>
        <p className="text-sm leading-6 text-zinc-700">{paymentState}</p>
      </ActionPanel>

      <Timeline events={tradeEvents} />
    </aside>
  );
}

function PublicLedger({
  trades,
  events,
  loading,
  onRefresh,
}: {
  trades: Trade[];
  events: TradeEvent[];
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="grid gap-3">
        <div className="flex flex-col gap-3 border border-black/10 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-zinc-950">Transparent Activity</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              Public view of listings, selected buyers, funding, completion, and disputes.
            </p>
          </div>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 border border-zinc-950 px-3 text-sm font-black text-zinc-950"
            type="button"
            onClick={onRefresh}
          >
            <RefreshCcw className="h-4 w-4" />
            {loading ? "Refreshing" : "Refresh"}
          </button>
        </div>
        {trades.map((trade) => (
          <article key={trade.id} className="border border-black/10 bg-white p-4">
            <OfferSummary trade={trade} />
            <div className="mt-3">
              <LedgerEconomics trade={trade} />
            </div>
          </article>
        ))}
      </div>
      <Timeline events={events.slice(0, 30)} />
    </section>
  );
}

function AdminDesk({
  trades,
  events,
  onResolve,
}: {
  trades: Trade[];
  events: TradeEvent[];
  onResolve: (trade: Trade, status: "Completed" | "Cancelled") => void;
}) {
  if (trades.length === 0) {
    return <EmptyState label="No disputed trades waiting for admin review." />;
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="grid gap-3">
        {trades.map((trade) => (
          <article key={trade.id} className="border border-rose-200 bg-white p-4">
            <OfferSummary trade={trade} />
            <div className="mt-4">
              <TradeEconomics trade={trade} />
            </div>
            <div className="mt-4 grid gap-3 border-t border-black/10 pt-3">
              <LocationBlock trade={trade} />
              {trade.deliveryProofNote && (
                <TextBlock
                  label="Seller package proof"
                  value={trade.deliveryProofNote}
                />
              )}
              {trade.deliveryProofUrl && (
                <ProofLink label="Seller proof image / link" url={trade.deliveryProofUrl} />
              )}
              {trade.buyerReceiptNote && (
                <TextBlock
                  label="Buyer receipt proof"
                  value={trade.buyerReceiptNote}
                />
              )}
              {trade.buyerReceiptProofUrl && (
                <ProofLink
                  label="Buyer receipt image / link"
                  url={trade.buyerReceiptProofUrl}
                />
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-black/10 pt-3">
              <button
                className="inline-flex h-10 items-center gap-2 bg-emerald-700 px-3 text-sm font-black text-white"
                type="button"
                onClick={() => onResolve(trade, "Completed")}
              >
                Release after review
              </button>
              <button
                className="inline-flex h-10 items-center gap-2 bg-zinc-800 px-3 text-sm font-black text-white"
                type="button"
                onClick={() => onResolve(trade, "Cancelled")}
              >
                Cancel trade
              </button>
            </div>
          </article>
        ))}
      </div>
      <Timeline events={events.filter((event) => trades.some((trade) => trade.id === event.tradeId))} />
    </section>
  );
}

function Timeline({ events }: { events: TradeEvent[] }) {
  return (
    <section className="border border-black/10 bg-white p-4">
      <div className="mb-4 flex items-center gap-2">
        <Eye className="h-4 w-4 text-zinc-500" />
        <h2 className="font-black text-zinc-950">Live Activity</h2>
      </div>
      <div className="grid max-h-[560px] gap-2 overflow-auto pr-1">
        {events.length === 0 ? (
          <p className="text-sm text-zinc-500">No events yet.</p>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className="border-l-4 border-emerald-700 bg-zinc-50 px-3 py-2"
            >
              <p className="text-sm font-black text-zinc-900">{event.eventType}</p>
              <p className="text-xs leading-5 text-zinc-600">{event.notes}</p>
              <p className="mt-1 text-[11px] font-bold uppercase text-zinc-400">
                @{event.actor} · {dateLabel(event.createdAt)}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function ActionPanel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-black/10 bg-white p-4">
      <div className="mb-4 flex items-center gap-2 text-zinc-500">
        {icon}
        <h2 className="font-black text-zinc-950">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function TextBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase text-zinc-500">{label}</p>
      <p className="mt-1 text-sm leading-6 text-zinc-700">{value}</p>
    </div>
  );
}

function ProofFileInput({ label, name }: { label: string; name: string }) {
  return (
    <label className="grid gap-2 border border-dashed border-black/20 bg-white p-3">
      <span className="text-xs font-bold uppercase text-zinc-500">{label}</span>
      <input
        accept="image/jpeg,image/png,image/webp"
        className="text-sm font-semibold text-zinc-700 file:mr-3 file:h-10 file:border-0 file:bg-zinc-950 file:px-3 file:text-sm file:font-black file:text-white"
        name={name}
        type="file"
      />
      <span className="text-xs leading-5 text-zinc-500">
        JPEG, PNG, or WebP. Max 5 MB. Stored privately for trade review.
      </span>
    </label>
  );
}

function ProofLink({ label, url }: { label: string; url: string }) {
  return (
    <div className="grid gap-2">
      <p className="text-xs font-bold uppercase text-zinc-500">{label}</p>
      {isImageUrl(url) && (
        <a href={url} rel="noreferrer" target="_blank">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={label}
            className="aspect-[4/3] w-full border border-black/10 object-cover"
            src={url}
          />
        </a>
      )}
      <a
        className="mt-1 block break-all text-sm font-semibold leading-6 text-emerald-800 underline-offset-4 hover:underline"
        href={url}
        rel="noreferrer"
        target="_blank"
      >
        {url}
      </a>
    </div>
  );
}

function isImageUrl(url: string) {
  return (
    url.includes("token=") ||
    /\.(jpe?g|png|webp)(\?|$)/i.test(url)
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <section className="border border-dashed border-black/20 bg-white p-8 text-center">
      <Users className="mx-auto h-8 w-8 text-zinc-400" />
      <p className="mt-3 text-sm font-bold text-zinc-600">{label}</p>
    </section>
  );
}
