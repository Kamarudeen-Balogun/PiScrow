# PiScrow

PiScrow is a Pi Testnet/Sandbox marketplace and escrow-style workflow demo for safer P2P barter trades. Sellers post public or private offers, buyers submit interest, the seller selects one buyer, and the selected buyer funds the trade with Test Pi plus a transparent PiScrow platform fee.

## Current Build

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase schema and client helpers
- Pi Browser SDK script loading
- Seller-first public/private offers
- Buyer interest responses and seller selection
- Public activity ledger for transparent trade status
- Platform fee calculation and payment amount validation
- Test Pi payment approval/completion API boundaries
- Local demo mode when Pi Browser or server keys are not configured

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_PI_SANDBOX=true
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_PISCROW_PLATFORM_FEE_BPS=200
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
PI_API_KEY=your-server-only-pi-api-key
PI_PLATFORM_API_BASE=https://api.minepi.com
PISCROW_ADMIN_PI_USERNAMES=your_pi_username
```

Do not expose `PI_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` to client components.

## Supabase

PiScrow uses the Supabase CLI locally. Schema migrations are in `supabase/migrations/`.

Login needs a Supabase access token in non-interactive shells:

```bash
npx supabase login --token YOUR_SUPABASE_ACCESS_TOKEN
npm run supabase:link
npm run supabase:push
```

The project ref is already configured in the npm script as `yxyzdpolgodzbgqbxdcz`.

After this marketplace update, push the new migration before testing real users:

```bash
npm run supabase:push
```

## Checks

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Browser Smoke Test

Start the dev server first:

```bash
npm run dev -- --port 3001
```

Then run:

```bash
npm run test:smoke
```

The smoke test defaults to `http://localhost:3000`. To test another port:

```bash
$env:PISCROW_BASE_URL="http://localhost:3001"
npm run test:smoke
```

Screenshots are saved in `test-artifacts/`.

## Pi Browser Test Setup

Pi Browser testing should use a real Pi Developer Portal app in Testnet/Sandbox mode.

### 1. Run PiScrow locally

```bash
npm run dev
```

### 2. Expose the local app to your phone

Pi Browser on your phone cannot usually reach your computer's `localhost`. Use one of these:

- Recommended for quick testing: a tunnel URL that forwards to `http://localhost:3000`
- Recommended for stable testing: a deployed preview URL

The URL must be HTTPS for the best Pi Browser/payment behavior.

### 3. Configure Pi Developer Portal

In Pi Browser:

1. Open the Pi Developer Portal.
2. Open the **PiScrow** app.
3. Keep the app in **Testnet/Sandbox** mode.
4. Set the app development URL to your tunnel or preview URL.
5. Confirm your app has payment access enabled.
6. Confirm your developer Testnet wallet exists and has Test Pi.
7. Keep `NEXT_PUBLIC_PI_SANDBOX=true` in the app environment.

### 4. Test With Real Pi Users

Use two Pi accounts if possible:

- Seller account: opens Seller Desk, posts a public offer or private buyer list, and later selects the best buyer response.
- Buyer account: opens Marketplace, shows interest on an offer, and funds with Test Pi after the seller selects them.

The buyer payment amount is:

```text
seller price + PiScrow platform fee
```

The default fee is `NEXT_PUBLIC_PISCROW_PLATFORM_FEE_BPS=200`, which is 2%.

Admin tools only appear after a verified Pi sign-in if the username is listed in:

```bash
PISCROW_ADMIN_PI_USERNAMES=@villari002
```

To promote more admins, add comma-separated usernames in the server environment:

```bash
PISCROW_ADMIN_PI_USERNAMES=@villari002,@second_admin
```

Do not expose this variable with `NEXT_PUBLIC_`.

All PiScrow financial behavior is testnet-only until explicitly reviewed for Mainnet readiness.
