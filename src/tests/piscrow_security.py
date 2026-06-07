import os
from pathlib import Path

from playwright.sync_api import APIRequestContext, sync_playwright


BASE_URL = os.environ.get("PISCROW_BASE_URL", "http://localhost:3000")
PROJECT_ROOT = Path(__file__).resolve().parents[2]


def assert_security_headers(response) -> None:
    headers = response.headers
    assert headers.get("x-content-type-options") == "nosniff"
    assert headers.get("referrer-policy") == "strict-origin-when-cross-origin"
    assert "camera=()" in headers.get("permissions-policy", "")


def assert_source_guardrails() -> None:
    approve_route = PROJECT_ROOT / "src" / "app" / "api" / "pi" / "approve" / "route.ts"
    complete_route = PROJECT_ROOT / "src" / "app" / "api" / "pi" / "complete" / "route.ts"
    incomplete_route = PROJECT_ROOT / "src" / "app" / "api" / "pi" / "incomplete" / "route.ts"
    payment_guard = PROJECT_ROOT / "src" / "server" / "pi-payments.ts"
    migration = (
        PROJECT_ROOT
        / "supabase"
        / "migrations"
        / "20260607042000_trade_immutability_and_payment_guards.sql"
    )

    approve_source = approve_route.read_text(encoding="utf-8")
    complete_source = complete_route.read_text(encoding="utf-8")
    incomplete_source = incomplete_route.read_text(encoding="utf-8")
    payment_guard_source = payment_guard.read_text(encoding="utf-8")
    migration_source = migration.read_text(encoding="utf-8")

    assert "assertNoCompletedPayment" in approve_source
    assert "This trade already has a completed payment." in complete_source
    assert "This trade already has a completed payment." in payment_guard_source
    assert "getPiPayment" in incomplete_source
    assert "completePiPayment" in incomplete_source
    assert "PiScrow escrow funding" in payment_guard_source
    assert "payment.user_uid" in payment_guard_source
    assert "metadataString(metadata, \"tradeId\")" in payment_guard_source
    assert "prevent_funded_trade_identity_changes" in migration_source
    assert "payments_one_completed_per_trade_idx" in migration_source


def main() -> None:
    assert_source_guardrails()

    with sync_playwright() as playwright:
        api = playwright.request.new_context(base_url=BASE_URL)

        health = api.get("/api/health")
        assert health.ok
        assert_security_headers(health)

        rules = api.get("/rules")
        assert rules.ok
        assert_security_headers(rules)
        assert rules.headers.get("x-frame-options") is None

        oversized = api.post(
            "/api/pi/approve",
            headers={
                "content-type": "application/json",
                "x-forwarded-for": "198.51.100.44",
            },
            data={
                "paymentId": "payment-test",
                "tradeId": "trade-test",
                "padding": "x" * 30000,
            },
        )
        assert oversized.status == 502
        assert oversized.json()["error"] == "PiScrow could not complete this request. Please try again."
        assert_security_headers(oversized)

        api.dispose()

    client_bundle_dir = PROJECT_ROOT / ".next" / "static"
    forbidden_values = [
        os.environ.get("PI_NETWORK_API_KEY", ""),
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""),
        os.environ.get("UPSTASH_REDIS_REST_TOKEN", ""),
    ]
    forbidden_values = [value for value in forbidden_values if len(value) >= 12]

    if client_bundle_dir.exists() and forbidden_values:
        for bundle in client_bundle_dir.rglob("*"):
            if bundle.is_file() and bundle.suffix in {".js", ".json", ".html"}:
                content = bundle.read_text(encoding="utf-8", errors="ignore")
                for secret in forbidden_values:
                    assert secret not in content, f"Secret leaked in client bundle: {bundle}"


if __name__ == "__main__":
    main()
