# Tests

This folder contains PiScrow verification scripts for source regressions, security checks, smoke coverage, and broader browser workflow validation.

## Files

- `piscrow_regressions.py`: source-level guardrails for trade-state, validation, auth, Pi payment, explorer links, and other fixed expectations
- `piscrow_security.py`: security-header and secret-leak checks
- `piscrow_smoke.py`: fast browser walkthrough with curated screenshot capture
- `piscrow_full_site.py`: broader Playwright scenario coverage across desktop and mobile

## Commands

- `npm run test:regressions`
- `npm run test:security`
- `npm run test:smoke`
- `npm run test:full`

## Notes

- Browser tests expect a running app at `http://localhost:3000` unless `PISCROW_BASE_URL` is set.
- `test-artifacts/` is intentionally gitignored; curated screenshots should be copied into `docs/screenshots/` only when needed.
- Keep regression checks tight around trade lifecycle, Pi payment handling, admin review, and public-ledger behavior.
