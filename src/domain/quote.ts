import { classifyAge } from './age';
import type { BookingIntent } from './booking-types';
import {
  buildCatalogMap,
  PRODUCT_CODES,
  type CatalogProduct,
  type ProductCode,
} from './catalog';
import type { QuoteWarning, RuleViolation } from './errors';
import { formatUSD, subtractCentsClamped, type Cents } from './money';
import {
  expandAndPriceItems,
  type AttendeePassSummary,
  type PricedLineItem,
} from './pricing';
import {
  evaluatePromoCode,
  type PromoDefinition,
  type PromoEvaluation,
} from './promo';
import { validateBookingRules } from './rules';

export interface PricedQuote {
  readonly lines: readonly PricedLineItem[];
  readonly attendeePasses: readonly AttendeePassSummary[];
  readonly subtotalCents: Cents;
  readonly discountCents: Cents;
  readonly totalCents: Cents;
  readonly promo: PromoEvaluation;
  readonly stockDemand: ReadonlyMap<ProductCode, number>;
  readonly warnings: readonly QuoteWarning[];
}

export type QuoteCalculationResult =
  | { readonly ok: true; readonly quote: PricedQuote }
  | { readonly ok: false; readonly violations: readonly RuleViolation[] };

function computeWarnings(
  intent: BookingIntent,
  catalogMap: ReadonlyMap<ProductCode, CatalogProduct>,
  stockDemand: ReadonlyMap<ProductCode, number>,
): QuoteWarning[] {
  const warnings: QuoteWarning[] = [];

  // 1. Cheaper child All-Day Pass vs 4+ Child Day Passes ($32 vs $30)
  const childAllDay = catalogMap.get(PRODUCT_CODES.ALL_DAY_CHILD);
  const childDay = catalogMap.get(PRODUCT_CODES.DAY_PASS_CHILD);
  if (childAllDay && childDay && childAllDay.remainingStock > 0) {
    for (const attendee of intent.attendees) {
      if (
        classifyAge(attendee.age) === 'child' &&
        attendee.passKind === 'day_pass' &&
        attendee.days.length * childDay.unitPriceCents > childAllDay.unitPriceCents
      ) {
        const diff =
          attendee.days.length * childDay.unitPriceCents - childAllDay.unitPriceCents;
        warnings.push({
          code: 'CHEAPER_OPTION_AVAILABLE',
          message: `${attendee.fullName.trim()}: All-Day Child Pass ($30 for all 5 days) saves $${(diff / 100).toFixed(2)} compared to ${attendee.days.length} separate Day Passes.`,
        });
      }
    }
  }

  // 2. Family Pass cost comparison vs separate Day Passes (e.g. 2A+1C = $38 separate vs $40 Family Pass)
  const familyPass = catalogMap.get(PRODUCT_CODES.FAMILY_PASS);
  const adultDay = catalogMap.get(PRODUCT_CODES.DAY_PASS_ADULT);
  const childDayProd = catalogMap.get(PRODUCT_CODES.DAY_PASS_CHILD);
  if (familyPass && adultDay && childDayProd) {
    for (const group of intent.familyGroups) {
      const members = intent.attendees.filter((a) => a.familyGroupId === group.id);
      const adults = members.filter((m) => classifyAge(m.age) === 'adult').length;
      const children = members.filter((m) => classifyAge(m.age) === 'child').length;
      const separatePerDay =
        adults * adultDay.unitPriceCents + children * childDayProd.unitPriceCents;
      if (separatePerDay < familyPass.unitPriceCents) {
        warnings.push({
          code: 'CHEAPER_OPTION_AVAILABLE',
          message: `Separate Day Passes (${formatUSD(separatePerDay as Cents)}/day) cost less than a Family Pass (${formatUSD(familyPass.unitPriceCents)}/day) for ${adults} adult(s) and ${children} child(ren).`,
        });
      }
    }
  }

  // 3. Low stock callouts on selected items
  for (const [code, qty] of stockDemand.entries()) {
    const product = catalogMap.get(code);
    if (product && qty > 0 && product.remainingStock > 0 && product.remainingStock <= 5) {
      warnings.push({
        code: 'LOW_STOCK',
        message: `Hurry — only ${product.remainingStock} ${product.name} spot(s) left!`,
      });
    }
  }

  // 4. Duplicate attendee full names
  const seenNames = new Set<string>();
  const warnedNames = new Set<string>();
  for (const attendee of intent.attendees) {
    const norm = attendee.fullName.trim().toLowerCase();
    if (norm && seenNames.has(norm) && !warnedNames.has(norm)) {
      warnedNames.add(norm);
      warnings.push({
        code: 'DUPLICATE_ATTENDEE_NAME',
        message: `Multiple attendees share the name "${attendee.fullName.trim()}". Please double-check this is intentional.`,
      });
    }
    seenNames.add(norm);
  }

  return warnings;
}

export function calculateBookingQuote(params: {
  intent: BookingIntent;
  products: readonly CatalogProduct[];
  promos: readonly PromoDefinition[];
  nowIso: string;
  todayIsoDate: string;
  strictPromo: boolean;
}): QuoteCalculationResult {
  const catalogMap = buildCatalogMap(params.products);

  // Step 1: Validate all structural, age, booker, guardian, admission, and extra rules
  const ruleViolations = validateBookingRules({
    intent: params.intent,
    catalogMap,
    todayIsoDate: params.todayIsoDate,
  });

  if (ruleViolations.length > 0) {
    return { ok: false, violations: ruleViolations };
  }

  // Step 2: Expand items, compute integer-cents subtotal, and check remaining stock
  const expanded = expandAndPriceItems(params.intent, catalogMap);

  if (expanded.stockViolations.length > 0) {
    return { ok: false, violations: expanded.stockViolations };
  }

  // Step 3: Evaluate promo code
  const promosByCode = new Map(params.promos.map((p) => [p.code.toUpperCase(), p]));
  const promo = evaluatePromoCode({
    rawCode: params.intent.promoCode,
    promosByCode,
    lines: expanded.lines,
    subtotalCents: expanded.subtotalCents,
    nowIso: params.nowIso,
  });

  if (params.strictPromo && promo.status === 'rejected') {
    return {
      ok: false,
      violations: [
        {
          code: promo.rejectionCode,
          path: 'promoCode',
          message: promo.message,
        },
      ],
    };
  }

  const discountCents = promo.discountCents;
  const totalCents = subtractCentsClamped(expanded.subtotalCents, discountCents);
  const warnings = computeWarnings(params.intent, catalogMap, expanded.stockDemand);

  return {
    ok: true,
    quote: {
      lines: expanded.lines,
      attendeePasses: expanded.attendeePasses,
      subtotalCents: expanded.subtotalCents,
      discountCents,
      totalCents,
      promo,
      stockDemand: expanded.stockDemand,
      warnings,
    },
  };
}
