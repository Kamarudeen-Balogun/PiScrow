from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def read(relative: str) -> str:
    return (PROJECT_ROOT / relative).read_text(encoding="utf-8")


def assert_state_transition_guards() -> None:
    trade_state = read("src/lib/trade-state.ts")
    dispute_route = read("src/app/api/trades/[tradeId]/dispute/route.ts")
    delivery_route = read("src/app/api/trades/[tradeId]/delivery/route.ts")
    confirm_route = read("src/app/api/trades/[tradeId]/confirm/route.ts")

    assert 'Draft: ["PendingFunding", "Cancelled"]' in trade_state
    assert 'PendingFunding: ["Funded", "Cancelled", "Disputed"]' in trade_state
    assert 'Funded: ["DeliverySubmitted", "Disputed", "Cancelled"]' in trade_state
    assert 'DeliverySubmitted: ["Completed", "Disputed"]' in trade_state
    assert 'Disputed: ["Completed", "Cancelled"]' in trade_state
    assert '["Funded", "DeliverySubmitted"].includes(trade.status)' in dispute_route
    assert 'assertTradeStatus(trade, ["Funded"])' in delivery_route
    assert 'assertTradeStatus(trade, ["DeliverySubmitted"])' in confirm_route


def assert_validation_guards() -> None:
    validation = read("src/lib/validation.ts")
    app = read("src/components/piscrow-app.tsx")
    helpers = read("src/lib/piscrow-ui-helpers.ts")

    assert 'value == null ? "" : value' in validation
    assert "Your buyer response is too short." in validation
    assert "Your buyer response is too short." in helpers
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

    assert "Pi payment amount does not match the trade total." in payments
    assert "calculateBuyerTotal(sellerAmount)" in payments
    assert "Your 20-minute funding window expired." in payments
    assert "Pi payment user does not match the selected buyer." in payments
    assert "assertNoCompletedPayment" in approve_route
    assert "getCompletedPaymentForTrade" in complete_route
    assert "This trade already has a completed payment." in complete_route


def assert_review_copilot_is_recommend_only() -> None:
    review_server = read("src/server/review-copilot.ts")
    migration = read("supabase/migrations/20260608093000_review_recommendations.sql")
    workspaces = read("src/components/piscrow-workspaces.tsx")

    assert "trade_review_recommendations" in migration
    assert "recommended_action in ('release', 'refund', 'request_more_info', 'admin_review')" in migration
    assert "recommendOnly: true" in review_server
    assert "Review copilot only runs on disputed trades." in review_server
    assert "It never releases funds or resolves a" in workspaces
    assert "onRunReview" in workspaces


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
    assert_review_copilot_is_recommend_only()
    assert_no_sensitive_console_logging()


if __name__ == "__main__":
    main()
