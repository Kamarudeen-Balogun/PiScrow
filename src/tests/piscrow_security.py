import os

from playwright.sync_api import APIRequestContext, sync_playwright


BASE_URL = os.environ.get("PISCROW_BASE_URL", "http://localhost:3000")


def assert_security_headers(response) -> None:
    headers = response.headers
    assert headers.get("x-content-type-options") == "nosniff"
    assert headers.get("referrer-policy") == "strict-origin-when-cross-origin"
    assert headers.get("x-frame-options") == "DENY"
    assert "camera=()" in headers.get("permissions-policy", "")


def main() -> None:
    with sync_playwright() as playwright:
        api = playwright.request.new_context(base_url=BASE_URL)

        health = api.get("/api/health")
        assert health.ok
        assert_security_headers(health)

        rules = api.get("/rules")
        assert rules.ok
        assert_security_headers(rules)

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


if __name__ == "__main__":
    main()
