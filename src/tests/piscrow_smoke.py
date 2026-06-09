import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.environ.get("PISCROW_BASE_URL", "http://localhost:3000")
DEMO_URL = f"{BASE_URL}/?demo=1"
ARTIFACT_DIR = Path("test-artifacts")


def main() -> None:
    ARTIFACT_DIR.mkdir(exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)

        desktop = browser.new_page(viewport={"width": 1440, "height": 1100})
        desktop.goto(BASE_URL, wait_until="domcontentloaded")
        desktop.wait_for_load_state("networkidle")
        expect(desktop.get_by_role("heading", name="PiScrow", exact=True)).to_be_visible()
        expect(desktop.get_by_text("Pi Testnet / Sandbox")).to_be_visible()
        expect(desktop.get_by_text("Consent required")).to_be_visible()
        expect(desktop.get_by_role("button", name="Agree and continue")).to_be_visible()
        expect(desktop.get_by_role("link", name="Login with demo data")).to_be_visible()
        expect(desktop.get_by_role("button", name="Connect Pi account")).not_to_be_visible()
        desktop.get_by_role("button", name="Agree and continue").click()
        expect(desktop.get_by_role("button", name="Connect Pi account")).to_be_visible()
        expect(desktop.get_by_role("link", name="Login with demo data")).to_be_visible()
        desktop.screenshot(
            path=str(ARTIFACT_DIR / "01-signin-consent.png"),
            full_page=True,
        )

        desktop.goto(f"{BASE_URL}/rules", wait_until="domcontentloaded")
        desktop.wait_for_load_state("networkidle")
        expect(desktop.get_by_role("heading", name="Rules, Privacy, And User Agreement")).to_be_visible()
        expect(desktop.get_by_text("Testnet Disclaimer")).to_be_visible()
        expect(desktop.get_by_text("Feedback And Support")).to_be_visible()

        desktop.goto(DEMO_URL, wait_until="domcontentloaded")
        desktop.wait_for_load_state("networkidle")
        expect(desktop.get_by_role("button", name="Explore", exact=True)).to_be_visible()
        expect(desktop.get_by_text("Used Android phone barter").first).to_be_visible()
        desktop.screenshot(
            path=str(ARTIFACT_DIR / "02-marketplace.png"),
            full_page=True,
        )

        desktop.get_by_role("button", name="Sell", exact=True).click()
        expect(desktop.get_by_text("My Listings")).to_be_visible()
        desktop.get_by_text("Funded camera lens handoff").first.click()
        expect(desktop.get_by_text("Package Sent Proof")).to_be_visible()
        desktop.screenshot(
            path=str(ARTIFACT_DIR / "03-seller-desk.png"),
            full_page=True,
        )
        desktop.get_by_role("button", name="Close", exact=True).click()

        desktop.get_by_role("button", name="Explore", exact=True).click()
        desktop.get_by_role("button", name="Activity").click()
        expect(desktop.get_by_role("heading", name="Live Activity")).to_be_visible()
        desktop.screenshot(
            path=str(ARTIFACT_DIR / "04-public-ledger.png"),
            full_page=True,
        )
        desktop.get_by_role("button", name="Ledger").click()

        desktop.get_by_role("button", name="Profile", exact=True).click()
        expect(desktop.get_by_text("Payout Readiness")).to_be_visible()
        expect(desktop.get_by_text("In-app Notifications")).to_be_visible()
        desktop.screenshot(
            path=str(ARTIFACT_DIR / "05-profile.png"),
            full_page=True,
        )

        desktop.get_by_role("button", name="Admin", exact=True).click()
        expect(desktop.get_by_text("Dispute Queue")).to_be_visible()
        desktop.get_by_role("button", name="Enter Dispute Room").first.click()
        expect(desktop.get_by_text("Review assistant")).to_be_visible()
        desktop.screenshot(
            path=str(ARTIFACT_DIR / "06-admin-review.png"),
            full_page=True,
        )
        desktop.get_by_role("button", name="Close", exact=True).click()

        mobile = browser.new_page(viewport={"width": 390, "height": 900})
        mobile.goto(DEMO_URL, wait_until="domcontentloaded")
        mobile.wait_for_load_state("networkidle")
        expect(mobile.get_by_role("button", name="Explore", exact=True)).to_be_visible()
        mobile.get_by_role("button", name="Activity").click()
        expect(mobile.get_by_role("heading", name="Live Activity")).to_be_visible()
        mobile.screenshot(
            path=str(ARTIFACT_DIR / "07-mobile-ledger.png"),
            full_page=True,
        )
        mobile.get_by_role("button", name="Ledger").click()
        mobile.get_by_role("button", name="Profile", exact=True).click()
        expect(mobile.get_by_text("Payout Readiness")).to_be_visible()
        mobile.screenshot(
            path=str(ARTIFACT_DIR / "08-mobile-workspace-menu.png"),
            full_page=True,
        )

        browser.close()


if __name__ == "__main__":
    main()
