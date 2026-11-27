import type pg from 'pg';
import { DEFAULT_CATALOG, DEFAULT_PROMOS, EVENT_METADATA } from '@domain/index';

export const DEMO_PROFILE = {
  email: 'devotee@radhakrishnatemple.net',
  emailNormalized: 'devotee@radhakrishnatemple.net',
  fullName: 'Shreejan Mishra',
  phone: '+1 469-795-9130',
} as const;

export const SEEDED_CONTRIBUTIONS = [
  {
    title: 'Annadanam Community Meal Seva',
    organization: 'Radha Krishna Temple · Allen, TX',
    category: 'seva',
    amountCents: 10100,
    contributedOn: '2026-10-20',
    summary:
      'Sponsored freshly prepared sattvic prasad meals served to 250+ visitors during Diwali Mahotsav.',
    impactBadge: '250+ Meals Served',
  },
  {
    title: 'Bal-Mukund Youth Education Scholarship Fund',
    organization: 'JKYog Charitable Initiatives',
    category: 'charity',
    amountCents: 15100,
    contributedOn: '2026-08-26',
    summary:
      'Supported value-based cultural workshops, books, and learning kits for children during Janmashtami.',
    impactBadge: 'Youth Education',
  },
  {
    title: 'Health & Wellness Free Yoga Camp Volunteer',
    organization: 'Dallas–Fort Worth Community Outreach',
    category: 'event',
    amountCents: null,
    contributedOn: '2026-06-21',
    summary:
      'Contributed 12 volunteer hours coordinating registration, hydration desks, and senior citizen seating.',
    impactBadge: '12 Volunteer Hours',
  },
] as const;

