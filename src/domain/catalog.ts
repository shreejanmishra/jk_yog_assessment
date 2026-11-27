import { cents, type Cents } from './money';

export const PRODUCT_CODES = {
  DAY_PASS_ADULT: 'DAY_PASS_ADULT',
  DAY_PASS_CHILD: 'DAY_PASS_CHILD',
  ALL_DAY_ADULT: 'ALL_DAY_ADULT',
  ALL_DAY_CHILD: 'ALL_DAY_CHILD',
  FAMILY_PASS: 'FAMILY_PASS',
  DANDIYA_PAIR: 'DANDIYA_PAIR',
  DINNER_PLATE: 'DINNER_PLATE',
  GARBA_WORKSHOP: 'GARBA_WORKSHOP',
} as const;

export type ProductCode = (typeof PRODUCT_CODES)[keyof typeof PRODUCT_CODES];

export interface FestivalDayInfo {
  readonly date: string;
  readonly shortLabel: string;
  readonly fullLabel: string;
  readonly highlight: string;
}

export const FESTIVAL_DAYS: readonly FestivalDayInfo[] = [
  {
    date: '2026-12-10',
    shortLabel: 'Thu 10 Dec',
    fullLabel: 'Thursday, Dec 10, 2026',
    highlight: 'Opening Maha Aarti, Bhajan Sandhya & Cultural Welcome',
  },
  {
    date: '2026-12-11',
    shortLabel: 'Fri 11 Dec',
    fullLabel: 'Friday, Dec 11, 2026',
    highlight: 'Special Garba Workshop, Live Folk Orchestra & Raas Night',
  },
  {
    date: '2026-12-12',
    shortLabel: 'Sat 12 Dec',
    fullLabel: 'Saturday, Dec 12, 2026',
    highlight: 'Grand Sharad Raas-Garba, Family Seva Showcase & Annakut',
  },
  {
    date: '2026-12-13',
    shortLabel: 'Sun 13 Dec',
    fullLabel: 'Sunday, Dec 13, 2026',
    highlight: 'Master Garba Workshop, Youth Cultural Dance & Deepotsav',
  },
  {
    date: '2026-12-14',
    shortLabel: 'Mon 14 Dec',
    fullLabel: 'Monday, Dec 14, 2026',
    highlight: 'Sharad Purnima Moonlit Kirtan, Prasad & Closing Blessings',
  },
] as const;

export const FESTIVAL_DATE_SET: ReadonlySet<string> = new Set(FESTIVAL_DAYS.map((d) => d.date));
export const GARBA_WORKSHOP_DATES: readonly string[] = ['2026-12-11', '2026-12-13'] as const;

export const EVENT_METADATA = {
  slug: 'sharad-utsav-2026',
  name: 'Sharad Utsav 2026',
  venue: 'Radha Krishna Temple, Allen, Texas',
  address: '1450 N Watters Rd, Allen, TX 75013',
  timezone: 'America/Chicago',
  currency: 'USD',
  startsOn: '2026-12-10',
  endsOn: '2026-12-14',
  ageReferenceDate: '2026-12-10',
  holdMinutes: 10,
  maxAttendeesPerBooking: 20,
  maxDandiyaPairsPerAttendee: 20,
} as const;

export type ProductCategory = 'admission' | 'extra';
export type ProductAgeBand = 'adult' | 'child' | null;
export type PricingUnit = 'flat' | 'per_person_per_day' | 'per_day' | 'per_unit';
export type DayRule = 'choose_days' | 'all_days' | 'single_day' | 'specific_days' | 'none';

export interface CatalogProduct {
  readonly code: ProductCode;
  readonly name: string;
  readonly description: string;
  readonly category: ProductCategory;
  readonly ageBand: ProductAgeBand;
  readonly pricingUnit: PricingUnit;
  readonly dayRule: DayRule;
  readonly allowedDates: readonly string[] | null;
  readonly unitPriceCents: Cents;
  readonly totalStock: number;
  readonly remainingStock: number;
  readonly maxAdults: number | null;
  readonly maxChildren: number | null;
  readonly sortOrder: number;
}

