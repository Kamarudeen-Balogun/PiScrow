# CodeScene Review - 2026-06-08

## Scope

Reviewed the CodeScene findings for:

- `src/components/piscrow-app.tsx`

## What CodeScene Got Right

These findings are worth acting on now:

1. `piscrow-app.tsx` had become a brain module.
2. Marketplace/admin/profile UI responsibilities were bundled into one file.
3. Pi Browser auth/error handling carried avoidable conditional complexity.
4. Shared trade-view helpers were living inline instead of in reusable utilities.

## Fix Now vs Defer

### Fixed now

1. Extracted shared Pi browser helpers into:
   - [src/lib/pi-browser-helpers.ts](D:/Pi%20vibe%20code/piscrow/src/lib/pi-browser-helpers.ts)
2. Extracted shared PiScrow trade/demo/view helpers into:
   - [src/lib/piscrow-ui-helpers.ts](D:/Pi%20vibe%20code/piscrow/src/lib/piscrow-ui-helpers.ts)
3. Extracted the largest workspace UI sections out of the main app file into:
   - [src/components/piscrow-workspaces.tsx](D:/Pi%20vibe%20code/piscrow/src/components/piscrow-workspaces.tsx)
4. Reduced local conditional complexity in Pi auth flow by replacing ad hoc checks with named helpers.
5. Cleaned dead duplication by removing moved helper/component definitions from the main app module.

### Deferred on purpose

1. Full state-machine rewrite for trade/payment/dispute flow:
   - valuable, but higher risk before more real-user Pi Browser testing
2. Splitting the i18n copy/config block into a dedicated module:
   - still worth doing, but lower product value than auth/workspace modularity
3. Deeper decomposition of every remaining handler in `PiScrowApp`:
   - should happen incrementally with regression tests around each flow

## Why These Changes Were Chosen

The current production risk is not "too many lines" by itself. The real risk is that Pi login, buyer interest, payment funding, seller proof, dispute, and admin review all depend on one oversized module. The chosen refactor lowers that risk without rewriting tested behavior.

## Recommended Next Refactor Phase

1. Extract the language/copy block into `src/lib/piscrow-copy.ts`
2. Move app-level network handlers into a dedicated `usePiScrowApp` hook
3. Add targeted tests for:
   - Pi auth retry logic
   - buyer interest validation
   - selected-buyer funding window behavior
   - dispute follow-up visibility rules