const SCHEMA_DDL = `
DO $$ BEGIN
  CREATE TYPE product_category AS ENUM ('admission', 'extra');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE age_band AS ENUM ('infant', 'child', 'adult');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pricing_unit AS ENUM ('flat', 'per_person_per_day', 'per_day', 'per_unit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE day_rule AS ENUM ('choose_days', 'all_days', 'single_day', 'specific_days', 'none');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE promo_discount_type AS ENUM ('percent', 'fixed', 'child_admissions_free');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE booking_mode AS ENUM ('individual', 'group');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE booking_status AS ENUM ('pending_payment', 'confirmed', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pass_kind AS ENUM ('day_pass', 'all_day', 'family_pass', 'free_infant');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('card', 'stripe');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('succeeded', 'declined', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE contribution_category AS ENUM ('charity', 'seva', 'event');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE email_status AS ENUM ('pending', 'sent', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_otps_email_idx ON auth_otps (email_normalized);

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email_normalized TEXT NOT NULL,
  title TEXT NOT NULL,
  organization TEXT NOT NULL,
  category contribution_category NOT NULL,
  amount_cents INTEGER,
  contributed_on TEXT NOT NULL,
  summary TEXT NOT NULL,
  impact_badge TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contributions_email_idx ON contributions (email_normalized);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  venue TEXT NOT NULL,
  address TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  currency TEXT NOT NULL DEFAULT 'USD',
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  age_reference_date TEXT NOT NULL,
  hold_minutes INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category product_category NOT NULL,
  age_band TEXT,
  pricing_unit pricing_unit NOT NULL,
  day_rule day_rule NOT NULL,
  allowed_dates JSONB,
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  max_adults INTEGER,
  max_children INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (event_id, code)
);

CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
  total INTEGER NOT NULL,
  remaining INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_remaining_bounds CHECK (remaining >= 0 AND remaining <= total)
);

CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  discount_type promo_discount_type NOT NULL,
  percent_bps INTEGER,
  amount_cents INTEGER,
  valid_from_iso TEXT,
  valid_until_iso TEXT,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (event_id, code),
  CONSTRAINT promo_codes_usage_bounds CHECK (used_count >= 0 AND (max_uses IS NULL OR used_count <= max_uses))
);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  event_id UUID NOT NULL REFERENCES events(id),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  mode booking_mode NOT NULL,
  status booking_status NOT NULL DEFAULT 'pending_payment',
  booker_full_name TEXT NOT NULL,
  booker_email TEXT NOT NULL,
  booker_email_normalized TEXT NOT NULL,
  booker_phone TEXT NOT NULL,
  booker_age SMALLINT NOT NULL CHECK (booker_age >= 18),
  promo_code_id UUID REFERENCES promo_codes(id),
  promo_code_text TEXT,
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents INTEGER NOT NULL CHECK (discount_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_method payment_method NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  hold_expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookings_status_hold_idx ON bookings (status, hold_expires_at);
CREATE INDEX IF NOT EXISTS bookings_email_norm_idx ON bookings (booker_email_normalized);

CREATE TABLE IF NOT EXISTS attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL,
  pass_code TEXT NOT NULL UNIQUE,
  is_booker BOOLEAN NOT NULL DEFAULT false,
  selected_category age_band NOT NULL,
  age_band age_band NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  age SMALLINT NOT NULL CHECK (age >= 0 AND age <= 120),
  pass_kind pass_kind NOT NULL,
  pass_label TEXT NOT NULL,
  valid_dates JSONB NOT NULL,
  valid_dates_display TEXT NOT NULL,
  extras_summary JSONB NOT NULL,
  guardian_name TEXT,
  guardian_phone TEXT,
  CONSTRAINT attendees_minor_guardian_required CHECK (
    age >= 18 OR (
      guardian_name IS NOT NULL AND length(trim(guardian_name)) >= 2 AND
      guardian_phone IS NOT NULL AND length(trim(guardian_phone)) >= 7
    )
  )
);
CREATE INDEX IF NOT EXISTS attendees_booking_idx ON attendees (booking_id);

CREATE TABLE IF NOT EXISTS booking_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  product_code TEXT NOT NULL,
  label TEXT NOT NULL,
  event_date TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL,
  line_total_cents INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS booking_lines_booking_idx ON booking_lines (booking_id);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  method payment_method NOT NULL,
  status payment_status NOT NULL,
  amount_cents INTEGER NOT NULL,
  card_last4 TEXT,
  provider_ref TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_booking_idx ON payments (booking_id);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL UNIQUE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  billed_to_name TEXT NOT NULL,
  billed_to_email TEXT NOT NULL,
  billed_to_phone TEXT NOT NULL,
  payment_method_label TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  from_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT NOT NULL,
  attachments JSONB NOT NULL,
  status email_status NOT NULL DEFAULT 'sent',
  simulated_message_id TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

let bootstrapPromise: Promise<void> | null = null;

export async function runSchemaMigrations(pool: pg.Pool): Promise<void> {
  await pool.query(SCHEMA_DDL);
}

export async function seedDatabase(
  pool: pg.Pool,
  options: { resetStock?: boolean } = {},
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Upsert festival event
    const eventRes = await client.query<{ id: string }>(
      `INSERT INTO events (slug, name, venue, address, timezone, currency, starts_on, ends_on, age_reference_date, hold_minutes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         venue = EXCLUDED.venue,
         address = EXCLUDED.address,
         starts_on = EXCLUDED.starts_on,
         ends_on = EXCLUDED.ends_on,
         age_reference_date = EXCLUDED.age_reference_date,
         hold_minutes = EXCLUDED.hold_minutes
       RETURNING id`,
      [
        EVENT_METADATA.slug,
        EVENT_METADATA.name,
        EVENT_METADATA.venue,
        EVENT_METADATA.address,
        EVENT_METADATA.timezone,
        EVENT_METADATA.currency,
        EVENT_METADATA.startsOn,
        EVENT_METADATA.endsOn,
        EVENT_METADATA.ageReferenceDate,
        EVENT_METADATA.holdMinutes,
      ],
    );
    const eventId = eventRes.rows[0]!.id;

    // 2. Upsert products & initial inventory
    for (const item of DEFAULT_CATALOG) {
      const prodRes = await client.query<{ id: string }>(
        `INSERT INTO products (
           event_id, code, name, description, category, age_band, pricing_unit,
           day_rule, allowed_dates, unit_price_cents, max_adults, max_children, sort_order, is_active
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, true)
         ON CONFLICT (event_id, code) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           unit_price_cents = EXCLUDED.unit_price_cents,
           allowed_dates = EXCLUDED.allowed_dates,
           sort_order = EXCLUDED.sort_order
         RETURNING id`,
        [
          eventId,
          item.code,
          item.name,
          item.description,
          item.category,
          item.ageBand,
          item.pricingUnit,
          item.dayRule,
          item.allowedDates ? JSON.stringify(item.allowedDates) : null,
          item.unitPriceCents,
          item.maxAdults,
          item.maxChildren,
          item.sortOrder,
        ],
      );
      const productId = prodRes.rows[0]!.id;

      if (options.resetStock) {
        await client.query(
          `INSERT INTO inventory (product_id, total, remaining, updated_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (product_id) DO UPDATE SET
             total = EXCLUDED.total,
             remaining = EXCLUDED.remaining,
             updated_at = now()`,
          [productId, item.totalStock, item.remainingStock],
        );
      } else {
        await client.query(
          `INSERT INTO inventory (product_id, total, remaining)
           VALUES ($1, $2, $3)
           ON CONFLICT (product_id) DO NOTHING`,
          [productId, item.totalStock, item.remainingStock],
        );
      }
    }

    // 3. Upsert promo codes
    for (const promo of DEFAULT_PROMOS) {
      if (options.resetStock) {
        await client.query(
          `INSERT INTO promo_codes (
             event_id, code, description, discount_type, percent_bps, amount_cents,
             valid_from_iso, valid_until_iso, max_uses, used_count, is_active
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (event_id, code) DO UPDATE SET
             used_count = EXCLUDED.used_count,
             max_uses = EXCLUDED.max_uses,
             valid_until_iso = EXCLUDED.valid_until_iso,
             is_active = EXCLUDED.is_active`,
          [
            eventId,
            promo.code,
            promo.description,
            promo.discountType,
            promo.percentBps,
            promo.amountCents,
            promo.validFromIso,
            promo.validUntilIso,
            promo.maxUses,
            promo.usedCount,
            promo.isActive,
          ],
        );
      } else {
        await client.query(
          `INSERT INTO promo_codes (
             event_id, code, description, discount_type, percent_bps, amount_cents,
             valid_from_iso, valid_until_iso, max_uses, used_count, is_active
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (event_id, code) DO NOTHING`,
          [
            eventId,
            promo.code,
            promo.description,
            promo.discountType,
            promo.percentBps,
            promo.amountCents,
            promo.validFromIso,
            promo.validUntilIso,
            promo.maxUses,
            promo.usedCount,
            promo.isActive,
          ],
        );
      }
    }

    // 4. Upsert demo user & sample contributions
    const userRes = await client.query<{ id: string }>(
      `INSERT INTO users (email, email_normalized, full_name, phone)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email_normalized) DO UPDATE SET
         full_name = EXCLUDED.full_name
       RETURNING id`,
      [
        DEMO_PROFILE.email,
        DEMO_PROFILE.emailNormalized,
        DEMO_PROFILE.fullName,
        DEMO_PROFILE.phone,
      ],
    );
    const demoUserId = userRes.rows[0]!.id;

    const existingContribs = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM contributions WHERE email_normalized = $1`,
      [DEMO_PROFILE.emailNormalized],
    );
    if (Number(existingContribs.rows[0]?.count ?? '0') === 0) {
      for (const c of SEEDED_CONTRIBUTIONS) {
        await client.query(
          `INSERT INTO contributions (
             user_id, email_normalized, title, organization, category,
             amount_cents, contributed_on, summary, impact_badge
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            demoUserId,
            DEMO_PROFILE.emailNormalized,
            c.title,
            c.organization,
            c.category,
            c.amountCents,
            c.contributedOn,
            c.summary,
            c.impactBadge,
          ],
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export function ensureBootstrapped(pool: pg.Pool): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await runSchemaMigrations(pool);
      await seedDatabase(pool, { resetStock: false });
    })().catch((err) => {
      bootstrapPromise = null;
      throw err;
    });
  }
  return bootstrapPromise;
}
