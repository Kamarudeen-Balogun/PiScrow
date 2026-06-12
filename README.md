# PiScrow

PiScrow is a Pi Testnet marketplace and escrow workflow prototype for peer-to-peer trades. It lets sellers post public or private offers, buyers submit interest, the seller select one buyer, and the selected buyer fund the trade with Test Pi. PiScrow then tracks delivery evidence, chat, disputes, refund/release review, and reputation signals in one product surface.

Live app: `https://pi-scrow.vercel.app/`  
Demo workspace: `https://pi-scrow.vercel.app/?demo=1`  
Rules and consent page: `https://pi-scrow.vercel.app/rules`

Important: PiScrow is testnet-only. It is not a Mainnet escrow product and it should not be presented as a legal escrow service.

## What the product does

- Seller posts a public or private offer.
- Buyer submits interest.
- Seller selects exactly one buyer.
- Selected buyer gets a 1-hour funding window.
- Buyer funds the trade with Test Pi plus the visible PiScrow fee.
- Funded trade unlocks the trade chat and evidence flow.
- Buyer and seller exchange delivery evidence in a unified room.
- Seller can request payout review, buyer can confirm receipt, or either side can dispute.
- Admin can release seller payout or refund buyer when required.
- Local handoff trades can use a one-time buyer handoff code for direct release confirmation.

## Current feature set

- Pi Browser sign-in and authenticated session recovery
- Demo mode for product walkthroughs without live Pi or Supabase writes
- Public and private trade listings
- Buyer interest flow with seller-controlled buyer selection
- Funding window enforcement for the selected buyer
- Pi payment approval and completion through the Pi Platform API
- Unified trade chat room for buyer, seller, and admin
- Proof image support through Supabase Storage
- Admin review workspace for release and refund decisions
- Telegram linking and notification delivery
- Reputation profiles, trade stats, badges, and verified badge workflow
- Public ledger with live activity and cached fallback for short read outages
- One-time buyer handoff code flow for local in-person delivery
- Delivery deadline tracking and trade lifecycle enforcement
- Rate limiting, sanitization, and server-side authorization checks

## Product status

PiScrow is actively being hardened for Pi Testnet. Several workflows are production-shaped, but the project is still in implementation and test iteration. The main backlog is tracked in [docs/ISSUE_BACKLOG_2026-06-10.md](docs/ISSUE_BACKLOG_2026-06-10.md).

## Screenshots

| Consent and sign-in | Marketplace |
| --- | --- |
| ![PiScrow consent and sign-in](docs/screenshots/01-signin-consent.png) | ![PiScrow marketplace](docs/screenshots/02-marketplace.png) |

| Seller desk | Public ledger |
| --- | --- |
| ![PiScrow seller desk](docs/screenshots/03-seller-desk.png) | ![PiScrow public ledger](docs/screenshots/04-public-ledger.png) |

| Profile trust | Admin review |
| --- | --- |
| ![PiScrow profile trust](docs/screenshots/05-profile.png) | ![PiScrow admin review](docs/screenshots/06-admin-review.png) |

More context is in [docs/screenshots/README.md](docs/screenshots/README.md).

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase database and Storage
- Pi Browser SDK and Pi Platform API
- Stellar SDK via server-side wallet release flow
- Zod validation
- Upstash Redis REST rate limiting with memory fallback

## Repository map

- [src/](src/README.md): application source and architecture overview
- [src/server/](src/server/README.md): server-side services and business logic
- [src/tests/](src/tests/README.md): smoke, regression, security, and UI test guides
- [supabase/](supabase/README.md): schema and migration source of truth
- [scripts/](scripts/README.md): operational utility scripts
- [docs/](docs/README.md): backlog, screenshots, and project notes

## Knowledge graph and vault

Graphify is wired into this project for codebase navigation, while Foam and
Obsidian are used for linked Markdown notes and graph browsing.

- Knowledge graph JSON: `graphify-out/graph.json`
- Graph report: `graphify-out/GRAPH_REPORT.md`
- Wiki entry point: `graphify-out/wiki/index.md`
- Generated Obsidian vault: `graphify-out/obsidian/`
- Handwritten notes location: `docs/notes/`

Primary commands:

```bash
graphify query "How is admin release and refund implemented?"
graphify path "executeEscrowRelease()" "POST()_11"
graphify explain "trade-handoff.ts"
```

Refresh workflow:

```bash
# code-only refresh after source edits
graphify update .

# rebuild graph after markdown/docs changes or when semantic edges need refresh
# replace <backend> and <model> with the provider available on this machine
graphify extract . --backend <backend> --model <model> --token-budget 12000 --max-concurrency 1 --out .

# regenerate community report, html, and labels
graphify cluster-only . --graph graphify-out/graph.json --backend <backend>

# regenerate Foam/Obsidian outputs
graphify export obsidian --graph graphify-out/graph.json
graphify export wiki --graph graphify-out/graph.json
```

