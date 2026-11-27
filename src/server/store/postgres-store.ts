import QRCode from 'qrcode';
import type pg from 'pg';
import type {
  BookingDetailResponseDTO,
  ContributionCardDTO,
  CreateBookingResponseDTO,
  IssuedPassDTO,
  QuoteLineDTO,
  SimulatedEmailResponseDTO,
  UserProfileDTO,
} from '@contract/index';
import {
  cents,
  collectPromoParticipants,
  computeAttendeeIdentityKey,
  EVENT_METADATA,
  formatDatesDisplay,
  normalizeEmail,
  type AgeBand,
  type AttendeeCategoryChoice,
  type BookingMode,
  type CatalogProduct,
  type DayRule,
  type PassKind,
  type PaymentMethodChoice,
  type PricingUnit,
  type PriorPromoRedemptionMatch,
  type ProductCategory,
  type ProductCode,
  type PromoDefinition,
  type PromoDiscountType,
  type PromoParticipant,
} from '@domain/index';
import {
  DEMO_PROFILE,
  ensureBootstrapped,
  SEEDED_CONTRIBUTIONS,
  seedDatabase,
} from '../db/bootstrap';
import type { StoredEmailAttachment } from '../db/schema';
import { renderConfirmationEmail } from '../email/confirmation-template';
import {
  ConflictError,
  GoneError,
  NotFoundError,
  PaymentDeclinedError,
  RuleViolationError,
} from '../http/app-errors';
import {
  generateBookingReference,
  generateInvoiceNumber,
  generatePassCode,
  generateSimulatedMessageId,
} from '../lib/reference';
import type { BookingDataStore, ConfirmPaymentInput, CreateHoldInput } from './types';

const SELLER_EIN = '47-1928374 (501(c)(3) Tax-Exempt)';

async function releaseExpiredInTx(client: pg.PoolClient, now: Date): Promise<number> {
  const expiredRes = await client.query<{ id: string; promo_code_id: string | null }>(
    `UPDATE bookings
        SET status = 'expired'
      WHERE status = 'pending_payment' AND hold_expires_at <= $1
      RETURNING id, promo_code_id`,
    [now.toISOString()],
  );

  if (expiredRes.rows.length === 0) {
    return 0;
  }

  const expiredIds = expiredRes.rows.map((r) => r.id);
  const lineTotals = await client.query<{ product_id: string; qty: string }>(
    `SELECT product_id, SUM(quantity)::text AS qty
       FROM booking_lines
      WHERE booking_id = ANY($1::uuid[])
      GROUP BY product_id`,
    [expiredIds],
  );

  for (const row of lineTotals.rows) {
    await client.query(
      `UPDATE inventory
          SET remaining = LEAST(total, remaining + $1), updated_at = now()
        WHERE product_id = $2`,
      [Number(row.qty), row.product_id],
    );
  }

  const promoIds = expiredRes.rows
    .map((r) => r.promo_code_id)
    .filter((id): id is string => Boolean(id));
  for (const promoId of promoIds) {
    await client.query(
      `UPDATE promo_codes
          SET used_count = GREATEST(0, used_count - 1)
        WHERE id = $1`,
      [promoId],
    );
  }

  return expiredRes.rows.length;
}

export class PostgresDataStore implements BookingDataStore {
  constructor(private readonly pool: pg.Pool) {}

  private async ready(): Promise<void> {
    await ensureBootstrapped(this.pool);
  }

  async getCatalogAndPromos(): Promise<{
    products: CatalogProduct[];
    promos: PromoDefinition[];
  }> {
    await this.ready();

    const prodRows = await this.pool.query<{
      code: ProductCode;
      name: string;
      description: string;
      category: ProductCategory;
      age_band: 'adult' | 'child' | null;
      pricing_unit: PricingUnit;
      day_rule: DayRule;
      allowed_dates: string[] | null;
      unit_price_cents: number;
      max_adults: number | null;
      max_children: number | null;
      sort_order: number;
      total: number;
      remaining: number;
    }>(
      `SELECT p.code, p.name, p.description, p.category, p.age_band,
              p.pricing_unit, p.day_rule, p.allowed_dates, p.unit_price_cents,
              p.max_adults, p.max_children, p.sort_order,
              i.total, i.remaining
         FROM products p
         JOIN inventory i ON i.product_id = p.id
        WHERE p.is_active = true
        ORDER BY p.sort_order ASC`,
    );

    const promoRows = await this.pool.query<{
      code: string;
      description: string;
      discount_type: PromoDiscountType;
      percent_bps: number | null;
      amount_cents: number | null;
      min_subtotal_exclusive_cents: number | null;
      valid_from_iso: string | null;
      valid_until_iso: string | null;
      max_uses: number | null;
      used_count: number;
      is_active: boolean;
    }>(
      `SELECT code, description, discount_type, percent_bps, amount_cents,
              min_subtotal_exclusive_cents, valid_from_iso, valid_until_iso,
              max_uses, used_count, is_active
         FROM promo_codes`,
    );

    return {
      products: prodRows.rows.map((r) => ({
        code: r.code,
        name: r.name,
        description: r.description,
        category: r.category,
        ageBand: r.age_band,
        pricingUnit: r.pricing_unit,
        dayRule: r.day_rule,
        allowedDates: r.allowed_dates,
        unitPriceCents: cents(r.unit_price_cents),
        totalStock: r.total,
        remainingStock: r.remaining,
        maxAdults: r.max_adults,
        maxChildren: r.max_children,
        sortOrder: r.sort_order,
      })),
      promos: promoRows.rows.map((p) => ({
        code: p.code,
        description: p.description,
        discountType: p.discount_type,
        percentBps: p.percent_bps,
        amountCents: p.amount_cents !== null ? cents(p.amount_cents) : null,
        minSubtotalExclusiveCents:
          p.min_subtotal_exclusive_cents !== null ? cents(p.min_subtotal_exclusive_cents) : null,
        validFromIso: p.valid_from_iso,
        validUntilIso: p.valid_until_iso,
        maxUses: p.max_uses,
        usedCount: p.used_count,
        isActive: p.is_active,
      })),
    };
  }

