import os
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


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
        expect(page.get_by_label("Switch workspace")).not_to_be_visible()
        page.get_by_role("button", name="Connect Pi account").click()
        expect(page.get_by_text("Pi Browser required").first).to_be_visible()
        expect(page.get_by_text("Pi login only works inside Pi Browser").first).to_be_visible()
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
        auth_page.goto(BASE_URL, wait_until="domcontentloaded")
        auth_page.wait_for_load_state("networkidle")
        auth_page.evaluate(
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
        if auth_page.get_by_role("button", name="Agree and continue").count() > 0:
            auth_page.get_by_role("button", name="Agree and continue").click()
        auth_page.get_by_role("button", name="Connect Pi account").click()
        expect(auth_page.get_by_role("button", name="Connecting...")).to_be_visible()
        expect(auth_page.get_by_text("Pi account connected")).to_be_visible()
        expect(auth_page.get_by_role("button", name=re.compile("^Admin$"))).not_to_be_visible()
        auth_page.screenshot(path=str(ARTIFACT_DIR / "full-auth-loading.png"), full_page=True)

        page.goto(DEMO_URL, wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        expect(page.get_by_text("Demo workspace")).to_be_visible()
        expect(page.get_by_label("Switch workspace")).to_be_visible()
        expect(page.get_by_role("button", name=re.compile("^Buyer$"))).to_be_visible()
        expect(page.get_by_role("button", name=re.compile("^Seller$"))).to_be_visible()
        expect(page.get_by_role("button", name=re.compile("^Ledger$"))).to_be_visible()
        expect(page.get_by_role("button", name=re.compile("^Admin$"))).to_be_visible()

        own_offer_notice = page.get_by_text("This is your seller offer.")
        try:
            expect(own_offer_notice).to_be_visible(timeout=1000)
        except AssertionError:
            page.get_by_text("Used Android phone barter").first.click()
            expect(own_offer_notice).to_be_visible()
        expect(page.get_by_placeholder("Tell the seller why you are the right buyer")).not_to_be_visible()

        page.get_by_text("Private spare parts offer").first.click()
        expect(page.get_by_text("Private requested trade from @market_runner")).to_be_visible()
        expect(page.get_by_role("button", name="Decline request")).to_be_visible()
        page.get_by_placeholder("Tell the seller why you are the right buyer").fill(
            "I know the exact model and can fund once the seller chooses me."
        )
        page.get_by_role("button", name="Show interest").click()
        expect(page.get_by_text("Your response is open.")).to_be_visible()

        page.get_by_role("button", name=re.compile("^Seller$")).click()
        expect(page.get_by_text("Post Seller Offer")).to_be_visible()
        expect(page.get_by_text("Used Android phone barter").first).to_be_visible()
        expect(page.get_by_text("Computer Village").first).to_be_visible()
        page.get_by_text("Funded camera lens handoff").first.click()
        expect(page.get_by_text("Package Sent Proof")).to_be_visible()
        expect(page.get_by_label("Package proof image")).to_be_visible()
        page.get_by_role("button", name="Select buyer").first.click()
        expect(page.get_by_text("Seller @lagos_phone_hub selected @abuja_tradehub").first).to_be_visible()

        page.get_by_placeholder("Offer title").fill("Full QA private test")
        page.get_by_placeholder("Item or service details").fill(
            "A private test listing used to verify the one-buyer request UI."
        )
        page.get_by_placeholder("Seller price in Test Pi").fill("9.5")
        page.get_by_placeholder("Trade location").fill("Ajah, Lagos")
        page.get_by_placeholder("Area or pickup zone").fill("Sangotedo")
        page.get_by_role("button", name="Private").click()
        page.get_by_placeholder("@buyer_username").fill("@pi_buyer_demo")
        page.get_by_placeholder("Delivery terms and confirmation rules").fill(
            "Seller will upload package proof before buyer confirms receipt."
        )
        page.get_by_role("button", name="Post offer").click()
        expect(page.get_by_text("Full QA private test").first).to_be_visible()
        expect(page.get_by_placeholder("@buyer_username")).not_to_be_visible()

        page.get_by_placeholder("Offer title").fill("Full QA delete test")
        page.get_by_placeholder("Item or service details").fill(
            "A public test listing that will be deleted before buyer selection."
        )
        page.get_by_placeholder("Seller price in Test Pi").fill("5")
        page.get_by_placeholder("Trade location").fill("Ikeja, Lagos")
        page.get_by_placeholder("Delivery terms and confirmation rules").fill(
            "Seller can delete this before any buyer is selected."
        )
        page.get_by_role("button", name="Post offer").click()
        expect(page.get_by_text("Full QA delete test").first).to_be_visible()
        page.get_by_text("Full QA delete test").first.click()
        page.get_by_role("button", name="Delete offer").first.click()
        expect(page.get_by_text("Offer deleted").first).to_be_visible()

        page.get_by_role("button", name=re.compile("^Ledger$")).click()
        expect(page.get_by_text("Transparent Activity")).to_be_visible()
        expect(page.get_by_text("Post Seller Offer")).not_to_be_visible()
        expect(page.get_by_text("Platform fees")).not_to_be_visible()
        expect(page.get_by_label("PiScrow notifications")).not_to_be_visible()
        expect(page.get_by_text("Full QA private test").first).to_be_visible()
        page.screenshot(path=str(ARTIFACT_DIR / "full-ledger.png"), full_page=True)

        page.get_by_role("button", name=re.compile("^Admin$")).click()
        expect(page.get_by_text("Laptop repair deposit")).to_be_visible()
        expect(page.get_by_text("Seller package proof")).to_be_visible()
        expect(page.get_by_text("Seller proof image / link")).to_be_visible()
        page.get_by_role("button", name="Release after review").click()
        expect(page.get_by_text("Dispute resolved").first).to_be_visible()
        page.screenshot(path=str(ARTIFACT_DIR / "full-admin-resolved.png"), full_page=True)

        mobile = browser.new_page(viewport={"width": 390, "height": 900})
        mobile_errors: list[str] = []
        mobile.on(
            "console",
            lambda msg: mobile_errors.append(msg.text) if msg.type == "error" else None,
        )
        mobile.goto(DEMO_URL, wait_until="domcontentloaded")
        mobile.wait_for_load_state("networkidle")
        expect(mobile.get_by_role("heading", name="PiScrow", exact=True)).to_be_visible()
        expect(mobile.get_by_label("Switch workspace")).to_be_visible()
        mobile.get_by_role("button", name=re.compile("^Ledger$")).click()
        expect(mobile.get_by_text("Transparent Activity")).to_be_visible()
        mobile.screenshot(path=str(ARTIFACT_DIR / "full-mobile-ledger.png"), full_page=True)

        assert_no_console_errors(errors)
        assert_no_console_errors(auth_errors)
        assert_no_console_errors(mobile_errors)

        browser.close()


if __name__ == "__main__":
    main()
