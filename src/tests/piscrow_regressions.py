from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def read(relative: str) -> str:
    return (PROJECT_ROOT / relative).read_text(encoding="utf-8")


def assert_state_transition_guards() -> None:
    trade_state = read("src/lib/trade-state.ts")
    dispute_route = read("src/app/api/trades/[tradeId]/dispute/route.ts")
    delivery_route = read("src/app/api/trades/[tradeId]/delivery/route.ts")
    confirm_route = read("src/app/api/trades/[tradeId]/confirm/route.ts")
    select_route = read("src/app/api/trades/[tradeId]/select-interest/route.ts")

    assert 'Draft: ["PendingFunding", "Cancelled"]' in trade_state
    assert 'PendingFunding: ["Funded", "Cancelled", "Disputed"]' in trade_state
    assert 'Funded: ["DeliverySubmitted", "Disputed", "Cancelled"]' in trade_state
    assert 'DeliverySubmitted: ["AwaitingRelease", "Disputed"]' in trade_state
    assert 'AwaitingRelease: ["Completed", "Disputed", "Cancelled"]' in trade_state
    assert 'Disputed: ["Completed", "Cancelled"]' in trade_state
    assert '["Funded", "DeliverySubmitted", "AwaitingRelease"].includes(trade.status)' in dispute_route
    assert 'assertTradeStatus(trade, ["Funded"])' in delivery_route
    assert 'assertTradeStatus(trade, ["DeliverySubmitted"])' in confirm_route
    assert 'trade.status === "AwaitingRelease"' in select_route
    assert "cannot be reassigned" in select_route


def assert_validation_guards() -> None:
    validation = read("src/lib/validation.ts")
    app = read("src/components/piscrow-app.tsx")
    helpers = read("src/lib/piscrow-ui-helpers.ts")

    assert 'value == null ? "" : value' in validation
    assert "Keep the response under 600 characters." in validation
    assert "Could not read the optional buyer note." in helpers
    assert "`/api/trades/${trade.id}/interests`" in app
    assert "JSON.stringify(parsed.data)" in app


def assert_authenticated_workspace_sync() -> None:
    app = read("src/components/piscrow-app.tsx")
    workspaces = read("src/components/piscrow-workspaces.tsx")
    supabase = read("src/lib/supabase.ts")

    assert "const workspaceFallbackSyncIntervalMs = 60_000" in app
    assert 'const realtimeSyncChannelName = "piscrow-app-sync"' in app
    assert "createBrowserSupabaseClient()" in app
    assert 'apiRequest<TradePayload>("/api/trades", accessToken)' in app
    assert 'apiRequest<{ notifications: SavedNotification[] }>(' in app
    assert '.channel(realtimeSyncChannelName, {' in app
    assert '.on("broadcast", { event: "workspace-refresh" }' in app
    assert '.on("broadcast", { event: "ledger-refresh" }' in app
    assert '.on("broadcast", { event: "profile-refresh" }' in app
    assert '.on("broadcast", { event: "admin-refresh" }' in app
    assert 'window.addEventListener(\n      "piscrow:mutation-success",' in app
    assert 'new CustomEvent("piscrow:mutation-success"' in app
    assert 'window.setInterval(' in app
    assert "workspaceFallbackSyncIntervalMs" in app
    assert 'document.addEventListener("visibilitychange", handleWorkspaceVisibilityRefresh)' in app
    assert "persistSession: false" in supabase
    assert "detectSessionInUrl: false" in supabase
    assert 'normalizeUsername(trade.buyerPiUsername ?? "") === normalizedUsername' in app
    assert "function signOutPiSession()" in app
    assert "onSignOut={signOutPiSession}" in app
    assert "copy.profile.signOut" in workspaces
    assert "showBlockingAction(" in app
    assert 'setActiveChatTrade(resolvedTrade);' in app