  async releaseExpiredHolds(now: Date): Promise<number> {
    await this.ready();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const released = await releaseExpiredInTx(client, now);
      await client.query('COMMIT');
      return released;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async queryPriorPromoRedemption(
    queryable: { query: pg.PoolClient['query'] },
    participants: readonly PromoParticipant[],
    now: Date,
  ): Promise<PriorPromoRedemptionMatch | null> {
    if (participants.length === 0) return null;

    const bookingRows = await queryable.query<{
      id: string;
      reference: string;
      promo_code_text: string;
      booker_full_name: string;
      booker_email: string;
      booker_phone: string;
    }>(
      `SELECT id, reference, promo_code_text, booker_full_name, booker_email, booker_phone
         FROM bookings
        WHERE promo_code_text IS NOT NULL
          AND (status = 'confirmed' OR (status = 'pending_payment' AND hold_expires_at > $1))
        ORDER BY created_at ASC`,
      [now.toISOString()],
    );

    if (bookingRows.rows.length === 0) return null;

    const bookingIds = bookingRows.rows.map((b) => b.id);
    const attRows = await queryable.query<{
      booking_id: string;
      selected_category: AgeBand;
      full_name: string;
      email: string | null;
      phone: string | null;
      guardian_phone: string | null;
    }>(
      `SELECT booking_id, selected_category, full_name, email, phone, guardian_phone
         FROM attendees
        WHERE booking_id = ANY($1::uuid[])`,
      [bookingIds],
    );

    const attendeesByBooking = new Map<string, typeof attRows.rows>();
    for (const row of attRows.rows) {
      const list = attendeesByBooking.get(row.booking_id) ?? [];
      list.push(row);
      attendeesByBooking.set(row.booking_id, list);
    }

    for (const bk of bookingRows.rows) {
      const storedParticipants = collectPromoParticipants({
        booker: {
          fullName: bk.booker_full_name,
          email: bk.booker_email,
          phone: bk.booker_phone,
        },
        attendees: (attendeesByBooking.get(bk.id) ?? []).map((a) => ({
          category: a.selected_category,
          fullName: a.full_name,
          email: a.email,
          phone: a.phone,
          guardianPhone: a.guardian_phone,
        })),
      });
      const storedKeySet = new Set(storedParticipants.map((sp) => sp.key));

      for (const incoming of participants) {
        if (storedKeySet.has(incoming.key)) {
          return {
            participantLabel: incoming.label,
            bookingReference: bk.reference,
            promoCode: bk.promo_code_text,
          };
        }
      }
    }

    return null;
  }

  async findPriorPromoRedemption(
    participants: readonly PromoParticipant[],
    now: Date,
  ): Promise<PriorPromoRedemptionMatch | null> {
    await this.ready();
    return this.queryPriorPromoRedemption(this.pool, participants, now);
  }

  async createBookingHold(input: CreateHoldInput): Promise<CreateBookingResponseDTO> {
    await this.ready();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Idempotency check
      const existing = await client.query<{
        id: string;
        reference: string;
        status: 'pending_payment' | 'confirmed' | 'expired' | 'cancelled';
        subtotal_cents: number;
        discount_cents: number;
        total_cents: number;
        hold_expires_at: Date;
        payment_method: PaymentMethodChoice;
        request_hash: string;
      }>(
        `SELECT id, reference, status, subtotal_cents, discount_cents, total_cents,
                hold_expires_at, payment_method, request_hash
           FROM bookings
          WHERE idempotency_key = $1
          FOR UPDATE`,
        [input.idempotencyKey],
      );

      if (existing.rows.length > 0) {
        const row = existing.rows[0]!;
        if (row.request_hash !== input.requestHash) {
          throw new RuleViolationError(
            'Idempotency-Key has already been used with a different booking payload.',
            [
              {
                path: 'idempotencyKey',
                code: 'IDEMPOTENCY_KEY_REUSED',
                message: 'Start a fresh checkout attempt for modified booking details.',
              },
            ],
            'IDEMPOTENCY_KEY_REUSED',
          );
        }
        if (row.status === 'pending_payment' || row.status === 'confirmed') {
          await client.query('COMMIT');
          return {
            bookingId: row.id,
            reference: row.reference,
            status: row.status,
            currency: 'USD',
            subtotalCents: row.subtotal_cents,
            discountCents: row.discount_cents,
            totalCents: row.total_cents,
            holdExpiresAt: row.hold_expires_at.toISOString(),
            paymentMethod: row.payment_method,
            paymentUrl:
              row.status === 'confirmed'
                ? null
                : `/pay/${row.id}?method=${row.payment_method}`,
          };
        }
      }

      // 2. Lazily release any expired holds first
      await releaseExpiredInTx(client, input.now);

      // 3. Event lookup
      const evRes = await client.query<{ id: string; hold_minutes: number }>(
        `SELECT id, hold_minutes FROM events WHERE slug = $1`,
        [EVENT_METADATA.slug],
      );
      const eventRow = evRes.rows[0]!;

      // 3b. Prevent issuing duplicate passes to the same individual on overlapping festival evenings
      const activeHolderRows = await client.query<{
        reference: string;
        selected_category: AgeBand;
        full_name: string;
        phone: string | null;
        guardian_phone: string | null;
        valid_dates: string[];
      }>(
        `SELECT b.reference, a.selected_category, a.full_name, a.phone, a.guardian_phone, a.valid_dates
           FROM attendees a
           JOIN bookings b ON b.id = a.booking_id
          WHERE b.event_id = $1
            AND (b.status = 'confirmed' OR (b.status = 'pending_payment' AND b.hold_expires_at > $2))`,
        [eventRow.id, input.now.toISOString()],
      );

      for (const pass of input.quote.attendeePasses) {
        const incomingKey = computeAttendeeIdentityKey({
          category: pass.ageBand,
          fullName: pass.fullName,
          phone: pass.phone,
          guardianPhone: pass.guardian?.phone ?? null,
        });
        if (!incomingKey) continue;

        for (const row of activeHolderRows.rows) {
          const existingKey = computeAttendeeIdentityKey({
            category: row.selected_category,
            fullName: row.full_name,
            phone: row.phone,
            guardianPhone: row.guardian_phone,
          });
          if (existingKey !== incomingKey) continue;

          const overlap = pass.validDates.filter((d) => row.valid_dates.includes(d));
          if (overlap.length > 0) {
            throw new ConflictError(
              'DUPLICATE_PASS_HOLDER',
              `${pass.fullName} already holds an active or confirmed pass for ${formatDatesDisplay(overlap)} (Ref ${row.reference}).`,
              [
                {
                  path: 'attendees',
                  code: 'DUPLICATE_ATTENDEE',
                  message: `${pass.fullName} already holds a pass for ${formatDatesDisplay(overlap)}.`,
                },
              ],
            );
          }
        }
      }

      // 4. Deterministic atomic stock reservation ordered by product code (prevents deadlocks)
      const sortedDemand = [...input.quote.stockDemand.entries()].sort(([a], [b]) =>
        a.localeCompare(b),
      );
      const productIdByCode = new Map<string, string>();

      for (const [code, qty] of sortedDemand) {
        if (qty <= 0) continue;
        const upd = await client.query<{ product_id: string }>(
          `UPDATE inventory i
              SET remaining = i.remaining - $1, updated_at = now()
             FROM products p
            WHERE i.product_id = p.id
              AND p.event_id = $2
              AND p.code = $3
              AND i.remaining >= $1
            RETURNING p.id AS product_id`,
          [qty, eventRow.id, code],
        );

        if (upd.rows.length === 0) {
          const cur = await client.query<{ name: string; remaining: number }>(
            `SELECT p.name, i.remaining
               FROM products p
               JOIN inventory i ON i.product_id = p.id
              WHERE p.event_id = $1 AND p.code = $2`,
            [eventRow.id, code],
          );
          const prodName = cur.rows[0]?.name ?? code;
          const rem = cur.rows[0]?.remaining ?? 0;
          throw new ConflictError(
            'INSUFFICIENT_STOCK',
            rem <= 0
              ? `${prodName} just sold out.`
              : `Only ${rem} ${prodName} remaining — someone else just booked the remaining spots.`,
            [
              {
                path: `stock.${code}`,
                code: rem <= 0 ? 'PRODUCT_SOLD_OUT' : 'INSUFFICIENT_STOCK',
                message: `Available: ${rem}, requested: ${qty}.`,
              },
            ],
          );
        }
        productIdByCode.set(code, upd.rows[0]!.product_id);
      }

      // Resolve any remaining product IDs needed for lines
      const allProdRows = await client.query<{ id: string; code: string }>(
        `SELECT id, code FROM products WHERE event_id = $1`,
        [eventRow.id],
      );
      for (const pr of allProdRows.rows) {
        productIdByCode.set(pr.code, pr.id);
      }

      // 5. Atomic promo usage reservation + anti-abuse check
      let promoCodeId: string | null = null;
      let promoCodeText: string | null = null;
      if (input.quote.promo.status === 'applied') {
        const currentPromoParticipants = collectPromoParticipants({
          booker: input.booker,
          attendees: input.quote.attendeePasses.map((p) => ({
            category: p.ageBand,
            fullName: p.fullName,
            email: p.email,
            phone: p.phone,
            guardianPhone: p.guardian?.phone ?? null,
          })),
        });
        const priorRedemption = await this.queryPriorPromoRedemption(
          client,
          currentPromoParticipants,
          input.now,
        );
        if (priorRedemption) {
          throw new ConflictError(
            'PROMO_ALREADY_USED',
            `Coupon limit reached: ${priorRedemption.participantLabel} already benefited from promo code ${priorRedemption.promoCode} on booking ${priorRedemption.bookingReference}. Coupons are limited to 1 per booker and attendee.`,
            [
              {
                path: 'promoCode',
                code: 'PROMO_ALREADY_USED',
                message: `${priorRedemption.participantLabel} already used promo code ${priorRedemption.promoCode} on booking ${priorRedemption.bookingReference}.`,
              },
            ],
          );
        }

        const promoRes = await client.query<{ id: string; code: string }>(
          `UPDATE promo_codes
              SET used_count = used_count + 1
            WHERE event_id = $1
              AND code = $2
              AND is_active = true
              AND (max_uses IS NULL OR used_count < max_uses)
              AND (valid_until_iso IS NULL OR valid_until_iso > $3)
            RETURNING id, code`,
          [eventRow.id, input.quote.promo.code, input.now.toISOString()],
        );
        if (promoRes.rows.length === 0) {
          throw new ConflictError(
            'PROMO_EXHAUSTED',
            `Promo code "${input.quote.promo.code}" is no longer available.`,
          );
        }
        promoCodeId = promoRes.rows[0]!.id;
        promoCodeText = promoRes.rows[0]!.code;
      }

      // 6. Insert booking + attendees + lines
      const autoConfirm = input.quote.totalCents === 0;
      const status = autoConfirm ? 'confirmed' : 'pending_payment';
      const holdExpiresAt = new Date(
        input.now.getTime() + eventRow.hold_minutes * 60 * 1000,
      );
      const reference = generateBookingReference();

      const bookingRes = await client.query<{ id: string }>(
        `INSERT INTO bookings (
           reference, event_id, user_id, mode, status,
           booker_full_name, booker_email, booker_email_normalized, booker_phone, booker_age,
           promo_code_id, promo_code_text,
           subtotal_cents, discount_cents, total_cents, currency,
           payment_method, idempotency_key, request_hash, hold_expires_at, confirmed_at
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'USD',$16,$17,$18,$19,$20)
         RETURNING id`,
        [
          reference,
          eventRow.id,
          input.userId,
          input.mode,
          status,
          input.booker.fullName.trim(),
          input.booker.email.trim(),
          normalizeEmail(input.booker.email),
          input.booker.phone.trim(),
          input.booker.age,
          promoCodeId,
          promoCodeText,
          input.quote.subtotalCents,
          input.quote.discountCents,
          input.quote.totalCents,
          input.paymentMethod,
          input.idempotencyKey,
          input.requestHash,
          holdExpiresAt.toISOString(),
          autoConfirm ? input.now.toISOString() : null,
        ],
      );
      const bookingId = bookingRes.rows[0]!.id;

      const issuedPasses: IssuedPassDTO[] = [];
      for (let i = 0; i < input.quote.attendeePasses.length; i += 1) {
        const p = input.quote.attendeePasses[i]!;
        const passCode = generatePassCode();
        const attRes = await client.query<{ id: string }>(
          `INSERT INTO attendees (
             booking_id, position, pass_code, is_booker,
             selected_category, age_band, full_name, email, phone, age,
             pass_kind, pass_label, valid_dates, valid_dates_display,
             extras_summary, guardian_name, guardian_phone
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15::jsonb,$16,$17)
           RETURNING id`,
          [
            bookingId,
            i,
            passCode,
            i === 0 && input.booker.isAttending,
            p.ageBand,
            p.ageBand,
            p.fullName,
            p.email,
            p.phone,
            p.age,
            p.passKind,
            p.passLabel,
            JSON.stringify(p.validDates),
            p.validDatesDisplay,
            JSON.stringify(p.extrasSummary),
            p.guardian?.name ?? null,
            p.guardian?.phone ?? null,
          ],
        );

        issuedPasses.push({
          attendeeId: attRes.rows[0]!.id,
          passCode,
          fullName: p.fullName,
          age: p.age,
          ageBand: p.ageBand,
          selectedCategory: p.ageBand,
          passKind: p.passKind,
          passLabel: p.passLabel,
          validDates: [...p.validDates],
          validDatesDisplay: p.validDatesDisplay,
          extrasSummary: [...p.extrasSummary],
          guardianName: p.guardian?.name ?? null,
          guardianPhone: p.guardian?.phone ?? null,
        });
      }

      const quoteLinesDto: QuoteLineDTO[] = [];
      for (const line of input.quote.lines) {
        const productId = productIdByCode.get(line.productCode);
        if (!productId) {
          throw new Error(`Missing product_id for ${line.productCode}`);
        }
        await client.query(
          `INSERT INTO booking_lines (
             booking_id, product_id, product_code, label, event_date,
             quantity, unit_price_cents, line_total_cents
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            bookingId,
            productId,
            line.productCode,
            line.label,
            line.eventDate,
            line.quantity,
            line.unitPriceCents,
            line.lineTotalCents,
          ],
        );
        quoteLinesDto.push({
          productCode: line.productCode,
          label: line.label,
          attendeeClientId: line.attendeeClientId,
          familyGroupId: line.familyGroupId,
          eventDate: line.eventDate,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          lineTotalCents: line.lineTotalCents,
        });
      }

      if (autoConfirm) {
        const invoiceNumber = generateInvoiceNumber();
        await client.query(
          `INSERT INTO invoices (
             booking_id, invoice_number, issued_at,
             billed_to_name, billed_to_email, billed_to_phone,
             payment_method_label, subtotal_cents, discount_cents, tax_cents, total_cents
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10)`,
          [
            bookingId,
            invoiceNumber,
            input.now.toISOString(),
            input.booker.fullName.trim(),
            input.booker.email.trim(),
            input.booker.phone.trim(),
            'Complimentary ($0 Total after Promo)',
            input.quote.subtotalCents,
            input.quote.discountCents,
            0,
          ],
        );

        const rendered = renderConfirmationEmail({
          bookingId,
          reference,
          bookerName: input.booker.fullName.trim(),
          bookerEmail: input.booker.email.trim(),
          invoiceNumber,
          subtotalCents: input.quote.subtotalCents,
          discountCents: input.quote.discountCents,
          totalCents: 0,
          promoCode: promoCodeText,
          passes: issuedPasses,
          lines: quoteLinesDto,
        });

        await client.query(
          `INSERT INTO email_outbox (
             booking_id, to_email, from_email, subject, html_body, text_body,
             attachments, status, simulated_message_id, sent_at
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'sent',$8,$9)
           ON CONFLICT (booking_id) DO NOTHING`,
          [
            bookingId,
            rendered.toEmail,
            rendered.fromEmail,
            rendered.subject,
            rendered.htmlBody,
            rendered.textBody,
            JSON.stringify(rendered.attachments),
            generateSimulatedMessageId(),
            input.now.toISOString(),
          ],
        );
      }

      await client.query('COMMIT');

      return {
        bookingId,
        reference,
        status,
        currency: 'USD',
        subtotalCents: input.quote.subtotalCents,
        discountCents: input.quote.discountCents,
        totalCents: input.quote.totalCents,
        holdExpiresAt: holdExpiresAt.toISOString(),
        paymentMethod: input.paymentMethod,
        paymentUrl: autoConfirm ? null : `/pay/${bookingId}?method=${input.paymentMethod}`,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async processSimulatedPayment(input: ConfirmPaymentInput): Promise<{
    bookingId: string;
    reference: string;
    status: 'pending_payment' | 'confirmed' | 'cancelled';
  }> {
    await this.ready();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const bkRes = await client.query<{
        id: string;
        reference: string;
        status: 'pending_payment' | 'confirmed' | 'expired' | 'cancelled';
        booker_full_name: string;
        booker_email: string;
        booker_phone: string;
        promo_code_id: string | null;
        promo_code_text: string | null;
        subtotal_cents: number;
        discount_cents: number;
        total_cents: number;
        hold_expires_at: Date;
      }>(
        `SELECT id, reference, status, booker_full_name, booker_email, booker_phone,
                promo_code_id, promo_code_text, subtotal_cents, discount_cents, total_cents,
                hold_expires_at
           FROM bookings
          WHERE id = $1
          FOR UPDATE`,
        [input.bookingId],
      );

      if (bkRes.rows.length === 0) {
        throw new NotFoundError('Booking not found.');
      }

      const booking = bkRes.rows[0]!;

      // Idempotent double-submit protection
      if (booking.status === 'confirmed') {
        await client.query('COMMIT');
        return {
          bookingId: booking.id,
          reference: booking.reference,
          status: 'confirmed',
        };
      }

      if (booking.status === 'cancelled') {
        throw new GoneError('BOOKING_CANCELLED', 'This booking was cancelled.');
      }

      if (booking.status === 'expired' || booking.hold_expires_at <= input.now) {
        await releaseExpiredInTx(client, input.now);
        await client.query('COMMIT');
        throw new GoneError(
          'HOLD_EXPIRED',
          'Your 10-minute reservation hold expired. Please return to the booking form and confirm again.',
        );
      }

      const providerRef = `sim_pay_${generateSimulatedMessageId()}`;

      if (input.outcome === 'decline') {
        await client.query(
          `INSERT INTO payments (booking_id, method, status, amount_cents, card_last4, provider_ref)
           VALUES ($1,$2,'declined',$3,$4,$5)`,
          [booking.id, input.method, booking.total_cents, input.cardLast4 ?? '0002', providerRef],
        );
        await client.query('COMMIT');
        throw new PaymentDeclinedError();
      }

      if (input.outcome === 'cancel') {
        await client.query(`UPDATE bookings SET status = 'cancelled' WHERE id = $1`, [booking.id]);

        // Return held stock & promo usage
        const lines = await client.query<{ product_id: string; quantity: number }>(
          `SELECT product_id, quantity FROM booking_lines WHERE booking_id = $1`,
          [booking.id],
        );
        for (const l of lines.rows) {
          await client.query(
            `UPDATE inventory SET remaining = LEAST(total, remaining + $1), updated_at = now() WHERE product_id = $2`,
            [l.quantity, l.product_id],
          );
        }
        if (booking.promo_code_id) {
          await client.query(
            `UPDATE promo_codes SET used_count = GREATEST(0, used_count - 1) WHERE id = $1`,
            [booking.promo_code_id],
          );
        }
        await client.query(
          `INSERT INTO payments (booking_id, method, status, amount_cents, card_last4, provider_ref)
           VALUES ($1,$2,'cancelled',$3,$4,$5)`,
          [booking.id, input.method, booking.total_cents, input.cardLast4 ?? null, providerRef],
        );
        await client.query('COMMIT');
        return {
          bookingId: booking.id,
          reference: booking.reference,
          status: 'cancelled',
        };
      }

      // Success path: confirm booking, record payment, issue invoice, queue simulated email
      await client.query(
        `UPDATE bookings
            SET status = 'confirmed', payment_method = $2, confirmed_at = $3
          WHERE id = $1`,
        [booking.id, input.method, input.now.toISOString()],
      );

      await client.query(
        `INSERT INTO payments (booking_id, method, status, amount_cents, card_last4, provider_ref)
         VALUES ($1,$2,'succeeded',$3,$4,$5)`,
        [booking.id, input.method, booking.total_cents, input.cardLast4 ?? '4242', providerRef],
      );

      const methodLabel =
        input.method === 'stripe'
          ? `Stripe Simulated Checkout (•••• ${input.cardLast4 ?? '4242'})`
          : `Credit Card Simulated (•••• ${input.cardLast4 ?? '4242'})`;
      const invoiceNumber = generateInvoiceNumber();

      await client.query(
        `INSERT INTO invoices (
           booking_id, invoice_number, issued_at,
           billed_to_name, billed_to_email, billed_to_phone,
           payment_method_label, subtotal_cents, discount_cents, tax_cents, total_cents
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10)
         ON CONFLICT (booking_id) DO NOTHING`,
        [
          booking.id,
          invoiceNumber,
          input.now.toISOString(),
          booking.booker_full_name,
          booking.booker_email,
          booking.booker_phone,
          methodLabel,
          booking.subtotal_cents,
          booking.discount_cents,
          booking.total_cents,
        ],
      );

      const passRows = await client.query<{
        id: string;
        pass_code: string;
        full_name: string;
        age: number;
        age_band: AgeBand;
        selected_category: AttendeeCategoryChoice;
        pass_kind: PassKind;
        pass_label: string;
        valid_dates: string[];
        valid_dates_display: string;
        extras_summary: string[];
        guardian_name: string | null;
        guardian_phone: string | null;
      }>(
        `SELECT id, pass_code, full_name, age, age_band, selected_category,
                pass_kind, pass_label, valid_dates, valid_dates_display,
                extras_summary, guardian_name, guardian_phone
           FROM attendees
          WHERE booking_id = $1
          ORDER BY position ASC`,
        [booking.id],
      );

      const lineRows = await client.query<{
        product_code: string;
        label: string;
        event_date: string | null;
        quantity: number;
        unit_price_cents: number;
        line_total_cents: number;
      }>(
        `SELECT product_code, label, event_date, quantity, unit_price_cents, line_total_cents
           FROM booking_lines
          WHERE booking_id = $1`,
        [booking.id],
      );

      const rendered = renderConfirmationEmail({
        bookingId: booking.id,
        reference: booking.reference,
        bookerName: booking.booker_full_name,
        bookerEmail: booking.booker_email,
        invoiceNumber,
        subtotalCents: booking.subtotal_cents,
        discountCents: booking.discount_cents,
        totalCents: booking.total_cents,
        promoCode: booking.promo_code_text,
        passes: passRows.rows.map((p) => ({
          attendeeId: p.id,
          passCode: p.pass_code,
          fullName: p.full_name,
          age: p.age,
          ageBand: p.age_band,
          selectedCategory: p.selected_category,
          passKind: p.pass_kind,
          passLabel: p.pass_label,
          validDates: p.valid_dates,
          validDatesDisplay: p.valid_dates_display,
          extrasSummary: p.extras_summary,
          guardianName: p.guardian_name,
          guardianPhone: p.guardian_phone,
        })),
        lines: lineRows.rows.map((l) => ({
          productCode: l.product_code,
          label: l.label,
          attendeeClientId: null,
          familyGroupId: null,
          eventDate: l.event_date,
          quantity: l.quantity,
          unitPriceCents: l.unit_price_cents,
          lineTotalCents: l.line_total_cents,
        })),
      });

      await client.query(
        `INSERT INTO email_outbox (
           booking_id, to_email, from_email, subject, html_body, text_body,
           attachments, status, simulated_message_id, sent_at
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'sent',$8,$9)
         ON CONFLICT (booking_id) DO NOTHING`,
        [
          booking.id,
          rendered.toEmail,
          rendered.fromEmail,
          rendered.subject,
          rendered.htmlBody,
          rendered.textBody,
          JSON.stringify(rendered.attachments),
          generateSimulatedMessageId(),
          input.now.toISOString(),
        ],
      );

      await client.query('COMMIT');
      return {
        bookingId: booking.id,
        reference: booking.reference,
        status: 'confirmed',
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getBookingDetail(
    bookingId: string,
    now: Date,
  ): Promise<BookingDetailResponseDTO | null> {
    await this.ready();
    await this.releaseExpiredHolds(now);

    const bkRes = await this.pool.query<{
      id: string;
      reference: string;
      mode: BookingMode;
      status: 'pending_payment' | 'confirmed' | 'expired' | 'cancelled';
      booker_full_name: string;
      booker_email: string;
      booker_phone: string;
      booker_age: number;
      payment_method: PaymentMethodChoice;
      subtotal_cents: number;
      discount_cents: number;
      total_cents: number;
      promo_code_text: string | null;
      hold_expires_at: Date;
      created_at: Date;
      confirmed_at: Date | null;
    }>(
      `SELECT id, reference, mode, status, booker_full_name, booker_email,
              booker_phone, booker_age, payment_method, subtotal_cents,
              discount_cents, total_cents, promo_code_text,
              hold_expires_at, created_at, confirmed_at
         FROM bookings
        WHERE id = $1`,
      [bookingId],
    );

    if (bkRes.rows.length === 0) {
      return null;
    }
    const bk = bkRes.rows[0]!;

    const [attRes, lineRes, invRes, emRes] = await Promise.all([
      this.pool.query<{
        id: string;
        pass_code: string;
        full_name: string;
        age: number;
        age_band: AgeBand;
        selected_category: AttendeeCategoryChoice;
        pass_kind: PassKind;
        pass_label: string;
        valid_dates: string[];
        valid_dates_display: string;
        extras_summary: string[];
        guardian_name: string | null;
        guardian_phone: string | null;
      }>(
        `SELECT id, pass_code, full_name, age, age_band, selected_category,
                pass_kind, pass_label, valid_dates, valid_dates_display,
                extras_summary, guardian_name, guardian_phone
           FROM attendees
          WHERE booking_id = $1
          ORDER BY position ASC`,
        [bookingId],
      ),
      this.pool.query<{
        product_code: string;
        label: string;
        event_date: string | null;
        quantity: number;
        unit_price_cents: number;
        line_total_cents: number;
      }>(
        `SELECT product_code, label, event_date, quantity, unit_price_cents, line_total_cents
           FROM booking_lines
          WHERE booking_id = $1`,
        [bookingId],
      ),
      this.pool.query<{
        invoice_number: string;
        issued_at: Date;
        billed_to_name: string;
        billed_to_email: string;
        billed_to_phone: string;
        payment_method_label: string;
        subtotal_cents: number;
        discount_cents: number;
        tax_cents: number;
        total_cents: number;
      }>(
        `SELECT invoice_number, issued_at, billed_to_name, billed_to_email,
                billed_to_phone, payment_method_label, subtotal_cents,
                discount_cents, tax_cents, total_cents
           FROM invoices
          WHERE booking_id = $1`,
        [bookingId],
      ),
      this.pool.query<{
        status: 'pending' | 'sent' | 'failed';
        to_email: string;
        subject: string;
        sent_at: Date | null;
      }>(
        `SELECT status, to_email, subject, sent_at
           FROM email_outbox
          WHERE booking_id = $1`,
        [bookingId],
      ),
    ]);

    const passes: IssuedPassDTO[] = await Promise.all(
      attRes.rows.map(async (p) => ({
        attendeeId: p.id,
        passCode: p.pass_code,
        fullName: p.full_name,
        age: p.age,
        ageBand: p.age_band,
        selectedCategory: p.selected_category,
        passKind: p.pass_kind,
        passLabel: p.pass_label,
        validDates: p.valid_dates,
        validDatesDisplay: p.valid_dates_display,
        extrasSummary: p.extras_summary,
        guardianName: p.guardian_name,
        guardianPhone: p.guardian_phone,
        qrDataUrl: await QRCode.toDataURL(
          JSON.stringify({ ref: bk.reference, pass: p.pass_code, holder: p.full_name }),
          { width: 160, margin: 1, color: { dark: '#291900', light: '#FDF3E4' } },
        ),
      })),
    );

    const inv = invRes.rows[0];
    const em = emRes.rows[0];

    return {
      bookingId: bk.id,
      reference: bk.reference,
      mode: bk.mode,
      status: bk.status,
      event: {
        name: EVENT_METADATA.name,
        venue: EVENT_METADATA.venue,
        address: EVENT_METADATA.address,
        datesLabel: 'Thu 10 Dec 2026 – Mon 14 Dec 2026',
      },
      booker: {
        fullName: bk.booker_full_name,
        email: bk.booker_email,
        phone: bk.booker_phone,
        age: bk.booker_age,
      },
      paymentMethod: bk.payment_method,
      subtotalCents: bk.subtotal_cents,
      discountCents: bk.discount_cents,
      totalCents: bk.total_cents,
      promoCode: bk.promo_code_text,
      holdExpiresAt: bk.hold_expires_at.toISOString(),
      createdAt: bk.created_at.toISOString(),
      confirmedAt: bk.confirmed_at ? bk.confirmed_at.toISOString() : null,
      lines: lineRes.rows.map((l) => ({
        productCode: l.product_code,
        label: l.label,
        attendeeClientId: null,
        familyGroupId: null,
        eventDate: l.event_date,
        quantity: l.quantity,
        unitPriceCents: l.unit_price_cents,
        lineTotalCents: l.line_total_cents,
      })),
      passes,
      invoice: inv
        ? {
            invoiceNumber: inv.invoice_number,
            issuedAt: inv.issued_at.toISOString(),
            sellerName: EVENT_METADATA.venue,
            sellerAddress: EVENT_METADATA.address,
            sellerEin: SELLER_EIN,
            billedToName: inv.billed_to_name,
            billedToEmail: inv.billed_to_email,
            billedToPhone: inv.billed_to_phone,
            paymentMethodLabel: inv.payment_method_label,
            subtotalCents: inv.subtotal_cents,
            discountCents: inv.discount_cents,
            taxCents: inv.tax_cents,
            totalCents: inv.total_cents,
            promoCode: bk.promo_code_text,
          }
        : null,
      email: em
        ? {
            status: em.status,
            toEmail: em.to_email,
            subject: em.subject,
            sentAt: em.sent_at ? em.sent_at.toISOString() : null,
          }
        : null,
    };
  }

  async getSimulatedEmail(bookingId: string): Promise<SimulatedEmailResponseDTO | null> {
    await this.ready();
    const res = await this.pool.query<{
      booking_id: string;
      to_email: string;
      from_email: string;
      subject: string;
      sent_at: Date;
      simulated_message_id: string;
      html_body: string;
      attachments: StoredEmailAttachment[];
    }>(
      `SELECT booking_id, to_email, from_email, subject, sent_at,
              simulated_message_id, html_body, attachments
         FROM email_outbox
        WHERE booking_id = $1`,
      [bookingId],
    );
    const row = res.rows[0];
    if (!row) return null;

    return {
      bookingId: row.booking_id,
      toEmail: row.to_email,
      fromEmail: row.from_email,
      subject: row.subject,
      sentAt: row.sent_at.toISOString(),
      simulatedMessageId: row.simulated_message_id,
      htmlBody: row.html_body,
      attachments: row.attachments,
    };
  }

  async createOrRefreshOtp(params: {
    email: string;
    codeHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.ready();
    const norm = normalizeEmail(params.email);
    await this.pool.query(
      `INSERT INTO auth_otps (email_normalized, code_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [norm, params.codeHash, params.expiresAt.toISOString()],
    );
  }

  private async ensureDefaultContributionsForUser(
    userId: string,
    emailNorm: string,
  ): Promise<void> {
    const existing = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM contributions WHERE email_normalized = $1`,
      [emailNorm],
    );
    if (Number(existing.rows[0]?.count ?? '0') === 0) {
      for (const c of SEEDED_CONTRIBUTIONS) {
        await this.pool.query(
          `INSERT INTO contributions (
             user_id, email_normalized, title, organization, category,
             amount_cents, contributed_on, summary, impact_badge
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            userId,
            emailNorm,
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
  }

  async verifyOtpAndCreateSession(params: {
    email: string;
    codeHash: string;
    sessionTokenHash: string;
    sessionExpiresAt: Date;
    now: Date;
    fullName?: string;
    phone?: string;
  }): Promise<UserProfileDTO | null> {
    await this.ready();
    const norm = normalizeEmail(params.email);
    const otpRes = await this.pool.query<{ id: string }>(
      `UPDATE auth_otps
          SET consumed_at = $3
        WHERE id = (
          SELECT id FROM auth_otps
           WHERE email_normalized = $1
             AND code_hash = $2
             AND consumed_at IS NULL
             AND expires_at > $3
           ORDER BY created_at DESC
           LIMIT 1
        )
        RETURNING id`,
      [norm, params.codeHash, params.now.toISOString()],
    );

    if (otpRes.rows.length === 0) {
      return null;
    }

    const defaultName =
      params.fullName?.trim() || norm.split('@')[0]?.replace(/[._-]/g, ' ') || 'Temple Guest';
    const defaultPhone = params.phone?.trim() || '+1 469-555-0100';

    const userRes = await this.pool.query<{
      id: string;
      email: string;
      full_name: string;
      phone: string;
      created_at: Date;
    }>(
      `INSERT INTO users (email, email_normalized, full_name, phone)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email_normalized) DO UPDATE SET
         updated_at = now()
       RETURNING id, email, full_name, phone, created_at`,
      [params.email.trim(), norm, defaultName, defaultPhone],
    );
    const user = userRes.rows[0]!;

    // Link any past guest bookings made with this email
    await this.pool.query(
      `UPDATE bookings SET user_id = $1 WHERE booker_email_normalized = $2 AND user_id IS NULL`,
      [user.id, norm],
    );
    await this.ensureDefaultContributionsForUser(user.id, norm);

    await this.pool.query(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, params.sessionTokenHash, params.sessionExpiresAt.toISOString()],
    );

    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      phone: user.phone,
      createdAt: user.created_at.toISOString(),
    };
  }

  async createDemoSession(params: {
    sessionTokenHash: string;
    sessionExpiresAt: Date;
  }): Promise<UserProfileDTO> {
    await this.ready();
    const userRes = await this.pool.query<{
      id: string;
      email: string;
      full_name: string;
      phone: string;
      created_at: Date;
    }>(
      `SELECT id, email, full_name, phone, created_at
         FROM users
        WHERE email_normalized = $1`,
      [DEMO_PROFILE.emailNormalized],
    );
    const user = userRes.rows[0]!;

    await this.pool.query(
      `UPDATE bookings SET user_id = $1 WHERE booker_email_normalized = $2 AND user_id IS NULL`,
      [user.id, DEMO_PROFILE.emailNormalized],
    );

    await this.pool.query(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, params.sessionTokenHash, params.sessionExpiresAt.toISOString()],
    );

    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      phone: user.phone,
      createdAt: user.created_at.toISOString(),
    };
  }

