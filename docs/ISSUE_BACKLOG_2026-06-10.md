# PiScrow Issue Backlog

Created: 2026-06-10

This backlog captures the current issues reported from Pi Browser/mobile testing so they can be solved one by one. All items are open unless marked otherwise.

## Recommended Solve Order

1. Fix blocking trade lifecycle and admin finalization issues.
2. Fix chat room correctness and live message updates.
3. Fix Telegram linking/session return behavior.
4. Clean up data and deletion rules for old trades.
5. Fix UI popups, notifications, language switching, and profile trust features.

## Issues

### PSC-001 - Telegram Linking Does Not Confirm or Persist

Priority: High

Current behavior:

- User taps the Telegram link from PiScrow.
- Link opens Telegram through the browser flow.
- User taps Start Bot and sends `/link`.
- No confirmation appears that the PiScrow account has been linked.
- Returning to PiScrow signs the user out and forces reauthentication.
- After logging back in, the profile still shows Telegram as not linked.

Expected behavior:

- Telegram bot should confirm successful linking.
- PiScrow should show a linked Telegram state on the user profile.
- Returning from Telegram should preserve or recover the PiScrow session where possible.
- If reauthentication is unavoidable in Pi Browser, the Telegram link should still persist server-side.

Acceptance criteria:

- `/link` produces a clear Telegram confirmation message.
- Profile shows Telegram linked after reauth.
- Linking token/state is not lost when the user leaves and returns to PiScrow.
- Failed or expired linking attempts show a useful error.

### PSC-002 - Proof Uploads Do Not Trigger Release or Seller Request Review Flow

Priority: Critical

Current behavior:

- Buyer and seller can post proof images in trade chat.
- After proof is posted, the trade does not clearly move into the expected release/request-for-funds flow.

Expected behavior:

- After proof exists, the buyer can mark the trade for fund release.
- The seller can request fund release.
- Seller release requests should move the trade into admin review when buyer confirmation is missing or disputed.
- Admin should then be able to review and release funds or take the correct dispute action.

Acceptance criteria:

- Buyer sees a release-funds action only after the trade is funded and eligible.
- Seller sees a request-release action after delivery proof is submitted.
- Admin review queue receives seller release requests that need admin review.
- Trade status, activity log, and notifications reflect the requested release state.

### PSC-003 - Duplicate Admin Chat Interfaces Still Exist

Priority: High

Current behavior:

- Admin still has two separate chat interfaces for communicating with buyer and seller.
- This duplicates the single complete trade room that already exists.

Expected behavior:

- There should be one trade room per trade.
- Buyer, seller, and admin messages should appear in that single room.
- Each message should show a role tag: Buyer, Seller, or Admin.

Acceptance criteria:

- Remove or hide the old separate admin buyer/seller chat interfaces.
- Admin can join the single room.
- Every message displays sender username and role tag.
- Existing buyer/seller/admin messages render correctly in the unified room.

### PSC-004 - Clear Old Trades Except Last Keyboard Trade

Priority: Medium

Current behavior:

- App still contains older test trades.

Expected behavior:

- Clear former trades and keep only the latest trade named "Ergonomic mechanical Gaming keyboard".

Acceptance criteria:

- Old trades are removed from active app views.
- The "Ergonomic mechanical Gaming keyboard" trade remains.
- Related dependent records are handled safely: interests, events, payments, chats, proof images, disputes, and notifications should not leave broken UI states.
- If data is deleted directly from Supabase, create a reversible backup/export first.

### PSC-005 - Live Activity Appears Inside Buy Tab Trade Cards

Priority: Medium

Current behavior:

- Live Activity is still shown inside expanded trade views on the Buy tab.

Expected behavior:

- Live Activity should not appear in the Buy tab trade cards/details.
- Live Activity should only be accessible from the Explore page.
- Live Activity should have a cancel/close button.

Acceptance criteria:

- Buy tab no longer renders the Live Activity section.
- Explore page keeps Live Activity.
- Live Activity panel has a working cancel/close button.

### PSC-006 - Toast/Popup Notifications Do Not Auto Dismiss

Priority: Medium

Current behavior:

- Some popup notifications remain stuck at the top of the screen.
- User must manually cancel them.

Expected behavior:

- Temporary notifications should automatically disappear after a short timeout.
- Persistent notifications should be reserved only for actions that truly require user decision.

Acceptance criteria:

- Success/info/warning toasts auto dismiss.
- Error/action-needed dialogs may remain but should be clearly dismissible.
- No notification permanently blocks normal app use unless intentionally modal.

### PSC-007 - Notification Icon Should Show Counter, Not Red Dot

Priority: Medium

Current behavior:

- Notification icon uses a red dot.

Expected behavior:

- Notification icon should show a numeric unread counter.

Acceptance criteria:

- Counter displays unread notification count.
- Counter hides at zero.
- Large counts use a compact format such as `9+` or `99+`.
- Count updates after reading/clearing notifications.

### PSC-008 - Users Need Per-Account Trade Deletion

Priority: High

Current behavior:

- Users cannot delete old/past trades from their own account view.

Expected behavior:

- Buyer can delete/hide a completed trade from their own history without removing it for the seller.
- Seller can delete/hide a completed or irrelevant trade from their own history without removing it for the buyer.
- This should keep accounts clean without destroying shared records required for audit, disputes, or the other user.

Acceptance criteria:

- Add buyer-specific trade deletion/hide state.
- Add seller-specific trade deletion/hide state.
- Deleted-for-me trades disappear only for the deleting user.
- Admin/audit records remain available where required.
- Deletion should respect dispute/reopen windows.

### PSC-009 - Explore Expanded Trade Is Not a Fixed Popup

Priority: Medium

Current behavior:

- On Explore, clicking a trade appears to open a popup.
- When scrolling, the "popup" behaves like an expanded inline card.
- User can scroll the expanded content into the next trade, which feels broken.

Expected behavior:

- Expanded trade details should be a fixed modal/sheet overlay or a clearly inline expansion, not a fake popup.
- If it is presented as a popup, the background list should not scroll through the modal content.

Acceptance criteria:

- Explore trade detail opens in a fixed modal/bottom sheet.
- Modal content scrolls independently.
- Background page is locked while modal is open.
- Close action returns the user to the same Explore position.

### PSC-010 - Chat Room Does Not Auto Update

Priority: High

Current behavior:

- New chat messages do not appear automatically.
- User must tap manual refresh to see new messages.

Expected behavior:

- Chat room should update automatically when new messages are sent.

Acceptance criteria:

- Incoming messages appear without manual refresh.
- Works for buyer, seller, and admin.
- Image/proof messages also appear live.
- Manual refresh can remain as fallback but should not be required.

### PSC-011 - Top Reload Button Does Not Work

Priority: Medium

Current behavior:

- The reload button at the top of the app does not work.

Expected behavior:

- Reload should refresh relevant app data or clearly indicate what it refreshed.

Acceptance criteria:

- Tapping reload updates balances, notifications, trades, and current view data where applicable.
- Button shows loading/disabled state while refreshing.
- Errors are surfaced through a dismissible notification.

### PSC-012 - Completed Trade Chat Rooms Need 7-Day Retention Then Cleanup

Priority: High

Current behavior:

- Chat room lifecycle after completed trades is unclear.

Expected behavior:

- After a trade completes, the chat room should be disabled so no new messages can be sent.
- Chat room data should remain available for 7 days because users can reopen/report an issue during that period.
- After 7 days, the room should be deleted or archived from the server according to the retention policy.

Acceptance criteria:

- Completed trade chat composer is disabled.
- Room remains readable during the 7-day reopen window.
- Reopened trade restores or preserves the needed chat/proof context.
- Cleanup job deletes or archives eligible rooms after 7 days.
- UI explains when the room is locked and until when it is retained.