def assert_authorization_guards() -> None:
    admin_route = read("src/app/api/trades/[tradeId]/admin-resolve/route.ts")
    review_route = read("src/app/api/trades/[tradeId]/review-copilot/route.ts")
    interest_route = read("src/app/api/trades/[tradeId]/interests/route.ts")
    select_route = read("src/app/api/trades/[tradeId]/select-interest/route.ts")
    dispute_route = read("src/app/api/trades/[tradeId]/dispute/route.ts")

    assert "if (!user.isAdmin)" in admin_route
    assert "Only admins can resolve review rooms or disputes." in admin_route
    assert "if (!user.isAdmin)" in review_route
    assert "Only admins can run review recommendations." in review_route
    assert "assertBuyerIsEligibleForListing(trade, user)" in interest_route
    assert "assertTradeListingOwner(trade, user)" in select_route
    assert "Only the buyer or seller can dispute this trade." in dispute_route


def assert_payment_amount_and_window_guards() -> None:
    payments = read("src/server/pi-payments.ts")
    approve_route = read("src/app/api/pi/approve/route.ts")
    complete_route = read("src/app/api/pi/complete/route.ts")
    incomplete_route = read("src/app/api/pi/incomplete/route.ts")
    confirm_route = read("src/app/api/trades/[tradeId]/confirm/route.ts")
    escrow_release = read("src/server/escrow-release.ts")
    pi_platform = read("src/lib/pi-platform.ts")
    wallet_smoke = read("scripts/pi-wallet-smoke-test.mjs")

    assert "Pi payment amount does not match the trade total." in payments
    assert "calculateBuyerTotal(sellerAmount)" in payments
    assert "Your 1-hour funding window expired." in payments
    assert "Pi payment user does not match the selected buyer." in payments
    assert "assertNoCompletedPayment" in approve_route
    assert "getCompletedPaymentForTrade" in complete_route
    assert "This trade already has a completed payment." in complete_route
    assert 'escrow_status: "buyer_pending"' in approve_route
    assert 'escrow_status: "held_in_app"' in complete_route
    assert "buyer_payment_txid" in complete_route
    assert "buyer_payment_link" in complete_route
    assert 'release_status: "NotStarted"' in complete_route
    assert 'escrow_status: "held_in_app"' in incomplete_route
    assert 'status: "AwaitingRelease"' in confirm_route
    assert "getPiWalletPrivateSeed" in escrow_release
    assert "piPlatformCreatePayment" in escrow_release
    assert "completePiPayment" in escrow_release
    assert "submitAppWalletPayment" in escrow_release
    assert "payment_already_linked_with_a_tx" in escrow_release
    assert "ongoing_payment_found" in escrow_release
    assert "cancelled_payment" in escrow_release
    assert "cancelPiPayment" in escrow_release
    assert "releasePayment.transaction?.txid?.trim()" in escrow_release
    assert "if (releasePayment.status?.developer_completed)" in escrow_release
    assert ".addMemo(StellarSdk.Memo.text(paymentIdentifier))" in escrow_release
    assert 'StellarSdk.Keypair.fromSecret' in escrow_release
    assert 'PI_WALLET_PRIVATE_SEED does not match the app wallet expected by this Pi payment.' in escrow_release
    assert 'message.includes("missing_scope") && message.includes("wallet_address")' in escrow_release
    assert "approve the wallet permission" in escrow_release
    assert "PI_WALLET_PRIVATE_SEED" in pi_platform
    assert ".normalize(\"NFKC\")" in pi_platform
    assert "invisible characters" in pi_platform
    assert "common separators" in pi_platform
    assert "normalized length is" in pi_platform
    assert "hasOnlyBase32Chars" in pi_platform
    assert "piWalletSeedNoisePattern" in pi_platform
    assert "invalidCharacters" in pi_platform
    assert "released_to_seller" in escrow_release
    assert "refunded_to_buyer" in escrow_release
    assert "Derived public key:" in wallet_smoke
    assert "No send requested. Use --send --to <PUBLIC_KEY> to submit a payment." in wallet_smoke
    assert "Preparing payment of" in wallet_smoke
    assert 'const PI_TESTNET_BLOCK_EXPLORER_URL = "https://blockexplorer.minepi.com/testnet";' in wallet_smoke
    assert 'Explorer: ${PI_TESTNET_BLOCK_EXPLORER_URL}/tx/${encodeURIComponent(submitted.hash)}' in wallet_smoke