  async getUserBySessionToken(tokenHash: string, now: Date): Promise<UserProfileDTO | null> {
    await this.ready();
    const res = await this.pool.query<{
      id: string;
      email: string;
      full_name: string;
      phone: string;
      created_at: Date;
    }>(
      `SELECT u.id, u.email, u.full_name, u.phone, u.created_at
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > $2`,
      [tokenHash, now.toISOString()],
    );
    const u = res.rows[0];
    if (!u) return null;
    return {
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      phone: u.phone,
      createdAt: u.created_at.toISOString(),
    };
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.ready();
    await this.pool.query(`DELETE FROM user_sessions WHERE token_hash = $1`, [tokenHash]);
  }

  async updateUserProfile(
    userId: string,
    updates: { fullName: string; phone: string },
  ): Promise<UserProfileDTO> {
    await this.ready();
    const res = await this.pool.query<{
      id: string;
      email: string;
      full_name: string;
      phone: string;
      created_at: Date;
    }>(
      `UPDATE users
          SET full_name = $2, phone = $3, updated_at = now()
        WHERE id = $1
        RETURNING id, email, full_name, phone, created_at`,
      [userId, updates.fullName.trim(), updates.phone.trim()],
    );
    const u = res.rows[0];
    if (!u) throw new NotFoundError('User profile not found.');
    return {
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      phone: u.phone,
      createdAt: u.created_at.toISOString(),
    };
  }

