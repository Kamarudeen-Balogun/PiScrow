# PiScrow Build Log

PiScrow is a Pi Testnet/Sandbox marketplace prototype for safer peer-to-peer barter workflows. The starting pain point is simple: informal Pi trades need clearer buyer selection, payment proof, delivery evidence, dispute handling, and public activity logs before people can trust each other.

## What PiScrow Demonstrates

- Sellers post public or private offers.
- Many buyers can show interest with short responses.
- The seller selects one active buyer.
- The selected buyer gets a 1-hour Test Pi funding window.
- Payment routes verify amount, buyer identity, trade state, and duplicate completion.
- Sellers and buyers upload delivery/receipt proof.
- Funded trades open a private buyer/seller chat room for delivery updates and proof.
- Disputed chats can be claimed by one admin for resolution.
- Disputes freeze the trade and move it to admin review.
- Public ledger activity shows listings, selections, funding, delivery, disputes, and outcomes.
- Profile trust scores and admin-approved verified badges help buyers and sellers judge risk.

## Testnet Boundary

PiScrow is not a Mainnet app and does not claim to be legal escrow. It is built for Pi Testnet/Sandbox validation only. Release/refund behavior is recorded as an MVP workflow until supported payout behavior is confirmed for the target Pi environment.

## Current Showcase Evidence

Curated screenshots live in `docs/screenshots/`:

- Consent and sign-in state.
- Explore feed and compact live listings.
- Seller desk with funded-trade proof workflow.
- Public activity ledger and timeline view.
- Profile trust score, payout readiness, and badge state.
- Admin dispute room and review assistant controls.
- Mobile ledger/profile captures from the current responsive layout.

The screenshot set was refreshed on June 10, 2026 from passing smoke and
full-site Playwright runs after the latest redesign and payout-readiness work.

## Remaining Real-World Validation

These checks need live accounts or external portals:

- Apply Supabase migrations to the linked project.
- Confirm Vercel env vars for Supabase, Pi, and Upstash.
- Confirm Pi Developer Portal legal/privacy URL fields.
- Test Pi Browser auth on the deployed URL.
- Capture real Pi Browser Test Pi payment screenshots.
- Run 20 successful testnet trade simulations with external testers.