def assert_handoff_code_release_recovery() -> None:
    handoff = read("src/server/trade-handoff.ts")
    escrow_release = read("src/server/escrow-release.ts")

    assert "verify_attempt_count: row.verify_attempt_count + 1" in handoff
    assert handoff.index("executeEscrowRelease({") < handoff.index("used_at: now")
    assert '["NotStarted", "Failed", "Cancelled", "Created", "Submitted"]' in escrow_release
    assert "persistCompletedEscrowRelease" in escrow_release
    assert "releasePayment.transaction?.txid?.trim() ||" in escrow_release


def assert_trade_chat_guards() -> None:
    migration = read("supabase/migrations/20260609190000_trade_chat_rooms.sql")
    chat_server = read("src/server/trade-chat.ts")
    chat_route = read("src/app/api/trades/[tradeId]/chat/route.ts")
    claim_route = read("src/app/api/trades/[tradeId]/chat/claim/route.ts")
    complete_route = read("src/app/api/pi/complete/route.ts")
    dispute_route = read("src/app/api/trades/[tradeId]/dispute/route.ts")

    assert "trade_chat_rooms" in migration
    assert "trade_chat_messages" in migration
    assert "trade chat rooms direct access denied" in migration
    assert "trade chat messages direct access denied" in migration
    assert "Join this review room before sending admin messages." in chat_server
    assert "This release review room is already claimed by another admin." in chat_server
    assert "This dispute room is already claimed by another admin." in chat_server
    assert "uploadTradeProofImage" in chat_route
    assert "claimTradeChatRoom" in claim_route
    assert "ensureTradeChatRoom" in complete_route
    assert "markTradeChatRoomDisputed" in dispute_route


def assert_review_copilot_is_recommend_only() -> None:
    review_server = read("src/server/review-copilot.ts")
    migration = read("supabase/migrations/20260608093000_review_recommendations.sql")
    workspaces = read("src/components/piscrow-workspaces.tsx")

    assert "trade_review_recommendations" in migration
    assert "recommended_action in ('release', 'refund', 'request_more_info', 'admin_review')" in migration
    assert "recommendOnly: true" in review_server
    assert "Review copilot only runs on disputed or release-ready trades." in review_server
    assert "It never releases funds or resolves a" in workspaces
    assert "onRunReview" in workspaces


def assert_review_room_copy_consistency() -> None:
    admin_resolve = read("src/app/api/trades/[tradeId]/admin-resolve/route.ts")
    chat_route = read("src/app/api/trades/[tradeId]/chat/route.ts")
    app = read("src/components/piscrow-app.tsx")

    assert "Only admins can resolve review rooms or disputes." in admin_resolve
    assert "Admin completed review" in admin_resolve
    assert "Admin added review update" in chat_route
    assert "release-ready or disputed trades" in app


def assert_demo_payment_visibility() -> None:
    demo_data = read("src/lib/demo-data.ts")
    workspaces = read("src/components/piscrow-workspaces.tsx")

    assert "trade-006" in demo_data
    assert "buyerPaymentTxid" in demo_data
    assert "held_in_app" in demo_data
    assert "Transaction Tracking" in workspaces
    assert "Seller payout" in workspaces
    assert "Buyer refund" in workspaces


def assert_no_sensitive_console_logging() -> None:
    for relative in [
        "src/server/security.ts",
        "src/server/notifications.ts",
        "src/server/proof-storage.ts",
    ]:
        source = read(relative)
        assert "console.warn" not in source
        assert "console.error" not in source


def assert_telegram_link_flow() -> None:
    telegram = read("src/server/telegram.ts")
    pi_browser = read("src/lib/pi-browser-helpers.ts")
    app = read("src/components/piscrow-app.tsx")

    assert "setWebhook" in telegram
    assert 'url: `${url}/api/telegram/webhook`' in telegram
    assert 'return;' in telegram and 'Telegram webhook secret is not configured.' not in telegram.split("export function assertTelegramWebhookSecret", 1)[1].split("export async function deliverTelegramNotification", 1)[0]
    assert "const body = `p_${compactUserId}_${expiresAtToken}`" in telegram
    assert "separatorIndex = trimmed.length - telegramLinkTokenSignatureLength - 1" in telegram
    assert "getTelegramUserIdentityRowById" in telegram
    assert "PiScrow Telegram link confirmed." in telegram
    assert 'const piAuthScopes = ["username", "payments", "wallet_address"] as const;' in pi_browser
    assert 'piSessionStorageKey = "piscrow-pi-session-v2"' in app
    assert "Telegram is temporarily rate limiting bot setup" in telegram
    assert "Trade: ${tradeTitle}" in telegram
    assert "Ref: ${notification.tradeId.slice(0, 8)}" in telegram


