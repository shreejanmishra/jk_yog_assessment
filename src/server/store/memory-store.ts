import crypto from 'node:crypto';
import QRCode from 'qrcode';
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
  collectPromoParticipants,
  computeAttendeeIdentityKey,
  DEFAULT_CATALOG,
  DEFAULT_PROMOS,
  EVENT_METADATA,
  formatDatesDisplay,
  normalizeEmail,
  type BookingMode,
  type CatalogProduct,
  type PaymentMethodChoice,
  type PriorPromoRedemptionMatch,
  type ProductCode,
  type PromoDefinition,
  type PromoParticipant,
} from '@domain/index';
import { DEMO_PROFILE, SEEDED_CONTRIBUTIONS } from '../db/bootstrap';
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

interface MemoryBookingRecord {
  bookingId: string;
  reference: string;
  userId: string | null;
  mode: BookingMode;
  status: 'pending_payment' | 'confirmed' | 'expired' | 'cancelled';
  booker: {
    fullName: string;
    email: string;
    emailNormalized: string;
    phone: string;
    age: number;
  };
  paymentMethod: PaymentMethodChoice;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  promoCode: string | null;
  idempotencyKey: string;
  requestHash: string;
  holdExpiresAt: Date;
  createdAt: Date;
  confirmedAt: Date | null;
  stockDemand: Map<ProductCode, number>;
  attendeeIdentities: Array<{
    fullName: string;
    identityKey: string;
    validDates: string[];
  }>;
  promoParticipantKeys: Set<string>;
  lines: QuoteLineDTO[];
  passes: IssuedPassDTO[];
  invoice: BookingDetailResponseDTO['invoice'];
  simulatedEmail: SimulatedEmailResponseDTO | null;
}

export class InMemoryTransactionalStore implements BookingDataStore {
  private products = new Map<ProductCode, CatalogProduct>();
  private promos = new Map<string, PromoDefinition>();
  private bookings = new Map<string, MemoryBookingRecord>();
  private bookingIdByIdempotency = new Map<string, string>();
  private usersByEmail = new Map<string, UserProfileDTO>();
  private usersById = new Map<string, UserProfileDTO>();
  private sessions = new Map<string, { userId: string; expiresAt: Date }>();
  private otps = new Map<string, { codeHash: string; expiresAt: Date; consumed: boolean }>();
  private contributionsByEmail = new Map<string, ContributionCardDTO[]>();
  private mutex: Promise<void> = Promise.resolve();

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults(): void {
    this.products.clear();
    for (const item of DEFAULT_CATALOG) {
      this.products.set(item.code, { ...item });
    }
    this.promos.clear();
    for (const p of DEFAULT_PROMOS) {
      this.promos.set(p.code, { ...p });
    }
    const demoUser: UserProfileDTO = {
      id: crypto.randomUUID(),
      email: DEMO_PROFILE.email,
      fullName: DEMO_PROFILE.fullName,
      phone: DEMO_PROFILE.phone,
      createdAt: new Date('2026-01-15T12:00:00Z').toISOString(),
    };
    this.usersByEmail.set(DEMO_PROFILE.emailNormalized, demoUser);
    this.usersById.set(demoUser.id, demoUser);
    this.seedContributionsForEmail(DEMO_PROFILE.emailNormalized);
  }

