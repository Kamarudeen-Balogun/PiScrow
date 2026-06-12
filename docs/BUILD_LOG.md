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

The screenshot set was refreshed on June 12, 2026 from passing smoke and
full-site Playwright runs after the latest redesign and payout-readiness work.

## Recent Implementation Update

The following changes were completed in the current working tree after the previous screenshot refresh cycle:

- Added one-time buyer handoff code generation and seller verification flow.
- Added handoff code copy action in the buyer reveal dialog.
- Fixed Pi app wallet seed normalization and admin release/refund execution.
- Corrected Pi explorer links to the active Pi testnet explorer path.
- Stopped rendering explorer buttons for invalid or placeholder transaction hashes.
- Changed server-signed payout/refund memos to readable on-chain text:
  - `PiScrow seller payout`
  - `PiScrow buyer refund`
- Added public-ledger cached fallback behavior for short Supabase read outages.
- Prioritized active trades ahead of completed/cancelled trades in the public ledger.
- Rewrote the root README and added local README files for source, server, tests, scripts, docs, and Supabase.

## Knowledge Graph Tooling Update On 2026-06-12

Graphify and Foam support were wired into the local developer workflow for this
project.

- Installed `graphifyy[mcp]` and the required Python SDK dependencies.
- Registered a local custom Graphify provider against the existing OpenAI-compatible
  `freemodel` gateway on this machine.
- Built the PiScrow graph successfully:
  - `807` nodes
  - `2356` edges
  - `67` communities
- Generated:
  - `graphify-out/graph.json`
  - `graphify-out/GRAPH_REPORT.md`
  - `graphify-out/graph.html`
  - `graphify-out/wiki/index.md`
  - `graphify-out/obsidian/`
- Installed the project-level Graphify Codex hook into `AGENTS.md` and `.codex/hooks.json`.
- Appended the Graphify MCP server block to the global Codex config so a reloaded
  Codex session can expose Graphify MCP tools.

Operational note:

- `graphify update .` is enough after code-only edits.
- Markdown/Foam note changes require a semantic rebuild with `graphify extract ...`.
