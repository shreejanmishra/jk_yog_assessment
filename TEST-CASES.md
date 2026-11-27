# Edge Cases & Verification Matrix (`TEST-CASES.md`)

Every scenario below was identified from the problem brief and product flows, together with how the application handles it.

## 1. Money, Pricing & Promo Codes

| # | Scenario | App Behaviour | Verified By |
| --- | --- | --- | --- |
| 1 | Percentage discount on fractional-cent subtotal (e.g. `SEVA10` 10% on `$146.70` or `$1.55`) | Computed in branded integer `Cents` via integer basis-points half-up rounding (`Math.floor((cents * bps + 5000) / 10000)`). Never produces `$146.70000000000002`. | `tests/domain/money.test.ts` |
| 2 | `FLAT20` applied to a booking with subtotal `<= $40.00` (e.g. `$15.00` or `$40.00`) vs `> $40.00` (e.g. `$45.00`) | Rejected with `PROMO_NOT_APPLICABLE` unless subtotal is strictly over `$40.00`; when `> $40.00`, deducts `$20.00`. | `tests/domain/pricing-and-promos.test.ts` |
| 3 | `KIDSFREE` on mixed adult + child + toddler + extras booking | Zeroes `DAY_PASS_CHILD` and `ALL_DAY_CHILD` lines only; adult passes, Dinner Plates, Dandiya, and Workshops remain full price. | `tests/domain/pricing-and-promos.test.ts` |
| 4 | `KIDSFREE` when no Child (`5–11`) Day/All-Day pass exists in the booking (adults only, Under-5 only, or `$40` Family Pass) | Quote marks promo `rejected` (`PROMO_NOT_APPLICABLE`) with clear message; booking submission blocks until cleared or replaced. | `tests/domain/pricing-and-promos.test.ts` |
| 4b | Coupon abuse across bookings: Booker A books for `[A, B]` using a coupon, then `A` or `B` returns (as booker or attendee, even with new companions or a different coupon code) | Rejected on both `/api/quote` and `/api/bookings` (`PROMO_ALREADY_USED` — limit 1 coupon per booker and per attendee across all active/confirmed bookings); clearing the coupon allows booking at regular price. | `tests/api/booking-api.test.ts` |
| 5 | `EXPIRED5`, `MAXEDOUT`, unknown code, or lowercase/padded `" seva10 "` | Trimmed & uppercased; `SEVA10` applies cleanly, while `EXPIRED5` (`PROMO_EXPIRED`), `MAXEDOUT` (`PROMO_EXHAUSTED`), and unknown (`PROMO_NOT_FOUND`) show distinct messages. | `tests/domain/pricing-and-promos.test.ts` |
| 6 | Child selects 4 Day Passes (`4 × $8 = $32`) instead of Child All-Day Pass (`$30`), or Family Pass (`$40`) selected for 1A+2C (`$31` separate) | Server quote returns non-blocking `CHEAPER_OPTION_AVAILABLE` warning highlighting exact dollar savings. | `src/domain/quote.ts` |
| 7 | Client tampers with `expectedTotalCents` in DevTools / `curl` | Server recalculates total from its own catalog and rejects mismatch with `409 PRICE_CHANGED`. | `tests/api/booking-api.test.ts` |

## 2. Age Rules & Minor Guardian Safeguards

