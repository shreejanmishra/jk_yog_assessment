import { describe, expect, it } from 'vitest';
import {
  classifyAge,
  isLegalAdultBooker,
  isValidAgeInteger,
  matchesSelectedCategory,
  requiresGuardian,
} from '@domain/age';
import { DEFAULT_CATALOG, DEFAULT_PROMOS } from '@domain/index';
import { calculateBookingQuote } from '@domain/quote';
import type { BookingIntent } from '@domain/booking-types';

const BASE_BOOKER = {
  fullName: 'Ramesh Sharma',
  email: 'ramesh@example.com',
  phone: '+1 469-555-0192',
  age: 34,
  isAttending: true,
};

describe('domain/age & guardian rules', () => {
  it('classifies exact age boundaries: 0-4 infant, 5-11 child, 12+ adult', () => {
    expect(classifyAge(0)).toBe('infant');
    expect(classifyAge(4)).toBe('infant');
    expect(classifyAge(5)).toBe('child');
    expect(classifyAge(11)).toBe('child');
    expect(classifyAge(12)).toBe('adult');
    expect(classifyAge(17)).toBe('adult');
    expect(classifyAge(18)).toBe('adult');
    expect(classifyAge(120)).toBe('adult');
  });

  it('rejects nonsense ages (negative, fractional, >120, NaN)', () => {
    for (const bad of [-1, -0.5, 4.5, 121, 999, Number.NaN]) {
      expect(isValidAgeInteger(bad)).toBe(false);
    }
  });

  it('enforces booker >= 18 while flagging everyone < 18 as requiring a guardian', () => {
    expect(isLegalAdultBooker(17)).toBe(false);
    expect(isLegalAdultBooker(18)).toBe(true);

    expect(requiresGuardian(3)).toBe(true);
    expect(requiresGuardian(9)).toBe(true);
    expect(requiresGuardian(12)).toBe(true);
    expect(requiresGuardian(17)).toBe(true);
    expect(requiresGuardian(18)).toBe(false);
  });

  it('detects mismatch when someone picks Adult for a 9-year-old or Child for a 14-year-old', () => {
    expect(matchesSelectedCategory(9, 'adult')).toBe(false);
    expect(matchesSelectedCategory(14, 'child')).toBe(false);
    expect(matchesSelectedCategory(3, 'child')).toBe(false);
    expect(matchesSelectedCategory(15, 'adult')).toBe(true);
  });

  it('blocks a 17-year-old from being the primary booker (BOOKER_UNDER_18)', () => {
    const intent: BookingIntent = {
      mode: 'individual',
      booker: { ...BASE_BOOKER, age: 17 },
      attendees: [
        {
          clientId: 'a1',
          isBooker: true,
          selectedCategory: 'adult',
          fullName: 'Aarav Sharma',
          phone: '+1 469-555-0192',
          age: 17,
          passKind: 'day_pass',
          days: ['2026-12-10'],
          extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: [] },
          guardian: { name: 'Ramesh Sharma', phone: '+1 469-555-0100' },
        },
      ],
      familyGroups: [],
    };

    const res = calculateBookingQuote({
      intent,
      products: DEFAULT_CATALOG,
      promos: DEFAULT_PROMOS,
      nowIso: '2026-11-26T12:00:00Z',
      todayIsoDate: '2026-11-26',
      strictPromo: true,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.violations.some((v) => v.code === 'BOOKER_UNDER_18')).toBe(true);
    }
  });

  it('requires Guardian Name and Phone for a 15-year-old on an Adult pass (12-17 minor rule)', () => {
    const baseGroup: BookingIntent = {
      mode: 'group',
      booker: { ...BASE_BOOKER, isAttending: false },
      attendees: [
        {
          clientId: 'teen-1',
          isBooker: false,
          selectedCategory: 'adult',
          fullName: 'Diya Sharma',
          phone: '+1 469-555-0199',
          age: 15,
          passKind: 'day_pass',
          days: ['2026-12-11'],
          extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: [] },
        },
      ],
      familyGroups: [],
    };

    const missingGuardian = calculateBookingQuote({
      intent: baseGroup,
      products: DEFAULT_CATALOG,
      promos: DEFAULT_PROMOS,
      nowIso: '2026-11-26T12:00:00Z',
      todayIsoDate: '2026-11-26',
      strictPromo: true,
    });

    expect(missingGuardian.ok).toBe(false);
    if (!missingGuardian.ok) {
      const codes = missingGuardian.violations.map((v) => v.code);
      expect(codes).toContain('GUARDIAN_NAME_REQUIRED');
      expect(codes).toContain('GUARDIAN_PHONE_REQUIRED');
    }

    // Adding guardian details succeeds and prices the 15-year-old on an Adult pass ($15)
    const withGuardian = calculateBookingQuote({
      intent: {
        ...baseGroup,
        attendees: [
          {
            ...baseGroup.attendees[0]!,
            guardian: { name: 'Ramesh Sharma', phone: '+1 469-555-0192' },
          },
        ],
      },
      products: DEFAULT_CATALOG,
      promos: DEFAULT_PROMOS,
      nowIso: '2026-11-26T12:00:00Z',
      todayIsoDate: '2026-11-26',
      strictPromo: true,
    });

    expect(withGuardian.ok).toBe(true);
    if (withGuardian.ok) {
      expect(withGuardian.quote.totalCents).toBe(1500);
      expect(withGuardian.quote.attendeePasses[0]?.guardian).toEqual({
        name: 'Ramesh Sharma',
        phone: '+1 469-555-0192',
      });
    }
  });

  it('blocks Child pass without Guardian details and blocks Adult pass selected for age 7', () => {
    const mismatchIntent: BookingIntent = {
      mode: 'group',
      booker: BASE_BOOKER,
      attendees: [
        {
          clientId: 'child-wrong-cat',
          isBooker: false,
          selectedCategory: 'adult',
          fullName: 'Kiran Sharma',
          phone: '+1 469-555-0192',
          age: 7,
          passKind: 'day_pass',
          days: ['2026-12-10'],
          extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: [] },
        },
      ],
      familyGroups: [],
    };

    const res = calculateBookingQuote({
      intent: mismatchIntent,
      products: DEFAULT_CATALOG,
      promos: DEFAULT_PROMOS,
      nowIso: '2026-11-26T12:00:00Z',
      todayIsoDate: '2026-11-26',
      strictPromo: true,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      const codes = res.violations.map((v) => v.code);
      expect(codes).toContain('ATTENDEE_TYPE_AGE_MISMATCH');
      expect(codes).toContain('GUARDIAN_NAME_REQUIRED');
    }
  });
});