### PSC-013 - Language Switch Does Not Work and Needs Nigerian Pidgin

Priority: Medium

Current behavior:

- Language switch does not work.
- Nigerian Pidgin English is missing.

Expected behavior:

- Language switch should change app copy.
- Nigerian Pidgin English should be available as a language option.

Acceptance criteria:

- Language selector persists user choice.
- App text updates after switching language.
- Nigerian Pidgin English option is added.
- Missing translations gracefully fall back to English until completed.

### PSC-014 - Achievement Badges Are Hardcoded Instead of Earned

Priority: Medium

Current behavior:

- Achievement badges appear as if already earned.
- Badges do not follow an activation/earning sequence.

Expected behavior:

- Badges should be milestone-based.
- Unearned badges should appear dim/inactive.
- Earned badges should become bright/active only when requirements are met.

Acceptance criteria:

- Define badge milestones.
- Badge state is calculated from user activity.
- Unearned badges render inactive.
- Earned badges render active with earned date where useful.

### PSC-015 - Users Need Public Profile View

Priority: High

Current behavior:

- Users cannot easily inspect each other's profiles before or during trades.

Expected behavior:

- Buyers and sellers should be able to view each other's public trust profile.
- Profile should increase trust by showing completed trades, disputes, and other reputation signals.

Acceptance criteria:

- Username/avatar opens public profile.
- Public profile shows completed trades count, dispute count, resolved count, verification state, badges, and relevant trust stats.
- Private/sensitive account information remains hidden.
- Profile is reachable from Explore, Buy, Sell, chat, and admin views where usernames appear.

### PSC-016 - Verified Badge Request Flow Needs Milestones

Priority: Medium

Current behavior:

- Verified badge request flow is not meaningful enough.

Expected behavior:

- User should meet clear milestones before requesting verification.
- Example milestone: user must complete at least 5 trades.

Acceptance criteria:

- Verification page shows requirements.
- Request button is disabled until requirements are met.
- Requirements include completed trade count and any other trust criteria chosen.
- Admin can approve/reject verification requests with a reason.

### PSC-017 - Verified Badge Should Appear Everywhere Username Appears

Priority: Medium

Current behavior:

- Verified badge appears on the user's profile only.

Expected behavior:

- Once verified, badge should appear everywhere the username appears.

Acceptance criteria:

- Verified badge appears beside username in trade cards, chat messages, profile links, seller/buyer labels, notifications, and admin views.
- Badge has accessible text/tooltip.
- Badge state is loaded consistently without stale UI.

### PSC-018 - Chat Opens Before Trade Is Funded

Priority: Critical

Current behavior:

- User can open chat before funding the trade.

Expected behavior:

- Chat should only open after the buyer has funded the trade.

Acceptance criteria:

- Unfunded trades do not allow chat access.
- UI explains that chat unlocks after escrow funding.
- Server/API also blocks unfunded chat access, not just the frontend.
- Funding confirmation unlocks the room.

### PSC-019 - Admin Finalize Trade Fails With Wallet Seed Length Error

Priority: Critical

Current behavior:

- Admin sees error: "Wallet private seed must be 56-character long" when finalizing a trade.
- Reported Vercel environment private key starts with `s` and has the correct length.

Expected behavior:

- Admin finalization should accept the configured Pi wallet private seed when it is valid.
- If invalid, the app should report the exact environment/config problem without exposing the secret.

Acceptance criteria:

- Audit environment variable name, trimming, quote handling, newline handling, and runtime source.
- Validate the seed after trimming whitespace and removing accidental wrapping quotes if appropriate.
- Confirm Vercel production/preview env names match the code.
- Error message identifies misconfiguration safely.
- Admin can finalize a test trade successfully.

### PSC-020 - Transaction Memo Text Should Be Readable

Priority: Low

Current behavior:

- Transaction memo text uses random-looking strings.

Expected behavior:

- Memo should be real readable English that identifies the PiScrow action.

Acceptance criteria:

- Use readable memo examples such as `PiScrow escrow funding`, `PiScrow seller payout`, or `PiScrow buyer refund`.
- Include trade reference only if it stays understandable and does not expose sensitive data.
- Memo length stays within Pi Network transaction limits.

## Screenshot-Backed Observations

- Admin review screen shows a unified Trade Chat section, but old separate admin chat paths may still exist elsewhere.
- Buy tab expanded trade details show Live Activity and activity entries, which should move to Explore-only access.
- Toast notification "Private request declined" remains visible across scrolling states.
- Admin finalize modal shows the wallet seed length error.
- Expanded trade detail visually behaves like a modal but scrolls with underlying list content.

## Additional Issues Reported On 2026-06-12

### PSC-021 - Explore Bottom Sheet Still Leaks Into Underlying Trade List

Priority: High

Current behavior:

- Explore trade detail appears as a bottom sheet.
- Scrolling the sheet can still expose the next trade behind or beneath it.
- After closing one sheet and opening another further down the list, the detail can appear anchored inside another trade card instead of fixed to the viewport.

Expected behavior:

- Explore detail must be a viewport-fixed overlay.
- Background list scroll must lock while the sheet is open.
- Reopening a different trade should always mount a fresh fixed sheet from the viewport bottom.

Acceptance criteria:

- Background page does not scroll while Explore detail is open.
- Sheet content scrolls independently.
- Opening and closing multiple trades at different scroll positions behaves consistently.
- Public profile viewing from inside the sheet does not break the current trade overlay.

### PSC-022 - Buyer Detail Still Shows Submit Interest After Buyer Already Responded

Priority: Medium

Current behavior:

- Buyer tab already contains the trade under the user’s interest/history list.
- Expanded detail can still show the submit-interest form again.

Expected behavior:

- A buyer who already submitted interest should only see their existing response state.
- The interest form should never reappear for the same user on the same trade.

Acceptance criteria:

- Matching should use durable user identity, not only display username.
- Buyer detail shows one response state per user per trade.
- Demo and real accounts behave the same way.

### PSC-023 - Seller Trade Sheet Still Shows Legacy Proof Panel

Priority: Medium

Current behavior:

- Seller tab expanded trade detail still renders the old "Package Sent Proof" form.
- This duplicates the unified trade chat proof workflow.

Expected behavior:

- Seller sheet should point users to the unified trade room.
- Legacy standalone proof submission panel should be removed from the seller detail surface.

Acceptance criteria:

- Seller detail no longer renders the old proof form.
- Proof remains visible when already submitted.
- Release flow still works through chat-driven evidence and request-release actions.

### PSC-024 - Seller Trade Sheet Still Shows Live Activity

Priority: Low

Current behavior:

- Seller trade detail still includes Live Activity at the bottom.

Expected behavior:

- Live Activity remains Explore/Ledger-only.

Acceptance criteria:

- Seller detail no longer renders Live Activity.

### PSC-025 - Public Profile Overlay Breaks Open Trade Sheet

Priority: High

Current behavior:

- Opening a seller profile from inside a trade detail renders another poorly nested popup.
- Layout becomes cramped and visually broken.

Expected behavior:

- Public profile should open as a clean overlay layer above the active trade detail.
- It should not visually merge into the existing bottom sheet.

Acceptance criteria:

- Public profile opens as its own centered modal/overlay.
- Closing the profile returns the user to the same underlying trade detail state.
- No overlapping scroll regions or clipped actions appear.

### PSC-026 - Profile Surface Needs Compaction

Priority: Low

Current behavior:

- Profile contains unnecessary explanatory text.
- In-app notification card adds noise without meaningful action.
- Telegram and payout readiness cards feel taller than necessary.

Expected behavior:

- Remove low-value explanatory blocks.
- Keep only actionable status and controls.
- Compact Telegram and payout readiness surfaces for better scanability.