  private seedContributionsForEmail(emailNormalized: string): void {
    if (this.contributionsByEmail.has(emailNormalized)) return;
    this.contributionsByEmail.set(
      emailNormalized,
      SEEDED_CONTRIBUTIONS.map((c) => ({
        id: crypto.randomUUID(),
        title: c.title,
        organization: c.organization,
        category: c.category,
        amountCents: c.amountCents,
        contributedOn: c.contributedOn,
        summary: c.summary,
        impactBadge: c.impactBadge,
      })),
    );
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.mutex;
    let release!: () => void;
    this.mutex = new Promise<void>((res) => {
      release = res;
    });
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private releaseExpiredInternal(now: Date): number {
    let count = 0;
    for (const rec of this.bookings.values()) {
      if (rec.status === 'pending_payment' && rec.holdExpiresAt <= now) {
        rec.status = 'expired';
        count += 1;
        for (const [code, qty] of rec.stockDemand.entries()) {
          const cur = this.products.get(code);
          if (cur) {
            this.products.set(code, {
              ...cur,
              remainingStock: Math.min(cur.totalStock, cur.remainingStock + qty),
            });
          }
        }
        if (rec.promoCode) {
          const p = this.promos.get(rec.promoCode);
          if (p) {
            this.promos.set(rec.promoCode, {
              ...p,
              usedCount: Math.max(0, p.usedCount - 1),
            });
          }
        }
      }
    }
    return count;
  }

  async getCatalogAndPromos(): Promise<{
    products: CatalogProduct[];
    promos: PromoDefinition[];
  }> {
    return this.withLock(async () => {
      return {
        products: [...this.products.values()].sort((a, b) => a.sortOrder - b.sortOrder),
        promos: [...this.promos.values()],
      };
    });
  }

  async releaseExpiredHolds(now: Date): Promise<number> {
    return this.withLock(async () => this.releaseExpiredInternal(now));
  }

  private lookupPriorPromoRedemptionInternal(
    participants: readonly PromoParticipant[],
    now: Date,
  ): PriorPromoRedemptionMatch | null {
    if (participants.length === 0) return null;
    for (const rec of this.bookings.values()) {
      if (!rec.promoCode) continue;
      if (
        rec.status !== 'confirmed' &&
        !(rec.status === 'pending_payment' && rec.holdExpiresAt > now)
      ) {
        continue;
      }
      for (const participant of participants) {
        if (rec.promoParticipantKeys.has(participant.key)) {
          return {
            participantLabel: participant.label,
            bookingReference: rec.reference,
            promoCode: rec.promoCode,
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
    return this.withLock(async () => {
      this.releaseExpiredInternal(now);
      return this.lookupPriorPromoRedemptionInternal(participants, now);
    });
  }

  async createBookingHold(input: CreateHoldInput): Promise<CreateBookingResponseDTO> {
    return this.withLock(async () => {
      const existingId = this.bookingIdByIdempotency.get(input.idempotencyKey);
      if (existingId) {
        const existing = this.bookings.get(existingId);
        if (existing) {
          if (existing.requestHash !== input.requestHash) {
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
          if (existing.status === 'pending_payment' || existing.status === 'confirmed') {
            return {
              bookingId: existing.bookingId,
              reference: existing.reference,
              status: existing.status,
              currency: 'USD',
              subtotalCents: existing.subtotalCents,
              discountCents: existing.discountCents,
              totalCents: existing.totalCents,
              holdExpiresAt: existing.holdExpiresAt.toISOString(),
              paymentMethod: existing.paymentMethod,
              paymentUrl:
                existing.status === 'confirmed'
                  ? null
                  : `/pay/${existing.bookingId}?method=${existing.paymentMethod}`,
            };
          }
        }
      }

      this.releaseExpiredInternal(input.now);

      // Prevent issuing duplicate passes to the same individual on overlapping festival evenings
      for (const pass of input.quote.attendeePasses) {
        const incomingKey = computeAttendeeIdentityKey({
          category: pass.ageBand,
          fullName: pass.fullName,
          phone: pass.phone,
          guardianPhone: pass.guardian?.phone ?? null,
        });
        if (!incomingKey) continue;

        for (const existingRec of this.bookings.values()) {
          if (existingRec.status !== 'confirmed' && existingRec.status !== 'pending_payment') {
            continue;
          }
          for (const holder of existingRec.attendeeIdentities) {
            if (holder.identityKey !== incomingKey) continue;
            const overlap = pass.validDates.filter((d) => holder.validDates.includes(d));
            if (overlap.length > 0) {
              throw new ConflictError(
                'DUPLICATE_PASS_HOLDER',
                `${pass.fullName} already holds an active or confirmed pass for ${formatDatesDisplay(overlap)} (Ref ${existingRec.reference}).`,
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
      }

      // Verify stock atomically before mutating
      for (const [code, qty] of input.quote.stockDemand.entries()) {
        if (qty <= 0) continue;
        const prod = this.products.get(code);
        if (!prod || prod.remainingStock < qty) {
          const rem = prod?.remainingStock ?? 0;
          const name = prod?.name ?? code;
          throw new ConflictError(
            'INSUFFICIENT_STOCK',
            rem <= 0
              ? `${name} just sold out.`
              : `Only ${rem} ${name} remaining — someone else just booked the remaining spots.`,
            [
              {
                path: `stock.${code}`,
                code: rem <= 0 ? 'PRODUCT_SOLD_OUT' : 'INSUFFICIENT_STOCK',
                message: `Available: ${rem}, requested: ${qty}.`,
              },
            ],
          );
        }
      }

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

      let appliedPromoCode: string | null = null;
      if (input.quote.promo.status === 'applied') {
        const priorRedemption = this.lookupPriorPromoRedemptionInternal(
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

        const promo = this.promos.get(input.quote.promo.code);
        if (
          !promo ||
          !promo.isActive ||
          (promo.maxUses !== null && promo.usedCount >= promo.maxUses) ||
          (promo.validUntilIso !== null && input.now.toISOString() > promo.validUntilIso)
        ) {
          throw new ConflictError(
            'PROMO_EXHAUSTED',
            `Promo code "${input.quote.promo.code}" is no longer available.`,
          );
        }
        this.promos.set(promo.code, { ...promo, usedCount: promo.usedCount + 1 });
        appliedPromoCode = promo.code;
      }

      // Commit stock decrements
      for (const [code, qty] of input.quote.stockDemand.entries()) {
        if (qty <= 0) continue;
        const prod = this.products.get(code)!;
        this.products.set(code, { ...prod, remainingStock: prod.remainingStock - qty });
      }

      const bookingId = crypto.randomUUID();
      const reference = generateBookingReference();
      const autoConfirm = input.quote.totalCents === 0;
      const status = autoConfirm ? 'confirmed' : 'pending_payment';
      const holdExpiresAt = new Date(
        input.now.getTime() + EVENT_METADATA.holdMinutes * 60 * 1000,
      );

      const passes: IssuedPassDTO[] = await Promise.all(
        input.quote.attendeePasses.map(async (p) => {
          const passCode = generatePassCode();
          return {
            attendeeId: crypto.randomUUID(),
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
            qrDataUrl: await QRCode.toDataURL(
              JSON.stringify({ ref: reference, pass: passCode, holder: p.fullName }),
              { width: 160, margin: 1, color: { dark: '#291900', light: '#FDF3E4' } },
            ),
          };
        }),
      );

      const lines: QuoteLineDTO[] = input.quote.lines.map((l) => ({
        productCode: l.productCode,
        label: l.label,
        attendeeClientId: l.attendeeClientId,
        familyGroupId: l.familyGroupId,
        eventDate: l.eventDate,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        lineTotalCents: l.lineTotalCents,
      }));

      let invoice: BookingDetailResponseDTO['invoice'] = null;
      let simulatedEmail: SimulatedEmailResponseDTO | null = null;

      if (autoConfirm) {
        const invoiceNumber = generateInvoiceNumber();
        invoice = {
          invoiceNumber,
          issuedAt: input.now.toISOString(),
          sellerName: EVENT_METADATA.venue,
          sellerAddress: EVENT_METADATA.address,
          sellerEin: SELLER_EIN,
          billedToName: input.booker.fullName.trim(),
          billedToEmail: input.booker.email.trim(),
          billedToPhone: input.booker.phone.trim(),
          paymentMethodLabel: 'Complimentary ($0 Total after Promo)',
          subtotalCents: input.quote.subtotalCents,
          discountCents: input.quote.discountCents,
          taxCents: 0,
          totalCents: 0,
          promoCode: appliedPromoCode,
        };
        const rendered = renderConfirmationEmail({
          bookingId,
          reference,
          bookerName: input.booker.fullName.trim(),
          bookerEmail: input.booker.email.trim(),
          invoiceNumber,
          subtotalCents: input.quote.subtotalCents,
          discountCents: input.quote.discountCents,
          totalCents: 0,
          promoCode: appliedPromoCode,
          passes,
          lines,
        });
        simulatedEmail = {
          bookingId,
          toEmail: rendered.toEmail,
          fromEmail: rendered.fromEmail,
          subject: rendered.subject,
          sentAt: input.now.toISOString(),
          simulatedMessageId: generateSimulatedMessageId(),
          htmlBody: rendered.htmlBody,
          attachments: rendered.attachments,
        };
      }

      const record: MemoryBookingRecord = {
        bookingId,
        reference,
        userId: input.userId,
        mode: input.mode,
        status,
        booker: {
          fullName: input.booker.fullName.trim(),
          email: input.booker.email.trim(),
          emailNormalized: normalizeEmail(input.booker.email),
          phone: input.booker.phone.trim(),
          age: input.booker.age,
        },
        paymentMethod: input.paymentMethod,
        subtotalCents: input.quote.subtotalCents,
        discountCents: input.quote.discountCents,
        totalCents: input.quote.totalCents,
        promoCode: appliedPromoCode,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        holdExpiresAt,
        createdAt: input.now,
        confirmedAt: autoConfirm ? input.now : null,
        stockDemand: new Map(input.quote.stockDemand),
        attendeeIdentities: input.quote.attendeePasses
          .map((p) => {
            const identityKey = computeAttendeeIdentityKey({
              category: p.ageBand,
              fullName: p.fullName,
              phone: p.phone,
              guardianPhone: p.guardian?.phone ?? null,
            });
            return identityKey
              ? { fullName: p.fullName, identityKey, validDates: [...p.validDates] }
              : null;
          })
          .filter((item): item is NonNullable<typeof item> => item !== null),
        promoParticipantKeys: new Set(currentPromoParticipants.map((p) => p.key)),
        lines,
        passes,
        invoice,
        simulatedEmail,
      };

      this.bookings.set(bookingId, record);
      this.bookingIdByIdempotency.set(input.idempotencyKey, bookingId);

      return {
        bookingId,
        reference,
        status,
        currency: 'USD',
        subtotalCents: record.subtotalCents,
        discountCents: record.discountCents,
        totalCents: record.totalCents,
        holdExpiresAt: holdExpiresAt.toISOString(),
        paymentMethod: input.paymentMethod,
        paymentUrl: autoConfirm ? null : `/pay/${bookingId}?method=${input.paymentMethod}`,
      };
    });
  }

  async processSimulatedPayment(input: ConfirmPaymentInput): Promise<{
    bookingId: string;
    reference: string;
    status: 'pending_payment' | 'confirmed' | 'cancelled';
  }> {
    return this.withLock(async () => {
      const rec = this.bookings.get(input.bookingId);
      if (!rec) {
        throw new NotFoundError('Booking not found.');
      }

      if (rec.status === 'confirmed') {
        return { bookingId: rec.bookingId, reference: rec.reference, status: 'confirmed' };
      }
      if (rec.status === 'cancelled') {
        throw new GoneError('BOOKING_CANCELLED', 'This booking was cancelled.');
      }
      if (rec.status === 'expired' || rec.holdExpiresAt <= input.now) {
        this.releaseExpiredInternal(input.now);
        throw new GoneError(
          'HOLD_EXPIRED',
          'Your 10-minute reservation hold expired. Please return to the booking form and confirm again.',
        );
      }

      if (input.outcome === 'decline') {
        throw new PaymentDeclinedError();
      }

      if (input.outcome === 'cancel') {
        rec.status = 'cancelled';
        for (const [code, qty] of rec.stockDemand.entries()) {
          const cur = this.products.get(code);
          if (cur) {
            this.products.set(code, {
              ...cur,
              remainingStock: Math.min(cur.totalStock, cur.remainingStock + qty),
            });
          }
        }
        if (rec.promoCode) {
          const p = this.promos.get(rec.promoCode);
          if (p) {
            this.promos.set(rec.promoCode, {
              ...p,
              usedCount: Math.max(0, p.usedCount - 1),
            });
          }
        }
        return { bookingId: rec.bookingId, reference: rec.reference, status: 'cancelled' };
      }

      rec.status = 'confirmed';
      rec.paymentMethod = input.method;
      rec.confirmedAt = input.now;

      const methodLabel =
        input.method === 'stripe'
          ? `Stripe Simulated Checkout (•••• ${input.cardLast4 ?? '4242'})`
          : `Credit Card Simulated (•••• ${input.cardLast4 ?? '4242'})`;
      const invoiceNumber = generateInvoiceNumber();

      rec.invoice = {
        invoiceNumber,
        issuedAt: input.now.toISOString(),
        sellerName: EVENT_METADATA.venue,
        sellerAddress: EVENT_METADATA.address,
        sellerEin: SELLER_EIN,
        billedToName: rec.booker.fullName,
        billedToEmail: rec.booker.email,
        billedToPhone: rec.booker.phone,
        paymentMethodLabel: methodLabel,
        subtotalCents: rec.subtotalCents,
        discountCents: rec.discountCents,
        taxCents: 0,
        totalCents: rec.totalCents,
        promoCode: rec.promoCode,
      };

      const rendered = renderConfirmationEmail({
        bookingId: rec.bookingId,
        reference: rec.reference,
        bookerName: rec.booker.fullName,
        bookerEmail: rec.booker.email,
        invoiceNumber,
        subtotalCents: rec.subtotalCents,
        discountCents: rec.discountCents,
        totalCents: rec.totalCents,
        promoCode: rec.promoCode,
        passes: rec.passes,
        lines: rec.lines,
      });

      rec.simulatedEmail = {
        bookingId: rec.bookingId,
        toEmail: rendered.toEmail,
        fromEmail: rendered.fromEmail,
        subject: rendered.subject,
        sentAt: input.now.toISOString(),
        simulatedMessageId: generateSimulatedMessageId(),
        htmlBody: rendered.htmlBody,
        attachments: rendered.attachments,
      };

      return { bookingId: rec.bookingId, reference: rec.reference, status: 'confirmed' };
    });
  }

  private toDetailDto(rec: MemoryBookingRecord): BookingDetailResponseDTO {
    return {
      bookingId: rec.bookingId,
      reference: rec.reference,
      mode: rec.mode,
      status: rec.status,
      event: {
        name: EVENT_METADATA.name,
        venue: EVENT_METADATA.venue,
        address: EVENT_METADATA.address,
        datesLabel: 'Thu 10 Dec 2026 – Mon 14 Dec 2026',
      },
      booker: {
        fullName: rec.booker.fullName,
        email: rec.booker.email,
        phone: rec.booker.phone,
        age: rec.booker.age,
      },
      paymentMethod: rec.paymentMethod,
      subtotalCents: rec.subtotalCents,
      discountCents: rec.discountCents,
      totalCents: rec.totalCents,
      promoCode: rec.promoCode,
      holdExpiresAt: rec.holdExpiresAt.toISOString(),
      createdAt: rec.createdAt.toISOString(),
      confirmedAt: rec.confirmedAt ? rec.confirmedAt.toISOString() : null,
      lines: rec.lines,
      passes: rec.passes,
      invoice: rec.invoice,
      email: rec.simulatedEmail
        ? {
            status: 'sent',
            toEmail: rec.simulatedEmail.toEmail,
            subject: rec.simulatedEmail.subject,
            sentAt: rec.simulatedEmail.sentAt,
          }
        : null,
    };
  }

  async getBookingDetail(
    bookingId: string,
    now: Date,
  ): Promise<BookingDetailResponseDTO | null> {
    return this.withLock(async () => {
      this.releaseExpiredInternal(now);
      const rec = this.bookings.get(bookingId);
      return rec ? this.toDetailDto(rec) : null;
    });
  }

  async getSimulatedEmail(bookingId: string): Promise<SimulatedEmailResponseDTO | null> {
    const rec = this.bookings.get(bookingId);
    return rec?.simulatedEmail ?? null;
  }

  async createOrRefreshOtp(params: {
    email: string;
    codeHash: string;
    expiresAt: Date;
  }): Promise<void> {
    const norm = normalizeEmail(params.email);
    this.otps.set(norm, {
      codeHash: params.codeHash,
      expiresAt: params.expiresAt,
      consumed: false,
    });
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
    const norm = normalizeEmail(params.email);
    const otp = this.otps.get(norm);
    if (!otp || otp.consumed || otp.codeHash !== params.codeHash || otp.expiresAt <= params.now) {
      return null;
    }
    otp.consumed = true;

    let user = this.usersByEmail.get(norm);
    if (!user) {
      user = {
        id: crypto.randomUUID(),
        email: params.email.trim(),
        fullName:
          params.fullName?.trim() || norm.split('@')[0]?.replace(/[._-]/g, ' ') || 'Temple Guest',
        phone: params.phone?.trim() || '+1 469-555-0100',
        createdAt: params.now.toISOString(),
      };
      this.usersByEmail.set(norm, user);
      this.usersById.set(user.id, user);
    }

    this.seedContributionsForEmail(norm);
    this.sessions.set(params.sessionTokenHash, {
      userId: user.id,
      expiresAt: params.sessionExpiresAt,
    });

    return user;
  }

  async createDemoSession(params: {
    sessionTokenHash: string;
    sessionExpiresAt: Date;
  }): Promise<UserProfileDTO> {
    const user = this.usersByEmail.get(DEMO_PROFILE.emailNormalized)!;
    this.sessions.set(params.sessionTokenHash, {
      userId: user.id,
      expiresAt: params.sessionExpiresAt,
    });
    return user;
  }

  async getUserBySessionToken(tokenHash: string, now: Date): Promise<UserProfileDTO | null> {
    const sess = this.sessions.get(tokenHash);
    if (!sess || sess.expiresAt <= now) return null;
    return this.usersById.get(sess.userId) ?? null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  async updateUserProfile(
    userId: string,
    updates: { fullName: string; phone: string },
  ): Promise<UserProfileDTO> {
    const user = this.usersById.get(userId);
    if (!user) throw new NotFoundError('User profile not found.');
    const updated: UserProfileDTO = {
      ...user,
      fullName: updates.fullName.trim(),
      phone: updates.phone.trim(),
    };
    this.usersById.set(userId, updated);
    this.usersByEmail.set(normalizeEmail(updated.email), updated);
    return updated;
  }

  async listBookingsForEmail(
    emailNormalized: string,
    now: Date,
  ): Promise<BookingDetailResponseDTO[]> {
    return this.withLock(async () => {
      this.releaseExpiredInternal(now);
      return [...this.bookings.values()]
        .filter(
          (b) =>
            b.booker.emailNormalized === emailNormalized &&
            (b.status === 'confirmed' || b.status === 'pending_payment'),
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((b) => this.toDetailDto(b));
    });
  }

  async listContributionsForEmail(emailNormalized: string): Promise<ContributionCardDTO[]> {
    this.seedContributionsForEmail(emailNormalized);
    return this.contributionsByEmail.get(emailNormalized) ?? [];
  }

  async resetInventoryToDefaults(): Promise<void> {
    return this.withLock(async () => {
      for (const rec of this.bookings.values()) {
        if (rec.status === 'pending_payment') {
          rec.status = 'expired';
        }
      }
      for (const item of DEFAULT_CATALOG) {
        this.products.set(item.code, { ...item });
      }
      for (const p of DEFAULT_PROMOS) {
        this.promos.set(p.code, { ...p });
      }
    });
  }
}
