import json
import os
import re
from pathlib import Path

from playwright.sync_api import Page, expect, sync_playwright


BASE_URL = os.environ.get("PISCROW_BASE_URL", "http://localhost:3000")
DEMO_URL = f"{BASE_URL}/?demo=1"
ARTIFACT_DIR = Path("test-artifacts")


def assert_no_console_errors(errors: list[str]) -> None:
    ignored = [
        "Failed to load resource: the server responded with a status of 404",
        "upload-sync-sw.js",
    ]
    relevant = [
        error for error in errors if not any(ignore in error for ignore in ignored)
    ]
    assert relevant == [], "\n".join(relevant)


def close_sheet(page: Page) -> None:
    close_button = page.get_by_role("button", name="Close", exact=True)
    if close_button.count() > 0:
        close_button.first.click()


def main() -> None:
    ARTIFACT_DIR.mkdir(exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)

        errors: list[str] = []
        page = browser.new_page(viewport={"width": 1440, "height": 1200})
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)

        page.goto(BASE_URL, wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        expect(page.get_by_role("heading", name="PiScrow", exact=True)).to_be_visible()
        expect(page.get_by_text("Consent required")).to_be_visible()
        page.get_by_role("button", name="Reject").click()
        expect(page.get_by_text("Pi login is disabled.")).to_be_visible()
        expect(page.get_by_role("button", name="Connect Pi account")).not_to_be_visible()
        page.get_by_role("button", name="Agree and continue").click()
        expect(page.get_by_role("button", name="Connect Pi account")).to_be_visible()
        expect(page.get_by_role("link", name="Login with demo data")).to_be_visible()
        page.get_by_role("button", name="Connect Pi account").click()
        expect(page.get_by_text("Connection failed").first).to_be_visible(timeout=15000)
        expect(
            page.get_by_text(
                re.compile(
                    r"(Pi login did not finish|Pi SDK is not available|Pi Browser required)",
                    re.IGNORECASE,
                )
            ).first
        ).to_be_visible()
        page.screenshot(path=str(ARTIFACT_DIR / "full-signout-error.png"), full_page=True)

        page.goto(f"{BASE_URL}/?maintenance=1", wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        expect(page.get_by_text("Maintenance notice")).to_be_visible()
        expect(page.get_by_text("App stays online")).to_be_visible()

        rules_page = browser.new_page(viewport={"width": 1200, "height": 900})
        rules_page.goto(f"{BASE_URL}/rules", wait_until="domcontentloaded")
        rules_page.wait_for_load_state("networkidle")
        expect(rules_page.get_by_role("heading", name="Rules, Privacy, And User Agreement")).to_be_visible()
        expect(rules_page.get_by_text("Proof Upload Consent")).to_be_visible()
        expect(rules_page.get_by_text("Admin Review And Disputes")).to_be_visible()
        rules_page.close()

        auth_page = browser.new_page(
            viewport={"width": 1440, "height": 1000},
            user_agent="Mozilla/5.0 PiBrowser/1.0",
        )
        auth_errors: list[str] = []
        auth_page.on(
            "console",
            lambda msg: auth_errors.append(msg.text) if msg.type == "error" else None,
        )
        auth_page.add_init_script(
            """
            window.Pi = {
              init() {},
              authenticate() {
                return new Promise((resolve) => {
                  setTimeout(() => {
                    resolve({
                      user: { uid: 'mock-pi-user', username: 'mock_friend' },
                      accessToken: 'mock-token'
                    });
                  }, 700);
                });
              }
            };
            """
        )
        auth_page.route("**/api/auth/pi", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"user":{"id":"mock-user-id","uid":"mock-pi-user","username":"mock_friend","isAdmin":false}}',
        ))
        auth_page.route("**/api/trades", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"trades":[],"interests":[],"events":[]}',
        ))
        auth_page.route("**/api/notifications", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"notifications":[]}',
        ))
        auth_page.route("**/api/profile", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"profile":{"userId":"mock-user-id","piUsername":"mock_friend","verifiedBadge":false,"payoutReady":true,"payoutReadinessConfirmedAt":"2026-06-07T08:00:00.000Z","successfulTrades":0,"disputedTrades":0,"cancelledTrades":0,"buyCount":0,"sellCount":0,"trustScore":80}}',
        ))
        auth_page.goto(BASE_URL, wait_until="domcontentloaded")
        auth_page.wait_for_load_state("networkidle")
        if auth_page.get_by_role("button", name="Agree and continue").count() > 0:
            auth_page.get_by_role("button", name="Agree and continue").click()
        auth_page.get_by_role("button", name="Connect Pi account").click()
        expect(auth_page.get_by_role("button", name="Connecting...")).to_be_visible()
        expect(
            auth_page.get_by_text(
                "Pi SDK found. Approve the Pi Browser sign-in request to continue."
            ).first
        ).to_be_visible()
        auth_page.screenshot(path=str(ARTIFACT_DIR / "full-auth-loading.png"), full_page=True)
        auth_page.close()

        page.goto(DEMO_URL, wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        expect(page.get_by_role("button", name="Explore", exact=True)).to_be_visible()
        expect(page.get_by_role("button", name="Buy", exact=True)).to_be_visible()
        expect(page.get_by_role("button", name="Sell", exact=True)).to_be_visible()
        expect(page.get_by_role("button", name="Profile", exact=True)).to_be_visible()
        expect(page.get_by_role("button", name="Admin", exact=True)).to_be_visible()
        page.get_by_role("button", name="Open notifications").click()
        expect(page.get_by_text("Notifications", exact=True)).to_be_visible()
        expect(page.get_by_text("No unread notifications right now.")).to_be_visible()
        page.get_by_role("button", name="Open notifications").click()

        page.get_by_text("Used Android phone barter").first.click()
        expect(page.get_by_text("This is your listing.")).to_be_visible()
        expect(page.get_by_placeholder("Optional note to help the seller choose you.")).not_to_be_visible()
        close_sheet(page)

        page.get_by_text("Private spare parts offer").first.click()
        expect(page.get_by_role("button", name="Decline private request")).to_be_visible()
        page.get_by_role("button", name="Submit Interest").click()
        expect(page.get_by_text("Your response is open.")).to_be_visible()
        close_sheet(page)

        page.get_by_role("button", name="Sell", exact=True).click()
        expect(page.get_by_text("My Listings")).to_be_visible()
        expect(page.get_by_text("Used Android phone barter").first).to_be_visible()
        expect(page.get_by_text("Computer Village").first).to_be_visible()
        page.get_by_text("Used Android phone barter").first.click()
        page.get_by_role("button", name="Select buyer").first.click()
        expect(page.get_by_text("Buyer selected").first).to_be_visible()
        close_sheet(page)

        page.get_by_role("button", name="New Listing").click()
        expect(page.get_by_text("Create Listing")).to_be_visible()
        page.get_by_placeholder("Used Android phone barter").fill("Full QA delete test")
        page.get_by_placeholder("Describe condition, quantity, handoff details, and what buyers should know.").fill(
            "A public test listing that will be deleted before any buyer selection."
        )
        page.get_by_role("button", name="Continue").click()
        page.get_by_placeholder("Ikeja, Lagos").fill("Ikeja, Lagos")
        page.get_by_placeholder("Computer Village").fill("Alausa")
        page.get_by_role("button", name="Continue").click()
        page.get_by_placeholder("0.00").fill("5")
        page.get_by_placeholder("How will handoff, delivery proof, and receipt confirmation work?").fill(
            "Seller can delete this before any buyer is selected."
        )
        page.get_by_role("button", name="Publish Offer").click()
        expect(page.get_by_text("Full QA delete test").first).to_be_visible()
        page.get_by_text("Full QA delete test").first.click()
        page.get_by_role("button", name="Delete offer").first.click()
        expect(page.get_by_text("Delete this offer?")).to_be_visible()
        page.get_by_role("alertdialog").get_by_role("button", name="Delete offer").click()
        expect(page.get_by_text("Offer deleted").first).to_be_visible()
        close_sheet(page)

        page.get_by_role("button", name="Buy", exact=True).click()
        expect(page.get_by_text("Active Escrows")).to_be_visible()
        expect(page.get_by_text("Awaiting release shoe delivery").first).to_be_visible()
        page.get_by_text("Awaiting release shoe delivery").first.click()
        expect(page.get_by_text("Transaction Tracking")).to_be_visible()
        expect(page.get_by_text("Buyer receipt proof")).to_be_visible()
        close_sheet(page)

        page.get_by_role("button", name="Explore", exact=True).click()
        expect(page.get_by_text("Live Ledger")).to_be_visible()
        expect(page.get_by_text("Platform fees")).not_to_be_visible()
        page.get_by_role("button", name="Activity").click()
        expect(page.get_by_role("heading", name="Live Activity")).to_be_visible()
        page.screenshot(path=str(ARTIFACT_DIR / "full-ledger.png"), full_page=True)
        page.get_by_role("button", name="Ledger").click()

        feedback_requests = []

        def capture_feedback(route):
            feedback_requests.append(json.loads(route.request.post_data or "{}"))
            route.fulfill(
                status=200,
                content_type="application/json",
                body='{"ok":true,"webhookStatus":"not_configured"}',
            )

        page.route("**/api/feedback", capture_feedback)
        page.get_by_role("button", name="Profile", exact=True).click()
        expect(page.get_by_text("Payout Readiness")).to_be_visible()
        expect(page.get_by_text("Telegram Alerts")).to_be_visible()
        expect(page.get_by_text("Verified badge active")).to_be_visible()
        page.get_by_role("button", name="Give feedback").click()
        expect(page.get_by_role("heading", name="Give feedback")).to_be_visible()
        page.get_by_label("Type").select_option("improvement")
        page.get_by_placeholder("What should PiScrow improve, fix, or add next?").fill(
            "Please add clearer payment recovery status for testnet reviewers."
        )
        page.get_by_placeholder("Optional").fill("reviewer@example.com")
        page.get_by_role("button", name="Send feedback").click()
        expect(page.get_by_text("Feedback sent").first).to_be_visible()
        assert feedback_requests
        assert feedback_requests[0]["category"] == "improvement"
        assert feedback_requests[0]["contactEmail"] == "reviewer@example.com"
        close_sheet(page)
        page.screenshot(path=str(ARTIFACT_DIR / "full-profile.png"), full_page=True)

        page.get_by_role("button", name="Admin", exact=True).click()
        expect(page.get_by_text("Dispute Queue")).to_be_visible()
        expect(page.get_by_text("Verified Badge Requests")).to_be_visible()
        expect(page.get_by_text("@market_runner", exact=True)).to_be_visible()
        page.get_by_role("button", name="Approve badge").click()
        expect(page.get_by_text("Approve verified badge?")).to_be_visible()
        page.get_by_role("alertdialog").get_by_role("button", name="Approve badge").click()
        expect(page.get_by_text("Verified badge approved").first).to_be_visible()
        page.get_by_role("button", name="Enter Dispute Room").first.click()
        admin_sheet = page.get_by_role("dialog").last
        expect(admin_sheet.get_by_role("heading", name="Laptop repair deposit")).to_be_visible()
        expect(admin_sheet.get_by_text("Review copilot")).to_be_visible()
        expect(admin_sheet.get_by_text("Request buyer update", exact=True)).to_be_visible()
        expect(admin_sheet.get_by_text("Request seller update", exact=True)).to_be_visible()
        if admin_sheet.get_by_role("button", name="Join room").count() > 0:
            admin_sheet.get_by_role("button", name="Join room").click()
            expect(page.get_by_text("Dispute room joined").first).to_be_visible()
        admin_sheet.get_by_placeholder("Ask the buyer what they received").fill(
            "Please confirm whether the replacement part arrived and upload any receipt proof."
        )
        admin_sheet.get_by_role("button", name="Send request").first.click()
        expect(page.get_by_text("Follow-up requested").first).to_be_visible()
        admin_sheet.get_by_role("button", name="Release to seller").click()
        expect(page.get_by_text("Release seller payout?")).to_be_visible()
        page.get_by_role("button", name="Release payout").click()
        expect(page.get_by_text("Payout completed").first).to_be_visible()
        page.screenshot(path=str(ARTIFACT_DIR / "full-admin-resolved.png"), full_page=True)
        close_sheet(page)

        mobile = browser.new_page(viewport={"width": 390, "height": 900})
        mobile_errors: list[str] = []
        mobile.on(
            "console",
            lambda msg: mobile_errors.append(msg.text) if msg.type == "error" else None,
        )
        mobile.goto(DEMO_URL, wait_until="domcontentloaded")
        mobile.wait_for_load_state("networkidle")
        expect(mobile.get_by_role("button", name="Explore", exact=True)).to_be_visible()
        mobile.get_by_role("button", name="Activity").click()
        expect(mobile.get_by_role("heading", name="Live Activity")).to_be_visible()
        mobile.screenshot(path=str(ARTIFACT_DIR / "full-mobile-ledger.png"), full_page=True)

        assert_no_console_errors(errors)
        assert_no_console_errors(auth_errors)
        assert_no_console_errors(mobile_errors)

        browser.close()


if __name__ == "__main__":
    main()
