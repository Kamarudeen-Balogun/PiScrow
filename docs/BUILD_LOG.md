# PiScrow Build Log

PiScrow is a Pi Testnet/Sandbox marketplace prototype for safer peer-to-peer barter workflows. The starting pain point is simple: informal Pi trades need clearer buyer selection, payment proof, delivery evidence, dispute handling, and public activity logs before people can trust each other.

## What PiScrow Demonstrates

- Sellers post public or private offers.
- Many buyers can show interest with short responses.
- The seller selects one active buyer.
- The selected buyer gets a 20-minute Test Pi funding window.
- Payment routes verify amount, buyer identity, trade state, and duplicate completion.
- Sellers and buyers upload delivery/receipt proof.
- Disputes freeze the trade and move it to admin review.
- Public ledger activity shows listings, selections, funding, delivery, disputes, and outcomes.
- Profile trust scores and admin-approved verified badges help buyers and sellers judge risk.

## Testnet Boundary

PiScrow is not a Mainnet app and does not claim to be legal escrow. It is built for Pi Testnet/Sandbox validation only. Release/refund behavior is recorded as an MVP workflow until supported payout behavior is confirmed for the target Pi environment.

## Current Showcase Evidence

Curated screenshots live in `docs/screenshots/`:

- Consent and sign-in state.
- Buyer marketplace and seller offers.
- Seller desk with buyer responses.
- Public activity ledger.
- Profile trust score and verified badge state.
- Admin review tools.
- Mobile layout.

## Remaining Real-World Validation

These checks need live accounts or external portals:

- Apply Supabase migrations to the linked project.
- Confirm Vercel env vars for Supabase, Pi, and Upstash.
- Confirm Pi Developer Portal legal/privacy URL fields.
- Test Pi Browser auth on the deployed URL.
- Capture real Pi Browser Test Pi payment screenshots.
- Run 20 successful testnet trade simulations with external testers.

