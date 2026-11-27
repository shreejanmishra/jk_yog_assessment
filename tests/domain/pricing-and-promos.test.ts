import { describe, expect, it } from 'vitest';
import {
  calculateBookingQuote,
  DEFAULT_CATALOG,
  DEFAULT_PROMOS,
  type BookingIntent,
} from '@domain/index';

const BOOKER = {
  fullName: 'Anita Patel',
  email: 'anita@example.com',
  phone: '+1 972-555-0144',
  age: 38,
  isAttending: true,
};

describe('domain/pricing, stock & promo codes', () => {
  it('prices 2 adults × 3 days + 1 child (age 9) × 3 days = $114.00, and $102.60 with SEVA10', () => {
    const intent: BookingIntent = {
      mode: 'group',
      booker: BOOKER,
      attendees: [
        {
          clientId: 'a1',
          isBooker: true,
          selectedCategory: 'adult',
          fullName: 'Anita Patel',
          phone: '+1 972-555-0144',
          age: 38,
          passKind: 'day_pass',
          days: ['2026-12-10', '2026-12-11', '2026-12-12'],
          extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: [] },
        },
        {
          clientId: 'a2',
          isBooker: false,
          selectedCategory: 'adult',
          fullName: 'Vikram Patel',
          phone: '+1 972-555-0145',
          age: 40,
          passKind: 'day_pass',
          days: ['2026-12-10', '2026-12-11', '2026-12-12'],
          extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: [] },
        },
        {
          clientId: 'c1',
          isBooker: false,
          selectedCategory: 'child',
          fullName: 'Riya Patel',
          age: 9,
          passKind: 'day_pass',
          days: ['2026-12-10', '2026-12-11', '2026-12-12'],
          extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: [] },
          guardian: { name: 'Anita Patel', phone: '+1 972-555-0144' },
        },
      ],
      familyGroups: [],
      promoCode: '  seva10 ',
    };

    const res = calculateBookingQuote({
      intent,
      products: DEFAULT_CATALOG,
      promos: DEFAULT_PROMOS,
      nowIso: '2026-11-26T12:00:00Z',
      todayIsoDate: '2026-11-26',
      strictPromo: true,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.quote.subtotalCents).toBe(11400); // 6*1500 + 3*800 = 11400
      expect(res.quote.discountCents).toBe(1140);
      expect(res.quote.totalCents).toBe(10260);
      expect(res.quote.stockDemand.get('DAY_PASS_ADULT')).toBe(6);
      expect(res.quote.stockDemand.get('DAY_PASS_CHILD')).toBe(3);
    }
  });

  it('rejects FLAT20 when subtotal is $40.00 or less (e.g. $15 or $40), and applies $20 off when subtotal > $40.00', () => {
    // 1. $15 single-day adult pass -> rejected (PROMO_NOT_APPLICABLE)
    const onFifteenDollars = calculateBookingQuote({
      intent: {
        mode: 'individual',
        booker: BOOKER,
        attendees: [
          {
            clientId: 'a1',
            isBooker: true,
            selectedCategory: 'adult',
            fullName: 'Anita Patel',
            phone: '+1 972-555-0144',
            age: 38,
            passKind: 'day_pass',
            days: ['2026-12-10'],
            extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: [] },
          },
        ],
        familyGroups: [],
        promoCode: 'FLAT20',
      },
      products: DEFAULT_CATALOG,
      promos: DEFAULT_PROMOS,
      nowIso: '2026-11-26T12:00:00Z',
      todayIsoDate: '2026-11-26',
      strictPromo: false,
    });

    expect(onFifteenDollars.ok).toBe(true);
    if (onFifteenDollars.ok) {
      expect(onFifteenDollars.quote.promo.status).toBe('rejected');
      expect(onFifteenDollars.quote.promo.rejectionCode).toBe('PROMO_NOT_APPLICABLE');
      expect(onFifteenDollars.quote.totalCents).toBe(1500);
    }

    // 2. Exact $40.00 subtotal ($15*2 + $5*2 = $40.00) -> still rejected (must be MORE than $40)
    const onExactFortyDollars = calculateBookingQuote({
      intent: {
        mode: 'individual',
        booker: BOOKER,
        attendees: [
          {
            clientId: 'a1',
            isBooker: true,
            selectedCategory: 'adult',
            fullName: 'Anita Patel',
            phone: '+1 972-555-0144',
            age: 38,
            passKind: 'day_pass',
            days: ['2026-12-10', '2026-12-11'],
            extras: { dandiyaPairs: 2, dinnerDates: [], workshopDates: [] },
          },
        ],
        familyGroups: [],
        promoCode: 'FLAT20',
      },
      products: DEFAULT_CATALOG,
      promos: DEFAULT_PROMOS,
      nowIso: '2026-11-26T12:00:00Z',
      todayIsoDate: '2026-11-26',
      strictPromo: true,
    });
    expect(onExactFortyDollars.ok).toBe(false);

    // 3. $45.00 subtotal (3 evenings * $15 = $45.00 > $40.00) -> $20 off = $25.00 payable
    const onFortyFiveDollars = calculateBookingQuote({
      intent: {
        mode: 'individual',
        booker: BOOKER,
        attendees: [
          {
            clientId: 'a1',
            isBooker: true,
            selectedCategory: 'adult',
            fullName: 'Anita Patel',
            phone: '+1 972-555-0144',
            age: 38,
            passKind: 'day_pass',
            days: ['2026-12-10', '2026-12-11', '2026-12-12'],
            extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: [] },
          },
        ],
        familyGroups: [],
        promoCode: 'FLAT20',
      },
      products: DEFAULT_CATALOG,
      promos: DEFAULT_PROMOS,
      nowIso: '2026-11-26T12:00:00Z',
      todayIsoDate: '2026-11-26',
      strictPromo: true,
    });

    expect(onFortyFiveDollars.ok).toBe(true);
    if (onFortyFiveDollars.ok) {
      expect(onFortyFiveDollars.quote.subtotalCents).toBe(4500);
      expect(onFortyFiveDollars.quote.discountCents).toBe(2000);
      expect(onFortyFiveDollars.quote.totalCents).toBe(2500);
    }
  });

  it('KIDSFREE zeroes Child Day & All-Day passes while leaving Adult passes and Extras intact', () => {
    const intent: BookingIntent = {
      mode: 'group',
      booker: BOOKER,
      attendees: [
        {
          clientId: 'a1',
          isBooker: true,
          selectedCategory: 'adult',
          fullName: 'Anita Patel',
          phone: '+1 972-555-0144',
          age: 38,
          passKind: 'day_pass',
          days: ['2026-12-10', '2026-12-11', '2026-12-12', '2026-12-13', '2026-12-14'],
          extras: { dandiyaPairs: 1, dinnerDates: [], workshopDates: [] },
        },
        {
          clientId: 'c1',
          isBooker: false,
          selectedCategory: 'child',
          fullName: 'Riya Patel',
          age: 8,
          passKind: 'all_day',
          days: [],
          extras: { dandiyaPairs: 0, dinnerDates: ['2026-12-11'], workshopDates: [] },
          guardian: { name: 'Anita Patel', phone: '+1 972-555-0144' },
        },
        {
          clientId: 'infant-1',
          isBooker: false,
          selectedCategory: 'infant',
          fullName: 'Dev Patel',
          age: 3,
          passKind: 'free_infant',
          days: ['2026-12-11'],
          extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: [] },
          guardian: { name: 'Anita Patel', phone: '+1 972-555-0144' },
        },
      ],
      familyGroups: [],
      promoCode: 'KIDSFREE',
    };

    const res = calculateBookingQuote({
      intent,
      products: DEFAULT_CATALOG,
      promos: DEFAULT_PROMOS,
      nowIso: '2026-11-26T12:00:00Z',
      todayIsoDate: '2026-11-26',
      strictPromo: true,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      // Adult 5 days ($75) + 1 Dandiya ($5) + Child All-Day ($30) + 1 Child Dinner ($12) = $122
      expect(res.quote.subtotalCents).toBe(12200);
      // Only Child All-Day ($30) is discounted
      expect(res.quote.discountCents).toBe(3000);
      expect(res.quote.totalCents).toBe(9200);
    }
  });

  it('rejects KIDSFREE when no child exists in the booking OR on Family Pass as PROMO_NOT_APPLICABLE', () => {
    const adultOnlyNoChild = calculateBookingQuote({
      intent: {
        mode: 'individual',
        booker: BOOKER,
        attendees: [
          {
            clientId: 'a1',
            isBooker: true,
            selectedCategory: 'adult',
            fullName: 'Anita Patel',
            phone: '+1 972-555-0144',
            age: 38,
            passKind: 'day_pass',
            days: ['2026-12-10'],
            extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: [] },
          },
        ],
        familyGroups: [],
        promoCode: 'KIDSFREE',
      },
      products: DEFAULT_CATALOG,
      promos: DEFAULT_PROMOS,
      nowIso: '2026-11-26T12:00:00Z',
      todayIsoDate: '2026-11-26',
      strictPromo: true,
    });
    expect(adultOnlyNoChild.ok).toBe(false);
    if (!adultOnlyNoChild.ok) {
      expect(adultOnlyNoChild.violations[0]?.code).toBe('PROMO_NOT_APPLICABLE');
    }

    const intent: BookingIntent = {
      mode: 'group',
      booker: BOOKER,
      attendees: [
        {
          clientId: 'a1',
          isBooker: true,
          selectedCategory: 'adult',
          fullName: 'Anita Patel',
          phone: '+1 972-555-0144',
          age: 38,
          passKind: 'family_pass',
          days: [],
          familyGroupId: 'fg-1',
          extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: [] },
        },
        {
          clientId: 'c1',
          isBooker: false,
          selectedCategory: 'child',
          fullName: 'Riya Patel',
          age: 8,
          passKind: 'family_pass',
          days: [],
          familyGroupId: 'fg-1',
          extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: [] },
          guardian: { name: 'Anita Patel', phone: '+1 972-555-0144' },
        },
      ],
      familyGroups: [{ id: 'fg-1', days: ['2026-12-11'] }],
      promoCode: 'KIDSFREE',
    };

    const quotePreview = calculateBookingQuote({
      intent,
      products: DEFAULT_CATALOG,
      promos: DEFAULT_PROMOS,
      nowIso: '2026-11-26T12:00:00Z',
      todayIsoDate: '2026-11-26',
      strictPromo: false,
    });

    expect(quotePreview.ok).toBe(true);
    if (quotePreview.ok) {
      expect(quotePreview.quote.promo.status).toBe('rejected');
      expect(quotePreview.quote.promo.rejectionCode).toBe('PROMO_NOT_APPLICABLE');
      expect(quotePreview.quote.totalCents).toBe(4000);
    }

    const strictConfirm = calculateBookingQuote({
      intent,
      products: DEFAULT_CATALOG,
      promos: DEFAULT_PROMOS,
      nowIso: '2026-11-26T12:00:00Z',
      todayIsoDate: '2026-11-26',
      strictPromo: true,
    });
    expect(strictConfirm.ok).toBe(false);
  });

  it('rejects EXPIRED5, MAXEDOUT, and unknown promo codes with distinct codes', () => {
    for (const [code, expectedCode] of [
      ['EXPIRED5', 'PROMO_EXPIRED'],
      ['MAXEDOUT', 'PROMO_EXHAUSTED'],
      ['BOGUS99', 'PROMO_NOT_FOUND'],
    ] as const) {
      const res = calculateBookingQuote({
        intent: {
          mode: 'individual',
          booker: BOOKER,
          attendees: [
            {
              clientId: 'a1',
              isBooker: true,
              selectedCategory: 'adult',
              fullName: 'Anita Patel',
              phone: '+1 972-555-0144',
              age: 38,
              passKind: 'day_pass',
              days: ['2026-12-11'],
              extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: [] },
            },
          ],
          familyGroups: [],
          promoCode: code,
        },
        products: DEFAULT_CATALOG,
        promos: DEFAULT_PROMOS,
        nowIso: '2026-11-26T12:00:00Z',
        todayIsoDate: '2026-11-26',
        strictPromo: true,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.violations[0]?.code).toBe(expectedCode);
      }
    }
  });

  it('enforces sold-out Adult All-Day Pass (stock=0) and Garba Workshop stock=2 & valid dates', () => {
    const soldOutAdultAllDay = calculateBookingQuote({
      intent: {
        mode: 'individual',
        booker: BOOKER,
        attendees: [
          {
            clientId: 'a1',
            isBooker: true,
            selectedCategory: 'adult',
            fullName: 'Anita Patel',
            phone: '+1 972-555-0144',
            age: 38,
            passKind: 'all_day',
            days: [],
            extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: [] },
          },
        ],
        familyGroups: [],
      },
      products: DEFAULT_CATALOG,
      promos: DEFAULT_PROMOS,
      nowIso: '2026-11-26T12:00:00Z',
      todayIsoDate: '2026-11-26',
      strictPromo: true,
    });

    expect(soldOutAdultAllDay.ok).toBe(false);
    if (!soldOutAdultAllDay.ok) {
      expect(soldOutAdultAllDay.violations.some((v) => v.code === 'PRODUCT_SOLD_OUT')).toBe(true);
    }

    // Requesting Garba Workshop on Dec 12 (invalid workshop day) -> WORKSHOP_DAY_INVALID
    const wrongWorkshopDay = calculateBookingQuote({
      intent: {
        mode: 'individual',
        booker: BOOKER,
        attendees: [
          {
            clientId: 'a1',
            isBooker: true,
            selectedCategory: 'adult',
            fullName: 'Anita Patel',
            phone: '+1 972-555-0144',
            age: 38,
            passKind: 'day_pass',
            days: ['2026-12-12'],
            extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: ['2026-12-12'] },
          },
        ],
        familyGroups: [],
      },
      products: DEFAULT_CATALOG,
      promos: DEFAULT_PROMOS,
      nowIso: '2026-11-26T12:00:00Z',
      todayIsoDate: '2026-11-26',
      strictPromo: true,
    });

    expect(wrongWorkshopDay.ok).toBe(false);
    if (!wrongWorkshopDay.ok) {
      expect(wrongWorkshopDay.violations.some((v) => v.code === 'WORKSHOP_DAY_INVALID')).toBe(true);
    }

    // Requesting 3 Garba Workshop spots when stock is 2 -> INSUFFICIENT_STOCK
    const overStockWorkshop = calculateBookingQuote({
      intent: {
        mode: 'group',
        booker: BOOKER,
        attendees: [
          {
            clientId: 'a1',
            isBooker: true,
            selectedCategory: 'adult',
            fullName: 'Anita Patel',
            phone: '+1 972-555-0144',
            age: 38,
            passKind: 'day_pass',
            days: ['2026-12-11', '2026-12-13'],
            extras: {
              dandiyaPairs: 0,
              dinnerDates: [],
              workshopDates: ['2026-12-11', '2026-12-13'],
            },
          },
          {
            clientId: 'a2',
            isBooker: false,
            selectedCategory: 'adult',
            fullName: 'Vikram Patel',
            phone: '+1 972-555-0145',
            age: 40,
            passKind: 'day_pass',
            days: ['2026-12-11'],
            extras: {
              dandiyaPairs: 0,
              dinnerDates: [],
              workshopDates: ['2026-12-11'],
            },
          },
        ],
        familyGroups: [],
      },
      products: DEFAULT_CATALOG,
      promos: DEFAULT_PROMOS,
      nowIso: '2026-11-26T12:00:00Z',
      todayIsoDate: '2026-11-26',
      strictPromo: true,
    });

    expect(overStockWorkshop.ok).toBe(false);
    if (!overStockWorkshop.ok) {
      expect(overStockWorkshop.violations.some((v) => v.code === 'INSUFFICIENT_STOCK')).toBe(true);
    }
  });
});
