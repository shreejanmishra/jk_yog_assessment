import { PRODUCT_CODES, type ProductCode } from './catalog';
import type { RuleViolationCode } from './errors';
import {
  applyBasisPointsHalfUp,
  cents,
  formatUSD,
  minCents,
  sumCents,
  ZERO_CENTS,
  type Cents,
} from './money';

export type PromoDiscountType = 'percent' | 'fixed' | 'child_admissions_free';

export interface PromoDefinition {
  readonly code: string;
  readonly description: string;
  readonly discountType: PromoDiscountType;
  readonly percentBps: number | null;
  readonly amountCents: Cents | null;
  /** Booking subtotal must be strictly greater than this threshold (e.g. > $40.00 for FLAT20). */
  readonly minSubtotalExclusiveCents: Cents | null;
  readonly validFromIso: string | null;
  readonly validUntilIso: string | null;
  readonly maxUses: number | null;
  readonly usedCount: number;
  readonly isActive: boolean;
}

export interface PriorPromoRedemptionMatch {
  readonly participantLabel: string;
  readonly bookingReference: string;
  readonly promoCode: string;
}

export const DEFAULT_PROMOS: readonly PromoDefinition[] = [
  {
    code: 'SEVA10',
    description: '10% off the entire booking',
    discountType: 'percent',
    percentBps: 1000,
    amountCents: null,
    minSubtotalExclusiveCents: null,
    validFromIso: '2026-01-01T00:00:00Z',
    validUntilIso: '2026-12-15T05:59:59Z',
    maxUses: null,
    usedCount: 0,
    isActive: true,
  },
  {
    code: 'FLAT20',
    description: '$20 off bookings over $40',
    discountType: 'fixed',
    percentBps: null,
    amountCents: cents(2000),
    minSubtotalExclusiveCents: cents(4000),
    validFromIso: '2026-01-01T00:00:00Z',
    validUntilIso: '2026-12-15T05:59:59Z',
    maxUses: null,
    usedCount: 0,
    isActive: true,
  },
  {
    code: 'KIDSFREE',
    description: 'Makes Child Day and Child All-Day passes free',
    discountType: 'child_admissions_free',
    percentBps: null,
    amountCents: null,
    minSubtotalExclusiveCents: null,
    validFromIso: '2026-01-01T00:00:00Z',
    validUntilIso: '2026-12-15T05:59:59Z',
    maxUses: null,
    usedCount: 0,
    isActive: true,
  },
  {
    code: 'EXPIRED5',
    description: '5% early-bird code that expired last month',
    discountType: 'percent',
    percentBps: 500,
    amountCents: null,
    minSubtotalExclusiveCents: null,
    validFromIso: '2026-09-01T00:00:00Z',
    validUntilIso: '2026-11-15T23:59:59Z',
    maxUses: null,
    usedCount: 12,
    isActive: true,
  },
  {
    code: 'MAXEDOUT',
    description: 'Limited launch promo that reached maximum redemptions',
    discountType: 'fixed',
    percentBps: null,
    amountCents: cents(1000),
    minSubtotalExclusiveCents: null,
    validFromIso: '2026-01-01T00:00:00Z',
    validUntilIso: '2026-12-15T05:59:59Z',
    maxUses: 50,
    usedCount: 50,
    isActive: true,
  },
] as const;

export interface PricedLineForPromo {
  readonly productCode: ProductCode;
  readonly lineTotalCents: Cents;
}

export type PromoEvaluation =
  | {
      readonly status: 'none';
      readonly code: null;
      readonly discountCents: Cents;
      readonly message: null;
      readonly rejectionCode: null;
    }
  | {
      readonly status: 'applied';
      readonly code: string;
      readonly discountCents: Cents;
      readonly message: string;
      readonly rejectionCode: null;
    }
  | {
      readonly status: 'rejected';
      readonly code: string;
      readonly discountCents: Cents;
      readonly message: string;
      readonly rejectionCode: Extract<
        RuleViolationCode,
        | 'PROMO_NOT_FOUND'
        | 'PROMO_EXPIRED'
        | 'PROMO_EXHAUSTED'
        | 'PROMO_NOT_APPLICABLE'
        | 'PROMO_ALREADY_USED'
      >;
    };

export function normalizePromoCode(raw: string | undefined): string {
  return (raw ?? '').trim().toUpperCase();
}

