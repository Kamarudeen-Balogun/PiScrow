# Source Architecture

This folder contains the PiScrow application code.

## Layout

- `app/`: Next.js App Router entrypoints, pages, and API routes
- `components/`: client UI and workspace surfaces
- `lib/`: shared client/server helpers, validation, fees, copy, and Pi integration helpers
- `server/`: server-only business logic modules used by API routes
- `tests/`: Playwright and regression/security scripts
- `types/`: shared TypeScript contracts

## High-level flow

1. UI interactions are handled in `components/`.
2. Client actions call API routes in `app/api/`.
3. API routes delegate business logic to `server/`.
4. Shared validation, fee math, copy, and status helpers live in `lib/`.
5. Shared DTOs and domain types live in `types/`.

## Main entrypoints

- `components/piscrow-app.tsx`: top-level client app state and workflow orchestration
- `components/piscrow-workspaces.tsx`: buyer, seller, profile, public ledger, and admin workspace surfaces
- `app/page.tsx`: app shell entrypoint

## Rules for changes

- Put trade-state enforcement on the server, not only in the client.
- Keep Pi credentials and Supabase service access inside server-only modules.
- Reuse existing helpers in `lib/` before adding new workflow-specific utilities.
- Update tests when behavior changes across payments, admin review, chat, or public ledger surfaces.