export const DEFAULT_CATALOG: readonly CatalogProduct[] = [
  {
    code: PRODUCT_CODES.DAY_PASS_ADULT,
    name: 'Day Pass – Adult',
    description: 'Ages 12 and above · Valid on any chosen festival day(s).',
    category: 'admission',
    ageBand: 'adult',
    pricingUnit: 'per_person_per_day',
    dayRule: 'choose_days',
    allowedDates: null,
    unitPriceCents: cents(1500),
    totalStock: 380,
    remainingStock: 380,
    maxAdults: null,
    maxChildren: null,
    sortOrder: 1,
  },
  {
    code: PRODUCT_CODES.DAY_PASS_CHILD,
    name: 'Day Pass – Child',
    description: 'Ages 5 to 11 · Valid on any chosen festival day(s).',
    category: 'admission',
    ageBand: 'child',
    pricingUnit: 'per_person_per_day',
    dayRule: 'choose_days',
    allowedDates: null,
    unitPriceCents: cents(800),
    totalStock: 260,
    remainingStock: 260,
    maxAdults: null,
    maxChildren: null,
    sortOrder: 2,
  },
  {
    code: PRODUCT_CODES.ALL_DAY_ADULT,
    name: 'All-Day Pass – Adult',
    description: 'Ages 12 and above · Covers all 5 festival days.',
    category: 'admission',
    ageBand: 'adult',
    pricingUnit: 'flat',
    dayRule: 'all_days',
    allowedDates: null,
    unitPriceCents: cents(6000),
    totalStock: 0,
    remainingStock: 0,
    maxAdults: null,
    maxChildren: null,
    sortOrder: 3,
  },
  {
    code: PRODUCT_CODES.ALL_DAY_CHILD,
    name: 'All-Day Pass – Child',
    description: 'Ages 5 to 11 · Covers all 5 festival days.',
    category: 'admission',
    ageBand: 'child',
    pricingUnit: 'flat',
    dayRule: 'all_days',
    allowedDates: null,
    unitPriceCents: cents(3000),
    totalStock: 140,
    remainingStock: 140,
    maxAdults: null,
    maxChildren: null,
    sortOrder: 4,
  },
  {
    code: PRODUCT_CODES.FAMILY_PASS,
    name: 'Family Pass',
    description: 'Covers up to 2 adults (12+) and 2 children (5–11) for one single day.',
    category: 'admission',
    ageBand: null,
    pricingUnit: 'per_day',
    dayRule: 'single_day',
    allowedDates: null,
    unitPriceCents: cents(4000),
    totalStock: 95,
    remainingStock: 95,
    maxAdults: 2,
    maxChildren: 2,
    sortOrder: 5,
  },
  {
    code: PRODUCT_CODES.DANDIYA_PAIR,
    name: 'Dandiya Sticks (Pair)',
    description: 'Traditional decorated wooden dandiya sticks souvenir pair.',
    category: 'extra',
    ageBand: null,
    pricingUnit: 'per_unit',
    dayRule: 'none',
    allowedDates: null,
    unitPriceCents: cents(500),
    totalStock: 900,
    remainingStock: 900,
    maxAdults: null,
    maxChildren: null,
    sortOrder: 6,
  },
  {
    code: PRODUCT_CODES.DINNER_PLATE,
    name: 'Dinner Plate',
    description: 'Freshly prepared sattvic festival dinner · Priced per person, per day.',
    category: 'extra',
    ageBand: null,
    pricingUnit: 'per_person_per_day',
    dayRule: 'choose_days',
    allowedDates: null,
    unitPriceCents: cents(1200),
    totalStock: 1700,
    remainingStock: 1700,
    maxAdults: null,
    maxChildren: null,
    sortOrder: 7,
  },
  {
    code: PRODUCT_CODES.GARBA_WORKSHOP,
    name: 'Garba Workshop',
    description: 'Guided choreography workshop · Runs on Fri 11 Dec & Sun 13 Dec only.',
    category: 'extra',
    ageBand: null,
    pricingUnit: 'per_unit',
    dayRule: 'specific_days',
    allowedDates: GARBA_WORKSHOP_DATES,
    unitPriceCents: cents(2000),
    totalStock: 2,
    remainingStock: 2,
    maxAdults: null,
    maxChildren: null,
    sortOrder: 8,
  },
] as const;

export function buildCatalogMap(
  products: readonly CatalogProduct[],
): ReadonlyMap<ProductCode, CatalogProduct> {
  const map = new Map<ProductCode, CatalogProduct>();
  for (const product of products) {
    map.set(product.code, product);
  }
  return map;
}

export function getStockStatus(remaining: number): 'available' | 'low' | 'sold_out' {
  if (remaining <= 0) return 'sold_out';
  if (remaining <= 10) return 'low';
  return 'available';
}