def assert_delivery_deadline_flow() -> None:
    schema = read("supabase/schema.sql")
    migration = read("supabase/migrations/20260612123000_trade_delivery_deadlines.sql")
    trade_types = read("src/types/trade.ts")
    ui_helpers = read("src/lib/piscrow-ui-helpers.ts")
    trade_deadlines = read("src/lib/trade-deadlines.ts")
    complete_route = read("src/app/api/pi/complete/route.ts")
    incomplete_route = read("src/app/api/pi/incomplete/route.ts")
    delivery_route = read("src/app/api/trades/[tradeId]/delivery/route.ts")
    workspaces = read("src/components/piscrow-workspaces.tsx")
    expiry_server = read("src/server/delivery-expiry.ts")
    expiry_route = read("src/app/api/internal/trades/expire-deliveries/route.ts")
    admin_resolve = read("src/app/api/trades/[tradeId]/admin-resolve/route.ts")

    assert "delivery_due_at timestamptz" in schema
    assert "delivery_expired_at timestamptz" in schema
    assert "trades_delivery_due_idx" in schema
    assert "add column if not exists delivery_due_at timestamptz" in migration
    assert "add column if not exists delivery_expired_at timestamptz" in migration
    assert "deliveryDueAt?: string;" in trade_types
    assert "deliveryExpiredAt?: string;" in trade_types
    assert "DELIVERY_WINDOW_DAYS = 7" in trade_deadlines
    assert "buildDeliveryDueAt" in complete_route
    assert 'delivery_due_at: deliveryDueAt' in complete_route
    assert 'delivery_due_at: deliveryDueAt' in incomplete_route
    assert "DELIVERY_WINDOW_DAYS" in delivery_route
    assert "delivery window" in delivery_route
    assert "deliveryDeadlineDetail" in workspaces
    assert "processExpiredDeliveries" in expiry_server
    assert "Delivery window expired" in expiry_server
    assert "PISCROW_INTERNAL_CRON_TOKEN" in expiry_route
    assert "cancelled_at: parsed.data.status === \"Cancelled\" ? now : null" in admin_resolve


def assert_transaction_explorer_links() -> None:
    pi_platform = read("src/lib/pi-platform.ts")
    app = read("src/components/piscrow-app.tsx")
    workspaces = read("src/components/piscrow-workspaces.tsx")

    assert 'const piBlockExplorerBase = "https://blockexplorer.minepi.com"' in pi_platform
    assert 'const piTestnetBlockExplorerBase = `${piBlockExplorerBase}/testnet`' in pi_platform
    assert 'return normalizedNetwork === "pi network" || normalizedNetwork === "mainnet"' in pi_platform
    assert 'return `${base}/tx/${encodeURIComponent(txid)}`' in pi_platform
    assert 'return `https://blockexplorer.minepi.com/testnet/tx/${encodeURIComponent(txid)}`;' in app
    assert 'const piTestnetExplorerBase = "https://blockexplorer.minepi.com/testnet";' in workspaces
    assert 'parsed.pathname.match(/\\/transactions\\/([^/?#]+)/i)' in workspaces
    assert 'if (trimmedLink?.includes("blockexplorer.minepi.com")) {' in workspaces
    assert 'const piTransactionHashPattern = /^[0-9a-f]{64}$/i;' in workspaces
    assert 'href={explorerLink}' in workspaces


def main() -> None:
    assert_state_transition_guards()
    assert_validation_guards()
    assert_authenticated_workspace_sync()
    assert_authorization_guards()
    assert_payment_amount_and_window_guards()
    assert_handoff_code_release_recovery()
    assert_trade_chat_guards()
    assert_review_copilot_is_recommend_only()
    assert_review_room_copy_consistency()
    assert_demo_payment_visibility()
    assert_no_sensitive_console_logging()
    assert_telegram_link_flow()
    assert_delivery_deadline_flow()
    assert_transaction_explorer_links()


if __name__ == "__main__":
    main()