Open `graphify-out/obsidian/` as an Obsidian vault to inspect `graph.canvas` and
Graph View. More detail is in [docs/GRAPHIFY.md](docs/GRAPHIFY.md).

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create a local environment file:

```bash
copy .env.example .env.local
```

3. Start the app:

```bash
npm run dev
```

4. Open `http://localhost:3000`

For Pi Browser testing, use an HTTPS tunnel or a deployed preview URL instead of plain localhost.

## Required environment variables

Copy [.env.example](.env.example) and fill in real values:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_PI_SANDBOX=true
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_PISCROW_PLATFORM_FEE_BPS=200
NEXT_PUBLIC_PISCROW_MAINTENANCE_ENABLED=false
NEXT_PUBLIC_PISCROW_MAINTENANCE_MESSAGE=PiScrow is receiving updates. The app remains online, but some actions may be slower than usual.

SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
PI_NETWORK_API_KEY=your-pi-app-platform-api-key
PI_WALLET_PRIVATE_SEED=S_YOUR_56_CHARACTER_APP_WALLET_PRIVATE_SEED
PI_PLATFORM_API_BASE=https://api.minepi.com
PISCROW_ADMIN_PI_USERNAMES=your_pi_username
PISCROW_FEEDBACK_WEBHOOK_URL=https://hook.us1.make.com/your-feedback-webhook
UPSTASH_REDIS_REST_URL=https://your-upstash-redis-rest-url
UPSTASH_REDIS_REST_TOKEN=your-upstash-redis-rest-token
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_BOT_USERNAME=PiScrow_bot
TELEGRAM_WEBHOOK_SECRET=your-random-webhook-secret
PISCROW_TELEGRAM_LINK_SECRET=your-random-link-signing-secret
PISCROW_INTERNAL_CRON_TOKEN=your-random-cron-auth-token
PISCROW_HANDOFF_CODE_SECRET=your-random-handoff-code-secret
```

Never expose these with `NEXT_PUBLIC_`:

- `SUPABASE_SERVICE_ROLE_KEY`
- `PI_NETWORK_API_KEY`
- `PI_WALLET_PRIVATE_SEED`
- `PISCROW_ADMIN_PI_USERNAMES`
- `PISCROW_FEEDBACK_WEBHOOK_URL`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `PISCROW_TELEGRAM_LINK_SECRET`
- `PISCROW_INTERNAL_CRON_TOKEN`
- `PISCROW_HANDOFF_CODE_SECRET`

## Pi payment model

PiScrow uses Pi Testnet user-to-app funding for escrow intake and a server-controlled app wallet for final seller payout or buyer refund.

### Buyer funding

- Product label: `PiScrow escrow funding`
- Memo: `PiScrow escrow funding`
- Buyer pays:

```text
seller price + PiScrow fee
```

### Final payout and refund

- Seller release memo: `PiScrow seller payout`
- Buyer refund memo: `PiScrow buyer refund`
- The app wallet private seed and Pi API key must belong to the same Pi app.

## Supabase

PiScrow keeps only the database source of truth in the repo:

- `supabase/schema.sql`
- `supabase/migrations/`

## Demo mode

Demo mode is for walkthroughs, screenshots, and UI review:

```text
https://pi-scrow.vercel.app/?demo=1
```

It simulates:

- public and private offers
- funded trades
- admin review states
- profile trust state
- verified badge queue
- live activity
- handoff flow surfaces

Demo mode does not mutate real Pi or Supabase data.

## Validation and test commands

Core validation:

```bash
npm run lint
npm run build
npm run test:regressions
npm run test:security
npm run test:smoke
npm run test:full
```

Wallet sanity check:

```bash
npm run wallet:smoke
```

The test suite overview is documented in [src/tests/README.md](src/tests/README.md).

## Reliability notes

- Public ledger now falls back to last successful cached data during short read outages.
- Upstash Redis is used when configured; memory fallback is used when Upstash is unavailable.
- Server-side guards enforce selected-buyer funding, dispute locks, admin-only actions, and protected proof access.
- Explorer links are shown only when PiScrow has a valid-looking transaction hash.

## Security notes

- Protected routes verify authenticated Pi identity
- Admin access is controlled by configured Pi usernames
- Trade, proof, dispute, chat, and admin payloads are schema-validated
- Proof storage uses signed URLs instead of public buckets
- Handoff codes are generated server-side and stored as hashed verifiers only
- Review Copilot is recommend-only and never resolves trades automatically

## Deployment notes

- Use `preview` for ongoing validation and testing
- Promote to `main` after Pi Browser, Supabase, and test checks pass
- Confirm Pi Developer Portal URLs point to the deployed `/rules` page
- Confirm all Vercel env vars match the values expected by the codebase

## Known operational follow-ups

- Screenshot refresh in `docs/screenshots/` should be rerun after major UI changes
- Shared cache for public ledger fallback would be stronger in Redis/KV than per-instance memory
- Remaining product issues are tracked in [docs/ISSUE_BACKLOG_2026-06-10.md](docs/ISSUE_BACKLOG_2026-06-10.md)
