import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const productCategoryEnum = pgEnum('product_category', ['admission', 'extra']);
export const ageBandEnum = pgEnum('age_band', ['infant', 'child', 'adult']);
export const pricingUnitEnum = pgEnum('pricing_unit', [
  'flat',
  'per_person_per_day',
  'per_day',
  'per_unit',
]);
export const dayRuleEnum = pgEnum('day_rule', [
  'choose_days',
  'all_days',
  'single_day',
  'specific_days',
  'none',
]);
export const promoDiscountTypeEnum = pgEnum('promo_discount_type', [
  'percent',
  'fixed',
  'child_admissions_free',
]);
export const bookingModeEnum = pgEnum('booking_mode', ['individual', 'group']);
export const bookingStatusEnum = pgEnum('booking_status', [
  'pending_payment',
  'confirmed',
  'expired',
  'cancelled',
]);
export const passKindEnum = pgEnum('pass_kind', [
  'day_pass',
  'all_day',
  'family_pass',
  'free_infant',
]);
export const paymentMethodEnum = pgEnum('payment_method', ['card', 'stripe']);
export const paymentStatusEnum = pgEnum('payment_status', ['succeeded', 'declined', 'cancelled']);
export const contributionCategoryEnum = pgEnum('contribution_category', [
  'charity',
  'seva',
  'event',
]);
export const emailStatusEnum = pgEnum('email_status', ['pending', 'sent', 'failed']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    emailNormalized: text('email_normalized').notNull(),
    fullName: text('full_name').notNull(),
    phone: text('phone').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('users_email_normalized_idx').on(t.emailNormalized)],
);

export const authOtps = pgTable(
  'auth_otps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    emailNormalized: text('email_normalized').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('auth_otps_email_idx').on(t.emailNormalized)],
);

export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('user_sessions_token_hash_idx').on(t.tokenHash)],
);

export const contributions = pgTable(
  'contributions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    emailNormalized: text('email_normalized').notNull(),
    title: text('title').notNull(),
    organization: text('organization').notNull(),
    category: contributionCategoryEnum('category').notNull(),
    amountCents: integer('amount_cents'),
    contributedOn: text('contributed_on').notNull(),
    summary: text('summary').notNull(),
    impactBadge: text('impact_badge').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('contributions_email_idx').on(t.emailNormalized)],
);

export const events = pgTable(
  'events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    venue: text('venue').notNull(),
    address: text('address').notNull(),
    timezone: text('timezone').notNull().default('America/Chicago'),
    currency: text('currency').notNull().default('USD'),
    startsOn: text('starts_on').notNull(),
    endsOn: text('ends_on').notNull(),
    ageReferenceDate: text('age_reference_date').notNull(),
    holdMinutes: integer('hold_minutes').notNull().default(10),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('events_slug_idx').on(t.slug)],
);

export const products = pgTable(
  'products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    category: productCategoryEnum('category').notNull(),
    ageBand: text('age_band'),
    pricingUnit: pricingUnitEnum('pricing_unit').notNull(),
    dayRule: dayRuleEnum('day_rule').notNull(),
    allowedDates: jsonb('allowed_dates').$type<string[] | null>(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    maxAdults: integer('max_adults'),
    maxChildren: integer('max_children'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [
    uniqueIndex('products_event_code_idx').on(t.eventId, t.code),
    check('products_price_nonneg', sql`${t.unitPriceCents} >= 0`),
  ],
);

export const inventory = pgTable(
  'inventory',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    total: integer('total').notNull(),
    remaining: integer('remaining').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('inventory_product_idx').on(t.productId),
    check(
      'inventory_remaining_bounds',
      sql`${t.remaining} >= 0 AND ${t.remaining} <= ${t.total}`,
    ),
  ],
);

export const promoCodes = pgTable(
  'promo_codes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    description: text('description').notNull(),
    discountType: promoDiscountTypeEnum('discount_type').notNull(),
    percentBps: integer('percent_bps'),
    amountCents: integer('amount_cents'),
    validFromIso: text('valid_from_iso'),
    validUntilIso: text('valid_until_iso'),
    maxUses: integer('max_uses'),
    usedCount: integer('used_count').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [
    uniqueIndex('promo_codes_event_code_idx').on(t.eventId, t.code),
    check(
      'promo_codes_usage_bounds',
      sql`${t.usedCount} >= 0 AND (${t.maxUses} IS NULL OR ${t.usedCount} <= ${t.maxUses})`,
    ),
  ],
);

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reference: text('reference').notNull(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    mode: bookingModeEnum('mode').notNull(),
    status: bookingStatusEnum('status').notNull().default('pending_payment'),
    bookerFullName: text('booker_full_name').notNull(),
    bookerEmail: text('booker_email').notNull(),
    bookerEmailNormalized: text('booker_email_normalized').notNull(),
    bookerPhone: text('booker_phone').notNull(),
    bookerAge: smallint('booker_age').notNull(),
    promoCodeId: uuid('promo_code_id').references(() => promoCodes.id),
    promoCodeText: text('promo_code_text'),
    subtotalCents: integer('subtotal_cents').notNull(),
    discountCents: integer('discount_cents').notNull(),
    totalCents: integer('total_cents').notNull(),
    currency: text('currency').notNull().default('USD'),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    holdExpiresAt: timestamp('hold_expires_at', { withTimezone: true }).notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('bookings_reference_idx').on(t.reference),
    uniqueIndex('bookings_idempotency_idx').on(t.idempotencyKey),
    index('bookings_status_hold_idx').on(t.status, t.holdExpiresAt),
    index('bookings_email_norm_idx').on(t.bookerEmailNormalized),
    check('bookings_booker_adult', sql`${t.bookerAge} >= 18`),
    check(
      'bookings_totals_nonneg',
      sql`${t.subtotalCents} >= 0 AND ${t.discountCents} >= 0 AND ${t.totalCents} >= 0`,
    ),
  ],
);

