# Server Modules

This folder contains server-only PiScrow services used by App Router API routes.

## Responsibilities

- authenticate and authorize users
- enforce trade-state rules
- read and write Supabase data
- sign or verify sensitive workflow actions
- coordinate Pi Platform payment completion
- manage notifications, Telegram integration, review logic, and chat lifecycle

## Key modules

- `auth.ts`: user identity and admin checks
- `trades.ts`: trade reads, mapping, and core trade assertions
- `pi-payments.ts`: Pi funding validation and payment guardrails
- `escrow-release.ts`: seller payout and buyer refund orchestration
- `trade-chat.ts`: trade room lifecycle and message helpers
- `trade-handoff.ts`: one-time handoff code generation and verification
- `telegram.ts`: Telegram linking, webhook handling, and notifications
- `delivery-expiry.ts`: delivery deadline evaluation and auto-refund support
- `security.ts`: rate limiting, secure JSON responses, and request guardrails

## Design expectations

- Never expose secrets from this folder to client bundles.
- Prefer explicit trade assertions before mutating state.
- Keep API routes thin; move reusable logic here.
- Treat Pi release/refund actions as idempotent, auditable workflows.
