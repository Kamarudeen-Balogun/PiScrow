# Tests

This folder is reserved for PiScrow unit and browser test helpers.

Initial test targets:

- Seller offer posting
- Buyer interest submission
- Seller buyer selection
- Public ledger visibility
- Trade state transitions
- Validation schemas
- Payment callback request handling
- Dispute lock behavior

Current commands:

- `npm run test:regressions` checks source-level state, validation, authorization, payment, dispute, review-copilot, and sensitive logging guardrails.
- `npm run test:security` checks security headers, payment guardrails, and client bundle secret leakage.
- `npm run test:smoke` checks the core demo flow and captures screenshots.
- `npm run test:full` checks wider UI flows, mobile navigation, feedback, admin review, and console errors.
