import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  calculateBookingQuote,
  classifyAge,
  DEFAULT_CATALOG,
  DEFAULT_PROMOS,
  FESTIVAL_DAYS,
  requiresGuardian,
  type AttendeeIntent,
  type BookingIntent,
} from '@domain/index';

const ALL_DATES = FESTIVAL_DAYS.map((d) => d.date);

describe('domain/quote property-based invariants', () => {
  it('never produces negative, non-integer, or inconsistent totals across random valid party mixes', () => {
    const daySubsetArb = fc.uniqueArray(fc.constantFrom(...ALL_DATES), {
      minLength: 1,
      maxLength: 5,
    });

    const attendeeArb: fc.Arbitrary<AttendeeIntent> = fc
      .record({
        age: fc.integer({ min: 0, max: 90 }),
        days: daySubsetArb,
        dandiyaPairs: fc.integer({ min: 0, max: 4 }),
        includeDinnerOnFirstDay: fc.boolean(),
      })
      .map((raw) => {
        const band = classifyAge(raw.age);
        const passKind = band === 'infant' ? 'free_infant' : 'day_pass';
        const firstDay = raw.days[0]!;
        return {
          clientId: `att-${raw.age}`,
          isBooker: false,
          selectedCategory: band,
          fullName: `Guest ${raw.age}`,
          phone: '+1 469-555-0100',
          age: raw.age,
          passKind,
          days: raw.days,
          extras: {
            dandiyaPairs: raw.dandiyaPairs,
            dinnerDates: raw.includeDinnerOnFirstDay ? [firstDay] : [],
            workshopDates: [],
          },
          guardian: requiresGuardian(raw.age)
            ? { name: 'Parent Guardian', phone: '+1 469-555-0199' }
            : undefined,
        };
      });

    const promoArb = fc.constantFrom(undefined, 'SEVA10', 'FLAT20', 'KIDSFREE');

    fc.assert(
      fc.property(
        fc.array(attendeeArb, { minLength: 1, maxLength: 6 }),
        promoArb,
        (attendees, promoCode) => {
          const normalized = attendees.map((a, i) => ({
            ...a,
            clientId: `c-${i}`,
          }));
          const intent: BookingIntent = {
            mode: 'group',
            booker: {
              fullName: 'Lead Booker',
              email: 'lead@example.com',
              phone: '+1 469-555-0111',
              age: 35,
              isAttending: false,
            },
            attendees: normalized,
            familyGroups: [],
            promoCode,
          };

          const result = calculateBookingQuote({
            intent,
            products: DEFAULT_CATALOG,
            promos: DEFAULT_PROMOS,
            nowIso: '2026-11-26T12:00:00Z',
            todayIsoDate: '2026-11-26',
            strictPromo: false,
          });

          expect(result.ok).toBe(true);
          if (result.ok) {
            const { subtotalCents, discountCents, totalCents, lines } = result.quote;
            const lineSum = lines.reduce((acc, l) => acc + l.lineTotalCents, 0);
            expect(Number.isSafeInteger(subtotalCents)).toBe(true);
            expect(Number.isSafeInteger(discountCents)).toBe(true);
            expect(Number.isSafeInteger(totalCents)).toBe(true);
            expect(subtotalCents).toBe(lineSum);
            expect(discountCents).toBeGreaterThanOrEqual(0);
            expect(discountCents).toBeLessThanOrEqual(subtotalCents);
            expect(totalCents).toBe(subtotalCents - discountCents);
            expect(totalCents).toBeGreaterThanOrEqual(0);
          }
        },
      ),
      { numRuns: 75 },
    );
  });
});
