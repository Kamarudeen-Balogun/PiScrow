import os
import re
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
        expect(desktop.get_by_label("Switch workspace")).not_to_be_visible()
        desktop.screenshot(
            path=str(ARTIFACT_DIR / "piscrow-signin.png"),
            full_page=True,
        )
        desktop.get_by_role("link", name="Login with demo data").click()
        expect(desktop).to_have_url(re.compile(r".*\?demo=1"))
        expect(desktop.get_by_text("Demo workspace")).to_be_visible()
        expect(desktop.get_by_label("Switch workspace")).to_be_visible()
        expect(desktop.get_by_text("Used Android phone barter").first).to_be_visible()

        desktop.goto(f"{BASE_URL}/rules", wait_until="domcontentloaded")
        desktop.wait_for_load_state("networkidle")
        expect(desktop.get_by_role("heading", name="Rules, Privacy, And User Agreement")).to_be_visible()
        expect(desktop.get_by_text("Testnet Disclaimer")).to_be_visible()

        desktop.goto(DEMO_URL, wait_until="domcontentloaded")
        desktop.wait_for_load_state("networkidle")
        expect(desktop.get_by_text("Demo workspace")).to_be_visible()
        desktop.screenshot(
            path=str(ARTIFACT_DIR / "piscrow-desktop.png"),
            full_page=True,
        )

        expect(desktop.get_by_label("Switch workspace")).to_be_visible()
        expect(desktop.get_by_text("Buyer").first).to_be_visible()
        expect(desktop.get_by_text("Profile").first).to_be_visible()
        expect(desktop.get_by_text("Private spare parts offer").first).to_be_visible()
        desktop.get_by_text("Private spare parts offer").first.click()
        desktop.get_by_role("button", name="Show interest").click()
        expect(desktop.get_by_role("alertdialog")).to_be_visible()
        expect(desktop.get_by_text("Action needed")).to_be_visible()
        expect(desktop.get_by_text("Add a short response so the seller can compare buyers.")).to_be_visible()
        desktop.get_by_role("button", name="Got it").click()
        desktop.get_by_placeholder("Tell the seller why you are the right buyer").fill(
            "I can confirm the model today and fund immediately after selection."
        )
        desktop.get_by_role("button", name="Show interest").click()
        expect(desktop.get_by_text("Your response is open.")).to_be_visible()

        desktop.get_by_role("button", name=re.compile("^Seller$")).click()
        expect(desktop.get_by_text("Post Seller Offer")).to_be_visible()
        expect(desktop.get_by_text("Used Android phone barter").first).to_be_visible()
        expect(desktop.get_by_text("@abuja_tradehub").first).to_be_visible()
        desktop.get_by_role("button", name="Select buyer").first.click()
        expect(desktop.get_by_text("Seller selected @abuja_tradehub").first).to_be_visible()

        desktop.get_by_placeholder("Offer title").fill("Playwright market test")
        desktop.get_by_placeholder("Item or service details").fill(
            "A controlled smoke-test seller offer created by Playwright."
        )
        desktop.get_by_placeholder("Seller price in Test Pi").fill("12.75")
        desktop.get_by_placeholder("Trade location").fill("Surulere, Lagos")
        desktop.get_by_placeholder("Area or pickup zone").fill("Bode Thomas")
        desktop.get_by_placeholder("Delivery terms and confirmation rules").fill(
            "Seller submits delivery proof before buyer confirms receipt."
        )
        desktop.get_by_role("button", name="Post offer").click()
        expect(desktop.get_by_text("Playwright market test").first).to_be_visible()
        desktop.screenshot(
            path=str(ARTIFACT_DIR / "piscrow-seller-desk.png"),
            full_page=True,
        )

        desktop.get_by_role("button", name=re.compile("^Ledger$")).click()
        expect(desktop.get_by_text("Transparent Activity")).to_be_visible()
        expect(desktop.get_by_text("Live Activity")).to_be_visible()
        desktop.screenshot(
            path=str(ARTIFACT_DIR / "piscrow-ledger.png"),
            full_page=True,
        )

        desktop.get_by_role("button", name=re.compile("^Profile$")).click()
        expect(desktop.get_by_text("Trust score", exact=True)).to_be_visible()
        expect(desktop.get_by_text("Your Recent Trade History")).to_be_visible()
        expect(desktop.get_by_role("button", name="Verified")).to_be_visible()
        desktop.screenshot(
            path=str(ARTIFACT_DIR / "piscrow-profile.png"),
            full_page=True,
        )

        desktop.get_by_role("button", name=re.compile("^Admin$")).click()
        expect(desktop.get_by_text("Verified Badge Requests")).to_be_visible()
        expect(desktop.get_by_role("button", name="Approve badge")).to_be_visible()
        desktop.get_by_role("button", name="Approve badge").first.click()
        expect(desktop.get_by_text("Approve verified badge?")).to_be_visible()
        desktop.get_by_role("button", name="Cancel").click()
        expect(desktop.get_by_text("Laptop repair deposit")).to_be_visible()
        expect(desktop.get_by_role("button", name="Approve seller release")).to_be_visible()
        expect(desktop.get_by_role("button", name="Approve buyer refund")).to_be_visible()
        desktop.screenshot(
            path=str(ARTIFACT_DIR / "piscrow-admin.png"),
            full_page=True,
        )

        mobile = browser.new_page(viewport={"width": 390, "height": 900})
        mobile.goto(DEMO_URL, wait_until="domcontentloaded")
        mobile.wait_for_load_state("networkidle")
        expect(mobile.get_by_role("heading", name="PiScrow", exact=True)).to_be_visible()
        expect(mobile.get_by_role("button", name="Open workspace menu")).to_be_visible()
        mobile.get_by_role("button", name="Open workspace menu").click()
        expect(mobile.get_by_role("dialog", name="Workspace menu")).to_be_visible()
        expect(mobile.get_by_role("button", name=re.compile("^Ledger"))).to_be_visible()
        mobile.screenshot(
            path=str(ARTIFACT_DIR / "piscrow-mobile.png"),
            full_page=True,
        )

        browser.close()


if __name__ == "__main__":
    main()