  async listBookingsForEmail(
    emailNormalized: string,
    now: Date,
  ): Promise<BookingDetailResponseDTO[]> {
    await this.ready();
    await this.releaseExpiredHolds(now);

    const idsRes = await this.pool.query<{ id: string }>(
      `SELECT id FROM bookings
        WHERE booker_email_normalized = $1
          AND status IN ('confirmed', 'pending_payment')
        ORDER BY created_at DESC`,
      [emailNormalized],
    );

    const details = await Promise.all(
      idsRes.rows.map((r) => this.getBookingDetail(r.id, now)),
    );
    return details.filter((d): d is BookingDetailResponseDTO => d !== null);
  }

  async listContributionsForEmail(emailNormalized: string): Promise<ContributionCardDTO[]> {
    await this.ready();
    const res = await this.pool.query<{
      id: string;
      title: string;
      organization: string;
      category: 'charity' | 'seva' | 'event';
      amount_cents: number | null;
      contributed_on: string;
      summary: string;
      impact_badge: string;
    }>(
      `SELECT id, title, organization, category, amount_cents,
              contributed_on, summary, impact_badge
         FROM contributions
        WHERE email_normalized = $1
        ORDER BY contributed_on DESC`,
      [emailNormalized],
    );

    return res.rows.map((r) => ({
      id: r.id,
      title: r.title,
      organization: r.organization,
      category: r.category,
      amountCents: r.amount_cents,
      contributedOn: r.contributed_on,
      summary: r.summary,
      impactBadge: r.impact_badge,
    }));
  }

  async resetInventoryToDefaults(): Promise<void> {
    await this.ready();
    await this.pool.query(
      `UPDATE bookings SET status = 'expired' WHERE status = 'pending_payment'`,
    );
    await seedDatabase(this.pool, { resetStock: true });
  }
}
