# Sharad Utsav 2026 — Festival Ticketing & Pass Portal

**Live Production URL:** [https://jk-yog-assessment.vercel.app](https://jk-yog-assessment.vercel.app)

End-to-end festival booking application for **Sharad Utsav 2026** at **Radha Krishna Temple, Allen, Texas** (**Thu 10 Dec 2026 → Mon 14 Dec 2026**, USD).

Built with **React 19 + Vite**, **Zustand**, **Tailwind CSS v4**, **Express 5** (Vercel Serverless Function), **Zod**, **Neon PostgreSQL + Drizzle ORM**, **`pdfkit` + `qrcode`**, and **Vitest**.

---

## Quick Start (Local Development)

### Prerequisites
- Node.js `>= 20.9` (tested on Node 22 LTS) and `npm`
- Optional for local run, required in production: a **Neon PostgreSQL** database URL (locally, if `DATABASE_URL` is omitted, the server automatically runs against a parity transactional in-memory store seeded with all Sharad Utsav 2026 data so `npm run dev` and `npm test` work out of the box).

### Commands

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables (optional locally, required for Neon Postgres)
cp .env.example .env.local

# 3. Apply PostgreSQL schema & seed Sharad Utsav 2026 data (when DATABASE_URL is set)
npm run db:push
npm run db:seed

# 4. Start Vite SPA (http://localhost:5173) + Express 5 API (http://localhost:8787)
npm run dev

# 5. Run automated tests, strict TypeScript checks, ESLint, production build, and concurrency race
npm test
npm run typecheck
npm run lint
npm run build
npm run race
```

---

## Environment Variables (Vercel & `.env.local`)

| Variable | Required in Prod | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Pooled Neon PostgreSQL connection string used by the Express 5 API at runtime |
| `DATABASE_URL_UNPOOLED` | Recommended | Direct Neon PostgreSQL connection string used by `drizzle-kit` / schema migrations |
| `SESSION_SECRET` | Yes | 32-byte secret used to HMAC-hash optional profile session tokens and OTP codes |
| `CRON_SECRET` | Yes | Bearer secret protecting `/api/cron/maintenance` scheduled hold cleanup |
| `BOOKING_CLOCK_OVERRIDE` | Optional | Optional ISO date/timestamp override (e.g. `2026-12-01T12:00:00Z`) if testing after Dec 14, 2026 |

---

## Architecture Overview

- **`src/domain/` (Pure TypeScript, zero framework or I/O imports)**: Branded integer-cents arithmetic (`Cents`), age-band classification (`0–4` infant, `5–11` child, `12+` adult, `18+` booker, `<18` minor guardian requirement), product & promo evaluation (`SEVA10`, `FLAT20`, `KIDSFREE`, `EXPIRED5`, `MAXEDOUT`), and a composable `DOMAIN_RULE_PIPELINE`.
- **`src/contract/` (Shared Zod DTOs)**: Single source of truth for request/response validation and inferred TypeScript types across frontend and backend (enforced with `@typescript-eslint/no-explicit-any: error`).
- **`src/server/` (Express 5 + Neon Postgres)**: Authoritative rule & price verification, atomic stock reservation (`UPDATE inventory SET remaining = remaining - $qty WHERE ... AND remaining >= $qty`), 10-minute expiring holds, `Idempotency-Key` protection, vector **Festival Pass** & **Invoice** PDF generation (`pdfkit`), and transactional simulated email outbox (`email_outbox`).
- **`src/web/` (React 19 + Vite + Zustand)**:
  - Single-page scroll-spy landing experience (`Home`, `About Us`, `Our Mission`, `Contribute to the Cause`) with a fixed-height expandable Hero Banner whose **Book Now** CTA is pinned outside the truncated viewport.
  - **Individual** and **Group** booking flows with dynamic minor guardian fields, category-vs-age mismatch guidance, coupon testing, same-window simulated payment gateway (`/pay/:bookingId`), and Header **Profile dropdown** (`My Details`, `My Contributions`, `My Bookings` with **Invoice** & **Pass** PDF modals, `Sign Out`).

---

## API Contract

All monetary values are integer cents (`USD`). Errors use a uniform envelope:
```json
{
  "error": {
    "code": "RULES_VIOLATED",
    "message": "Booking validation failed on server.",
    "requestId": "req_91fa2c10b4e1",
    "issues": [{ "path": "booker.age", "code": "BOOKER_UNDER_18", "message": "..." }]
  }
}
```

| Method & Path | Request Body / Headers | Success Response | Error Statuses |
| --- | --- | --- | --- |
| `GET /api/event` | — | `200 { event, days[], products[] }` (live stock counts & status) | `500` |
| `POST /api/quote` | `{ mode, booker, attendees[], familyGroups[], promoCode? }` | `200 { lines[], attendeePasses[], subtotalCents, discountCents, totalCents, promo, warnings[] }` | `400`, `422`, `429` |
| `POST /api/bookings` | Header `Idempotency-Key`; Body `BookingIntent & { paymentMethod, expectedTotalCents }` | `201 { bookingId, reference, status, subtotalCents, discountCents, totalCents, holdExpiresAt, paymentUrl }` | `400`, `409 INSUFFICIENT_STOCK` / `PRICE_CHANGED`, `422` |
| `GET /api/bookings/:id` | — | `200 BookingDetailResponseDTO` (passes + QR data URLs, invoice, email status) | `404` |
| `POST /api/bookings/:id/simulate-pay` | `{ outcome: 'success' \| 'decline' \| 'cancel', method: 'card' \| 'stripe', cardLast4? }` | `200 { bookingId, reference, status, redirectUrl, message }` | `402 PAYMENT_DECLINED`, `404`, `410 HOLD_EXPIRED` |
| `GET /api/bookings/:id/passes.pdf` | Optional `?attendeeId=<uuid>` | `200 application/pdf` (perforated festival pass PDF) | `404`, `409 NOT_CONFIRMED` |
| `GET /api/bookings/:id/invoice.pdf` | — | `200 application/pdf` (itemized receipt/invoice PDF) | `404`, `409 NOT_CONFIRMED` |
| `GET /api/bookings/:id/email` | — | `200 { toEmail, fromEmail, subject, sentAt, htmlBody, attachments[] }` | `404` |
| `GET /api/auth/session` · `POST /api/auth/demo` · `POST /api/auth/request-otp` · `POST /api/auth/verify-otp` · `POST /api/auth/logout` | Optional profile sign-in | `200 { authenticated, user }` / `204` | `400`, `422` |
| `GET / PATCH /api/me` · `GET /api/me/bookings` · `GET /api/me/contributions` | `su_session` cookie | `200` profile / bookings / seeded contribution cards | `401` |
| `GET /api/cron/maintenance` | `Authorization: Bearer <CRON_SECRET>` | `200 { holdsReleased, timestamp }` | `401` |

---

## Decisions I Made (Handling Deliberate Ambiguities)

1. **Festival Dates (`Dec 10–14, 2026`) & Age Reference Date (`2026-12-10`)**: Shifted one month forward from the brief's `Nov 10–14` window to **Thu 10 Dec 2026 – Mon 14 Dec 2026** (with Garba Workshop on **Fri 11 Dec** and **Sun 13 Dec**) so future-date booking validation remains live at review time. Every attendee's age is evaluated **as of Day 1 (`2026-12-10`)** so a child turning 12 mid-festival has one consistent ticket band across all days.
2. **Ages 12–17 (Adult Pass + Minor Guardian Safeguard)**: Attendees aged `12–17` pay the Adult pass rate (`12+`), cannot be the primary booker (`<18`), and are still legal minors—so entering an age of `12–17` on an Adult attendee form smoothly reveals mandatory **Guardian Name & Guardian Phone** fields, enforced by both the API and a Postgres `CHECK` constraint and printed on their festival pass.
3. **Under-5 Toddlers**: Added as an explicit `Under 5 (Free)` attendee option (`$0`), requiring Guardian details and issuing a `$0` festival pass so gate volunteers have an accurate headcount and guardian contact.
4. **`FLAT20` Minimum Order (`> $40.00`) & `$0` Auto-Confirmation**: `FLAT20` requires a booking subtotal strictly over `$40.00` (`minSubtotalExclusiveCents = 4000`), preventing a `$15` single-day pass from applying a `$20` flat coupon (`PROMO_NOT_APPLICABLE`). Legitimate `$0` totals (such as `KIDSFREE` on a child-only booking or Under-5 passes) confirm immediately server-side without routing through a `$0` card charge.
5. **`KIDSFREE` & Anti-Abuse Coupon Limit (1 per Booker & Attendee)**: `KIDSFREE` discounts `DAY_PASS_CHILD` and `ALL_DAY_CHILD` admission lines only and is rejected (`PROMO_NOT_APPLICABLE`) when no child pass exists in the booking. Across all bookings, coupon usage is capped at **1 promotional discount per booker and per attendee** (`PROMO_ALREADY_USED`), so neither the original booker nor any attendee from a discounted booking can return later (as a booker or attendee, with new companions or a different promo code) to stack another coupon.
6. **Unique Passholder & Minor Guardian Safeguards**: Adults and `12–17` minors are deduplicated by normalized phone number, while Children (`5–11`) and Under-5s (`0–4`) are deduplicated by `(guardian phone + child full name)` so a parent can book multiple siblings under one guardian number without allowing duplicate passes for the same child. Minors (`< 18`) also cannot list their own name/phone (or another minor in the booking) as their guardian (`GUARDIAN_SELF_MATCH`).
7. **Family Pass (`$40`) vs Separate Passes**: Rather than silently mutating a family's selection, the UI offers a 1-click `$40` Family Pass bundle when 2 adults + 2 children share a day (saving `$6`), and surfaces a non-blocking `CHEAPER_OPTION_AVAILABLE` warning when separate passes (`2A + 1C = $38`) or a Child All-Day Pass (`$30` vs `4 × $8 = $32`) cost less.
8. **Shared 5-Day Stock Pools + Expiring 10-Minute Holds**: Day passes draw from the shared 5-day unit pool (`380` adult day-pass person-days). Checkout places an atomic 10-minute hold; abandoned holds are lazily released before every stock transaction (plus a daily cron backstop) so abandoned tabs cannot permanently lock the last 2 Garba Workshop seats.
9. **No Mandatory Login Wall**: Browsing and booking work immediately as a guest (satisfying the brief's zero-login-prompt rule), while optional demo/email-OTP sign-in unlocks the Profile dropdown and links bookings made with that email.
10. **Brand Colour Contrast**: Primary `#C99B24` gold buttons use `#2C2C2C` dark text (`5.4:1` AA) instead of white (`2.6:1`), and `#EF1F1F` renders validation exclamation icons/borders paired with `#FF7A7A` (`5.5:1`) error text on dark surfaces.

---

## Scaling to 10 Festivals with 10 Rule Sets

- **Data-driven catalog**: `events`, `products`, `inventory`, and `promo_codes` are already keyed by `event_id` and rule attributes (`pricing_unit`, `day_rule`, `allowed_dates`) rather than hardcoded product names.
- **Declarative rule configuration**: Promote `DOMAIN_RULE_PIPELINE` into a rule registry driven by per-event JSON config rows (`event_rules`: e.g. `minBookerAge`, `minorGuardianMaxAge`, `familyPassLimits`) and move age thresholds (`0–4`, `5–11`, `12+`) into an `event_age_bands` table so committees can launch new festivals via database configuration without redeploying code.

---

## Explicitly Simulated / Out of Scope

- **Payment & Email Delivery**: Both the payment gateway (`/pay/:bookingId` supporting Credit Card & Stripe flows, including decline/cancel simulation) and confirmation email delivery (`email_outbox` + in-app **View Sent Email** modal + real downloadable Festival Pass & Invoice PDFs) are simulated so evaluators need zero external sandbox credentials or custom DNS records.
- **`My Contributions` Cards**: Populated with realistic seeded temple seva/charity records since the `Contribute to the Cause` landing section is informational.
- **Self-service post-payment refunds, date swaps, and organizer admin CRUD**: Omitted to keep the codebase focused on rule accuracy, concurrency safety, and clear UX.
