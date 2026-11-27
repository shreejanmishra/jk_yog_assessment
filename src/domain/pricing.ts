import { classifyAge, requiresGuardian, type AgeBand } from './age';
import type { BookingIntent, FamilyGroupIntent, GuardianInfo, PassKind } from './booking-types';
import {
  FESTIVAL_DAYS,
  PRODUCT_CODES,
  type CatalogProduct,
  type ProductCode,
} from './catalog';
import type { RuleViolation } from './errors';
import { multiplyCents, sumCents, ZERO_CENTS, type Cents } from './money';
import { resolveAttendeeValidDays } from './rules/admission-rules';

export interface PricedLineItem {
  readonly productCode: ProductCode;
  readonly label: string;
  readonly attendeeClientId: string | null;
  readonly familyGroupId: string | null;
  readonly eventDate: string | null;
  readonly quantity: number;
  readonly unitPriceCents: Cents;
  readonly lineTotalCents: Cents;
}

export interface AttendeePassSummary {
  readonly clientId: string;
  readonly fullName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly age: number;
  readonly ageBand: AgeBand;
  readonly requiresGuardian: boolean;
  readonly guardian: GuardianInfo | null;
  readonly passKind: PassKind;
  readonly passLabel: string;
  readonly validDates: readonly string[];
  readonly validDatesDisplay: string;
  readonly extrasSummary: readonly string[];
}

const SHORT_LABEL_BY_DATE = new Map(FESTIVAL_DAYS.map((d) => [d.date, d.shortLabel]));

export function formatDatesDisplay(dates: readonly string[]): string {
  if (dates.length === FESTIVAL_DAYS.length) {
    return 'All 5 Days (Thu 10 Dec – Mon 14 Dec 2026)';
  }
  return dates.map((d) => SHORT_LABEL_BY_DATE.get(d) ?? d).join(', ');
}

export interface ExpandedPricing {
  readonly lines: readonly PricedLineItem[];
  readonly subtotalCents: Cents;
  readonly stockDemand: ReadonlyMap<ProductCode, number>;
  readonly stockViolations: readonly RuleViolation[];
  readonly attendeePasses: readonly AttendeePassSummary[];
}