| # | Scenario | App Behaviour | Verified By |
| --- | --- | --- | --- |
| 8 | Booker enters age `< 18` (e.g. `17`) in Individual or Group mode | Red exclamation (`!`) error appears directly below Age field; Confirm button disabled; API returns `422 BOOKER_UNDER_18`. | `tests/domain/age-and-guardian.test.ts` & UI |
| 9 | Nonsense age input (`-3`, `4.5`, `150`, `abc`, empty) | Rejected by client validation and server `isValidAgeInteger` (`0–120` whole integers only) with `AGE_INVALID`. | `tests/domain/age-and-guardian.test.ts` |
| 10 | Group attendee aged `12–17` on an Adult pass | Issued an Adult pass (`12+` rule), AND Guardian Name + Guardian Phone smoothly expand into the form, are required by API + Postgres `CHECK` constraint, and print on their festival pass. | `tests/domain/age-and-guardian.test.ts` |
| 11 | Child (`5–11`) or Toddler (`0–4`) submitted without Guardian Name or Guardian Phone | Blocked in UI modal, rejected by API (`422 GUARDIAN_NAME_REQUIRED` / `GUARDIAN_PHONE_REQUIRED`), and rejected by DB `CHECK` constraint. | `tests/domain/age-and-guardian.test.ts` |
| 11b | Minor (`0–4`, `5–11`, or `12–17`) enters their own name or phone number (or another minor in the booking) as Guardian | Blocked immediately in `AddAttendeeModal` with `!` error below Guardian Name/Phone, rejected by API (`422 GUARDIAN_SELF_MATCH`), and enforced by PostgreSQL `CHECK` constraint. | `tests/domain/age-and-guardian.test.ts` |
| 12 | User selects `Adult` in Add Attendee modal but types age `9` (or selects `Child` and types `14` or `3`) | Red `!` error below Age explains the exact age rule, offers a 1-click button to switch attendee category, and API rejects mismatches (`ATTENDEE_TYPE_AGE_MISMATCH`). | `tests/domain/age-and-guardian.test.ts` & UI |
| 12b | Duplicate adult or `12–17` minor passholder sharing the same phone number (including `+1` vs no `+1` formatting) | Blocked immediately in `AddAttendeeModal` / `GroupBookingBuilder` with inline `!` error, rejected in quote & booking validation (`422 DUPLICATE_ATTENDEE`), and blocked across active/confirmed bookings on overlapping evenings (`409 DUPLICATE_PASS_HOLDER`). | `tests/domain/age-and-guardian.test.ts` & `tests/api/booking-api.test.ts` |
| 12c | Guardian books passes for 2+ children (`5–11` or `0–4`) vs accidentally adding the same child twice | Keyed by `(normalizedGuardianPhone + normalizedChildFullName)`: siblings with different names under the same guardian phone succeed, while repeating the same child name + guardian phone is blocked (`DUPLICATE_ATTENDEE` / `DUPLICATE_PASS_HOLDER`). | `tests/domain/age-and-guardian.test.ts` & `tests/api/booking-api.test.ts` |

## 3. Stock, Concurrency, Holds & Extras

| # | Scenario | App Behaviour | Verified By |
| --- | --- | --- | --- |
| 13 | Adult All-Day Pass (`remaining = 0`) | Disabled in UI with `Sold Out` badge and guidance to pick Day Pass dates; direct API request rejected with `422 PRODUCT_SOLD_OUT`. | `tests/domain/pricing-and-promos.test.ts` |
| 14 | 10 concurrent buyers simultaneously submit bookings for the last `2` Garba Workshop seats | Atomic conditional `UPDATE` / mutex lock ensures **exactly 1 succeeds (`201`)** and **9 receive `409 INSUFFICIENT_STOCK`**, leaving `0` remaining (never negative). | `tests/api/booking-api.test.ts` & `npm run race` |
| 15 | Buyer holds the last Garba Workshop spot on `/pay/:bookingId` and closes the tab without paying | Hold expires after 10 minutes (`hold_expires_at`); next request lazily restores stock to `2`, and late payment returns `410 HOLD_EXPIRED`. | `tests/api/booking-api.test.ts` |
| 16 | Buyer selects Dinner Plate on Fri 11 Dec, then unchecks Fri 11 Dec from their Day Pass | Zustand transition (`reconcileAttendeeExtras`) automatically prunes Dinner & Workshop selections on deselected days; server also enforces `EXTRA_DAY_NOT_ATTENDING`. | `tests/store/booking-transitions.test.ts` |
| 17 | Direct API request asks for Garba Workshop on Sat 12 Dec or for a 3-year-old | Rejected server-side with `WORKSHOP_DAY_INVALID` (runs Dec 11 & Dec 13 only) or `WORKSHOP_INFANT_INELIGIBLE`. | `tests/domain/pricing-and-promos.test.ts` |

## 4. Resilience, Double-Clicks & Layout Edge Cases

| # | Scenario | App Behaviour | Verified By |
| --- | --- | --- | --- |
| 18 | User double-clicks **Pay** or retries after a brief network hiccup | `POST /api/bookings` replays the existing hold via `Idempotency-Key`; `POST /simulate-pay` is idempotent on already-confirmed bookings (one charge, one invoice, one email). | `tests/api/booking-api.test.ts` |
| 19 | Simulated card decline (`4000…0002` or **Simulate Decline** button) | Returns `402 PAYMENT_DECLINED` while keeping the 10-minute stock hold active so the buyer can retry immediately. | `SimulatedGatewayPage.tsx` & API |
| 20 | Hero Banner content exceeds fixed banner height on mobile or desktop | Upper details container clips cleanly with a fade mask and reveals `Show full banner details ▾`, while the `Book Now` CTA remains pinned outside the clipped box and is never truncated. | `HeroBanner.tsx` |