Acceptance criteria:

- Profile no longer shows the separate in-app notification card.
- Telegram and payout readiness sections occupy less vertical space.
- Primary controls remain obvious and accessible.

## Proposal Review Standards

### Local handoff confirmation: QR code or one-time code

Decision:

- Implement a one-time buyer handoff code first.
- Defer QR until the code flow is stable and auditable.

Reasoning:

- QR is a presentation layer over the same secret material.
- A signed or high-entropy one-time code solves the core release authorization problem with less UI and less device-camera dependency.
- It is easier to audit, revoke, rotate, expire, and test.

Required standard:

- Generate server-side only after escrow is funded.
- Store only a hashed verifier, never the raw secret after generation response.
- Tie the code to trade id, buyer id, selected seller id, and expiry timestamp.
- Make it single-use and invalid after successful claim, refund, cancellation, or expiry.
- Seller enters the code inside the funded trade room or trade action surface.
- Server verifies identity, trade state, expiry, replay status, and rate limits attempts.
- Successful verification should transition directly to payout release only when no dispute hold exists.
- Every generation, reveal, verification attempt, failure, success, rotation, and expiry must create audit events.

Security requirements:

- Minimum 128-bit entropy if machine-generated token.
- Short human entry format must be derived from a strong server secret and protected with aggressive rate limiting.
- Max attempt budget per trade and per actor.
- Automatic invalidation on trade reopen or participant change.
- No raw code in logs, analytics, notifications, or admin summaries.

UX requirements:

- Buyer explicitly taps generate code.
- After creation, buyer sees "Show code" instead of regenerating by default.
- Regeneration must revoke the previous code and require explicit confirmation.
- Seller sees a focused verify action only while trade is funded and eligible.
- Completed trades show that the handoff code was used successfully.

Phase recommendation:

1. Build one-time code flow.
2. Add QR as a renderer for the same underlying code payload.
3. Only then consider auto-release-by-scan UX.

### Reputation badge expansion

Decision:

- Yes, but keep badges fully computed from server-visible facts.

Required standard:

- Every badge must map to one deterministic rule.
- Unearned badges remain dim.
- Definitions live in one shared badge policy module.
- Badge data must be reusable across profile, trade cards, chat, and admin views.

Suggested first badge set:

- `First Trade`
- `Trusted Trader`
- `10+ Trades`
- `Fast Shipper`
- `Verified Local` only if there is a real verified-local rule and evidence source

### 7-day delivery auto-expiry and buyer refund

Status:

- Still open. Current codebase has chat-retention expiry, not trade-delivery auto-refund.

Required standard:

- Add `delivery_due_at` when funding succeeds.
- Show the deadline clearly to both parties and during seller listing creation.
- Auto-refund only if trade is still in a non-delivered funded state at expiry.
- Hold execution in an idempotent server job, not client timers.
- Record deadline creation, reminder notifications, expiry evaluation, and refund outcome in the event log.

Architecture recommendation:

- Upstash QStash is a valid fit for scheduled expiry execution because it avoids polling loops.
- Each funded trade schedules one delayed expiry task.
- Expiry handler re-reads trade state, checks idempotency, then refunds or no-ops.
- Keep the handler safe for retries and duplicate delivery.

### Skeleton loaders

Decision:

- Yes, for slower network conditions and ledger/trade fetch surfaces.

Required standard:

- Use fixed-dimension skeleton blocks that match final layout.
- Prefer skeletons over spinners on list and card surfaces.
- Keep first-paint fast paths unchanged where cached/demo data is instant.

## Cross-Cutting Notes

- Prefer server-side enforcement for trade state restrictions, especially chat access, release requests, deletion visibility, and admin finalization.
- Keep audit and dispute evidence intact even when users delete/hide trades from their own history.
- Use clear status transitions for funding, proof submitted, release requested, admin review, completed, reopened, and cleanup scheduled.
- Avoid deleting production-like data without a backup/export step.