export function expandAndPriceItems(
  intent: BookingIntent,
  catalogMap: ReadonlyMap<ProductCode, CatalogProduct>,
): ExpandedPricing {
  const lines: PricedLineItem[] = [];
  const demand = new Map<ProductCode, number>();
  const familyGroupsById = new Map<string, FamilyGroupIntent>(
    intent.familyGroups.map((g) => [g.id, g]),
  );

  const addDemand = (code: ProductCode, qty: number): void => {
    if (qty <= 0) return;
    demand.set(code, (demand.get(code) ?? 0) + qty);
  };

  const requireProduct = (code: ProductCode): CatalogProduct => {
    const product = catalogMap.get(code);
    if (!product) {
      throw new Error(`Catalog missing required product code: ${code}`);
    }
    return product;
  };

  // 1. Price Family Pass groups first (1 unit per family group per chosen date)
  for (const group of intent.familyGroups) {
    const uniqueDays = [...new Set(group.days)].sort();
    const product = requireProduct(PRODUCT_CODES.FAMILY_PASS);
    for (const date of uniqueDays) {
      const dateLabel = SHORT_LABEL_BY_DATE.get(date) ?? date;
      lines.push({
        productCode: product.code,
        label: `${product.name} (${dateLabel})`,
        attendeeClientId: null,
        familyGroupId: group.id,
        eventDate: date,
        quantity: 1,
        unitPriceCents: product.unitPriceCents,
        lineTotalCents: multiplyCents(product.unitPriceCents, 1),
      });
      addDemand(product.code, 1);
    }
  }

  // 2. Price each attendee's admission + per-person extras
  const attendeePasses: AttendeePassSummary[] = [];

  for (const attendee of intent.attendees) {
    const band = classifyAge(attendee.age);
    const validDates = resolveAttendeeValidDays(attendee, familyGroupsById);
    let passLabel = '';

    if (attendee.passKind === 'free_infant') {
      passLabel = 'Under 5 Free Entry Pass';
    } else if (attendee.passKind === 'family_pass') {
      passLabel = band === 'adult' ? 'Family Pass – Adult Member' : 'Family Pass – Child Member';
    } else if (attendee.passKind === 'all_day') {
      const code =
        band === 'adult' ? PRODUCT_CODES.ALL_DAY_ADULT : PRODUCT_CODES.ALL_DAY_CHILD;
      const product = requireProduct(code);
      passLabel = product.name;
      lines.push({
        productCode: product.code,
        label: `${product.name} — ${attendee.fullName.trim()}`,
        attendeeClientId: attendee.clientId,
        familyGroupId: null,
        eventDate: null,
        quantity: 1,
        unitPriceCents: product.unitPriceCents,
        lineTotalCents: multiplyCents(product.unitPriceCents, 1),
      });
      addDemand(product.code, 1);
    } else if (attendee.passKind === 'day_pass') {
      const code =
        band === 'adult' ? PRODUCT_CODES.DAY_PASS_ADULT : PRODUCT_CODES.DAY_PASS_CHILD;
      const product = requireProduct(code);
      passLabel = product.name;
      for (const date of validDates) {
        const dateLabel = SHORT_LABEL_BY_DATE.get(date) ?? date;
        lines.push({
          productCode: product.code,
          label: `${product.name} (${dateLabel}) — ${attendee.fullName.trim()}`,
          attendeeClientId: attendee.clientId,
          familyGroupId: null,
          eventDate: date,
          quantity: 1,
          unitPriceCents: product.unitPriceCents,
          lineTotalCents: multiplyCents(product.unitPriceCents, 1),
        });
        addDemand(product.code, 1);
      }
    }

    const extrasSummary: string[] = [];

    // Dinner plates (per person, per day)
    const sortedDinners = [...new Set(attendee.extras.dinnerDates)].sort();
    if (sortedDinners.length > 0) {
      const dinnerProduct = requireProduct(PRODUCT_CODES.DINNER_PLATE);
      for (const date of sortedDinners) {
        const dateLabel = SHORT_LABEL_BY_DATE.get(date) ?? date;
        lines.push({
          productCode: dinnerProduct.code,
          label: `${dinnerProduct.name} (${dateLabel}) — ${attendee.fullName.trim()}`,
          attendeeClientId: attendee.clientId,
          familyGroupId: null,
          eventDate: date,
          quantity: 1,
          unitPriceCents: dinnerProduct.unitPriceCents,
          lineTotalCents: multiplyCents(dinnerProduct.unitPriceCents, 1),
        });
        addDemand(dinnerProduct.code, 1);
      }
      extrasSummary.push(
        `Dinner Plate (${sortedDinners.map((d) => SHORT_LABEL_BY_DATE.get(d) ?? d).join(', ')})`,
      );
    }

    // Garba Workshop (Dec 11 & Dec 13 only)
    const sortedWorkshops = [...new Set(attendee.extras.workshopDates)].sort();
    if (sortedWorkshops.length > 0) {
      const workshopProduct = requireProduct(PRODUCT_CODES.GARBA_WORKSHOP);
      for (const date of sortedWorkshops) {
        const dateLabel = SHORT_LABEL_BY_DATE.get(date) ?? date;
        lines.push({
          productCode: workshopProduct.code,
          label: `${workshopProduct.name} (${dateLabel}) — ${attendee.fullName.trim()}`,
          attendeeClientId: attendee.clientId,
          familyGroupId: null,
          eventDate: date,
          quantity: 1,
          unitPriceCents: workshopProduct.unitPriceCents,
          lineTotalCents: multiplyCents(workshopProduct.unitPriceCents, 1),
        });
        addDemand(workshopProduct.code, 1);
      }
      extrasSummary.push(
        `Garba Workshop (${sortedWorkshops.map((d) => SHORT_LABEL_BY_DATE.get(d) ?? d).join(', ')})`,
      );
    }

    // Dandiya Sticks (pairs)
    if (attendee.extras.dandiyaPairs > 0) {
      const dandiyaProduct = requireProduct(PRODUCT_CODES.DANDIYA_PAIR);
      const pairs = attendee.extras.dandiyaPairs;
      lines.push({
        productCode: dandiyaProduct.code,
        label: `${dandiyaProduct.name} × ${pairs} — ${attendee.fullName.trim()}`,
        attendeeClientId: attendee.clientId,
        familyGroupId: null,
        eventDate: null,
        quantity: pairs,
        unitPriceCents: dandiyaProduct.unitPriceCents,
        lineTotalCents: multiplyCents(dandiyaProduct.unitPriceCents, pairs),
      });
      addDemand(dandiyaProduct.code, pairs);
      extrasSummary.push(`Dandiya Sticks × ${pairs} pair${pairs > 1 ? 's' : ''}`);
    }

    const minor = requiresGuardian(attendee.age);
    attendeePasses.push({
      clientId: attendee.clientId,
      fullName: attendee.fullName.trim(),
      email: attendee.email?.trim() ? attendee.email.trim() : null,
      phone: attendee.phone?.trim() ? attendee.phone.trim() : null,
      age: attendee.age,
      ageBand: band,
      requiresGuardian: minor,
      guardian:
        minor && attendee.guardian
          ? { name: attendee.guardian.name.trim(), phone: attendee.guardian.phone.trim() }
          : null,
      passKind: attendee.passKind,
      passLabel,
      validDates,
      validDatesDisplay: formatDatesDisplay(validDates),
      extrasSummary: extrasSummary.length > 0 ? extrasSummary : ['None'],
    });
  }

  // 3. Check stock availability against catalog remainingStock
  const stockViolations: RuleViolation[] = [];
  for (const [code, qty] of demand.entries()) {
    const product = requireProduct(code);
    if (product.remainingStock <= 0) {
      stockViolations.push({
        code: 'PRODUCT_SOLD_OUT',
        path: `stock.${code}`,
        message: `${product.name} is sold out.`,
      });
    } else if (qty > product.remainingStock) {
      stockViolations.push({
        code: 'INSUFFICIENT_STOCK',
        path: `stock.${code}`,
        message: `Only ${product.remainingStock} ${product.name} remaining, cannot book ${qty}.`,
      });
    }
  }

  const subtotalCents = lines.length > 0 ? sumCents(lines.map((l) => l.lineTotalCents)) : ZERO_CENTS;

  return {
    lines,
    subtotalCents,
    stockDemand: demand,
    stockViolations,
    attendeePasses,
  };
}
