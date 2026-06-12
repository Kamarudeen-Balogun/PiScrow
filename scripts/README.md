# Scripts

This folder contains small operational utilities used outside the main app runtime.

## Scripts

- `pi-wallet-smoke-test.mjs`: validates the configured app wallet seed, prints the derived public key, reads native balance, and can submit a small test payment when explicitly requested
- `export-brand-assets.mjs`: exports brand assets used in presentation materials

## Usage

Wallet sanity check:

```bash
npm run wallet:smoke
```

Optional send test:

```bash
npm run wallet:smoke -- --send --to <PUBLIC_KEY> --amount 5 --memo "PiScrow smoke test"
```

Brand export:

```bash
npm run brand:export
```

## Notes

- Do not use the wallet smoke test against production-like funds without intent.
- The wallet smoke test is useful for validating that `PI_WALLET_PRIVATE_SEED` and the Pi app wallet match before testing release or refund flows.