export function evaluatePromoCode(params: {
  rawCode: string | undefined;
  promosByCode: ReadonlyMap<string, PromoDefinition>;
  lines: readonly PricedLineForPromo[];
  subtotalCents: Cents;
  nowIso: string;
  priorRedemption?: PriorPromoRedemptionMatch | null;
}): PromoEvaluation {
  const code = normalizePromoCode(params.rawCode);
  if (!code) {
    return {
      status: 'none',
      code: null,
      discountCents: ZERO_CENTS,
      message: null,
      rejectionCode: null,
    };
  }

  const promo = params.promosByCode.get(code);
  if (!promo || !promo.isActive) {
    return {
      status: 'rejected',
      code,
      discountCents: ZERO_CENTS,
      message: `"${code}" is not a recognized promo code. Please check the spelling and try again.`,
      rejectionCode: 'PROMO_NOT_FOUND',
    };
  }

  if (promo.validUntilIso && params.nowIso > promo.validUntilIso) {
    const expiredDate = promo.validUntilIso.slice(0, 10);
    return {
      status: 'rejected',
      code: promo.code,
      discountCents: ZERO_CENTS,
      message: `Code "${promo.code}" expired on ${expiredDate} and can no longer be used.`,
      rejectionCode: 'PROMO_EXPIRED',
    };
  }

  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
    return {
      status: 'rejected',
      code: promo.code,
      discountCents: ZERO_CENTS,
      message: `Code "${promo.code}" has already reached its maximum usage limit (${promo.maxUses} uses).`,
      rejectionCode: 'PROMO_EXHAUSTED',
    };
  }

  // 1-coupon-per-booker-and-attendee anti-abuse rule across all bookings
  if (params.priorRedemption) {
    return {
      status: 'rejected',
      code: promo.code,
      discountCents: ZERO_CENTS,
      message: `Coupon limit reached: ${params.priorRedemption.participantLabel} already benefited from promo code ${params.priorRedemption.promoCode} on booking ${params.priorRedemption.bookingReference}. Coupons are limited to 1 per booker and attendee.`,
      rejectionCode: 'PROMO_ALREADY_USED',
    };
  }

  // Minimum subtotal threshold (e.g. FLAT20 requires subtotal strictly greater than $40.00)
  if (
    promo.minSubtotalExclusiveCents !== null &&
    params.subtotalCents <= promo.minSubtotalExclusiveCents
  ) {
    return {
      status: 'rejected',
      code: promo.code,
      discountCents: ZERO_CENTS,
      message: `${promo.code} is only applicable when your booking subtotal is more than ${formatUSD(promo.minSubtotalExclusiveCents)} (current subtotal is ${formatUSD(params.subtotalCents)}).`,
      rejectionCode: 'PROMO_NOT_APPLICABLE',
    };
  }

  switch (promo.discountType) {
    case 'percent': {
      const bps = promo.percentBps ?? 0;
      const discount = minCents(
        applyBasisPointsHalfUp(params.subtotalCents, bps),
        params.subtotalCents,
      );
      const pct = (bps / 100).toFixed(bps % 100 === 0 ? 0 : 2);
      return {
        status: 'applied',
        code: promo.code,
        discountCents: discount,
        message: `${promo.code} applied: ${pct}% off (${formatUSD(discount)} saved).`,
        rejectionCode: null,
      };
    }

    case 'fixed': {
      const rawAmount = promo.amountCents ?? ZERO_CENTS;
      const discount = minCents(rawAmount, params.subtotalCents);
      const cappedNote =
        discount < rawAmount ? ' (capped at your booking subtotal)' : '';
      return {
        status: 'applied',
        code: promo.code,
        discountCents: discount,
        message: `${promo.code} applied: ${formatUSD(discount)} off${cappedNote}.`,
        rejectionCode: null,
      };
    }

    case 'child_admissions_free': {
      const childTicketLines = params.lines.filter(
        (line) =>
          line.productCode === PRODUCT_CODES.DAY_PASS_CHILD ||
          line.productCode === PRODUCT_CODES.ALL_DAY_CHILD,
      );
      const childSubtotal = sumCents(childTicketLines.map((l) => l.lineTotalCents));

      if (childSubtotal === 0) {
        return {
          status: 'rejected',
          code: promo.code,
          discountCents: ZERO_CENTS,
          message:
            'KIDSFREE is not applicable because there are no Child (ages 5–11) Day or All-Day passes in this booking.',
          rejectionCode: 'PROMO_NOT_APPLICABLE',
        };
      }

      const discount = minCents(childSubtotal, params.subtotalCents);
      return {
        status: 'applied',
        code: promo.code,
        discountCents: discount,
        message: `KIDSFREE applied: Child entry tickets are free (${formatUSD(discount)} saved).`,
        rejectionCode: null,
      };
    }
  }
}