export const attendees = pgTable(
  'attendees',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
    passCode: text('pass_code').notNull(),
    isBooker: boolean('is_booker').notNull().default(false),
    selectedCategory: ageBandEnum('selected_category').notNull(),
    ageBand: ageBandEnum('age_band').notNull(),
    fullName: text('full_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    age: smallint('age').notNull(),
    passKind: passKindEnum('pass_kind').notNull(),
    passLabel: text('pass_label').notNull(),
    validDates: jsonb('valid_dates').$type<string[]>().notNull(),
    validDatesDisplay: text('valid_dates_display').notNull(),
    extrasSummary: jsonb('extras_summary').$type<string[]>().notNull(),
    guardianName: text('guardian_name'),
    guardianPhone: text('guardian_phone'),
  },
  (t) => [
    uniqueIndex('attendees_pass_code_idx').on(t.passCode),
    index('attendees_booking_idx').on(t.bookingId),
    check('attendees_age_range', sql`${t.age} >= 0 AND ${t.age} <= 120`),
    check(
      'attendees_minor_guardian_required',
      sql`${t.age} >= 18 OR (${t.guardianName} IS NOT NULL AND length(trim(${t.guardianName})) >= 2 AND ${t.guardianPhone} IS NOT NULL AND length(trim(${t.guardianPhone})) >= 7)`,
    ),
  ],
);

export const bookingLines = pgTable(
  'booking_lines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    productCode: text('product_code').notNull(),
    label: text('label').notNull(),
    eventDate: text('event_date'),
    quantity: integer('quantity').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    lineTotalCents: integer('line_total_cents').notNull(),
  },
  (t) => [
    index('booking_lines_booking_idx').on(t.bookingId),
    check('booking_lines_qty_pos', sql`${t.quantity} > 0`),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    method: paymentMethodEnum('method').notNull(),
    status: paymentStatusEnum('status').notNull(),
    amountCents: integer('amount_cents').notNull(),
    cardLast4: text('card_last4'),
    providerRef: text('provider_ref').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('payments_booking_idx').on(t.bookingId)],
);

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    invoiceNumber: text('invoice_number').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).defaultNow().notNull(),
    billedToName: text('billed_to_name').notNull(),
    billedToEmail: text('billed_to_email').notNull(),
    billedToPhone: text('billed_to_phone').notNull(),
    paymentMethodLabel: text('payment_method_label').notNull(),
    subtotalCents: integer('subtotal_cents').notNull(),
    discountCents: integer('discount_cents').notNull(),
    taxCents: integer('tax_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull(),
  },
  (t) => [
    uniqueIndex('invoices_booking_idx').on(t.bookingId),
    uniqueIndex('invoices_number_idx').on(t.invoiceNumber),
  ],
);

export interface StoredEmailAttachment {
  filename: string;
  url: string;
  contentType: string;
}

export const emailOutbox = pgTable(
  'email_outbox',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    toEmail: text('to_email').notNull(),
    fromEmail: text('from_email').notNull(),
    subject: text('subject').notNull(),
    htmlBody: text('html_body').notNull(),
    textBody: text('text_body').notNull(),
    attachments: jsonb('attachments').$type<StoredEmailAttachment[]>().notNull(),
    status: emailStatusEnum('status').notNull().default('sent'),
    simulatedMessageId: text('simulated_message_id').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('email_outbox_booking_idx').on(t.bookingId)],
);
