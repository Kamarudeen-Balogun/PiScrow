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


def assert_authorization_guards() -> None:
    admin_route = read("src/app/api/trades/[tradeId]/admin-resolve/route.ts")
    review_route = read("src/app/api/trades/[tradeId]/review-copilot/route.ts")
    interest_route = read("src/app/api/trades/[tradeId]/interests/route.ts")
    select_route = read("src/app/api/trades/[tradeId]/select-interest/route.ts")
    dispute_route = read("src/app/api/trades/[tradeId]/dispute/route.ts")

    assert "if (!user.isAdmin)" in admin_route
    assert "Only admins can resolve disputes." in admin_route
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
    assert "PI_WALLET_PRIVATE_SEED" in pi_platform
    assert ".normalize(\"NFKC\")" in pi_platform
    assert "invisible characters" in pi_platform
    assert "normalized length is" in pi_platform
    assert "hasOnlyBase32Chars" in pi_platform
    assert "released_to_seller" in escrow_release
    assert "refunded_to_buyer" in escrow_release


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


def main() -> None:
    assert_state_transition_guards()
    assert_validation_guards()
    assert_authenticated_workspace_sync()
    assert_authorization_guards()
    assert_payment_amount_and_window_guards()
    assert_trade_chat_guards()
    assert_review_copilot_is_recommend_only()
    assert_demo_payment_visibility()
    assert_no_sensitive_console_logging()


if __name__ == "__main__":
    main()
