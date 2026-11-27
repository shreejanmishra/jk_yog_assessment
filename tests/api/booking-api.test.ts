import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  ApiErrorEnvelopeDTO,
  CreateBookingResponseDTO,
  EventCatalogResponseDTO,
  QuoteResponseDTO,
  SimulatedEmailResponseDTO,
  SimulatePaymentResponseDTO,
} from '@contract/index';
import { createApp } from '@server/app';
import type { Clock } from '@server/lib/clock';
import { InMemoryTransactionalStore } from '@server/store/memory-store';
import { invokeApp } from '../helpers/invoke-app';

function createMutableClock(initialIso: string): {
  clock: Clock;
  advanceMinutes: (mins: number) => void;
} {
  let current = new Date(initialIso);
  return {
    clock: {
      now: () => current,
      nowIso: () => current.toISOString(),
      todayFestivalIsoDate: () => current.toISOString().slice(0, 10),
    },
    advanceMinutes: (mins: number) => {
      current = new Date(current.getTime() + mins * 60 * 1000);
    },
  };
}

describe('Express 5 API — server authority, concurrency, PDFs, and simulated email', () => {
  it('rejects tampered expectedTotalCents with 409 PRICE_CHANGED (server decides price)', async () => {
    const store = new InMemoryTransactionalStore();
    const { clock } = createMutableClock('2026-11-26T15:00:00Z');
    const app = createApp({ store, clock });

    const res = await invokeApp<ApiErrorEnvelopeDTO>(app, {
      method: 'POST',
      path: '/api/bookings',
      headers: { 'Idempotency-Key': `tamper-price-${crypto.randomUUID()}` },
      body: {
        mode: 'individual',
        booker: {
          fullName: 'DevTools Tamperer',
          email: 'tamper@example.com',
          phone: '+1 469-555-0123',
          age: 29,
          isAttending: true,
        },
        attendees: [
          {
            clientId: 'a1',
            isBooker: true,
            selectedCategory: 'adult',
            fullName: 'DevTools Tamperer',
            phone: '+1 469-555-0123',
            age: 29,
            passKind: 'day_pass',
            days: ['2026-12-10', '2026-12-11'],
            extras: { dandiyaPairs: 2, dinnerDates: ['2026-12-10'], workshopDates: [] },
          },
        ],
        familyGroups: [],
        paymentMethod: 'card',
        expectedTotalCents: 100, // Tampered $1.00 instead of $52.00
      },
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRICE_CHANGED');
  });

  it('prevents overselling when 10 buyers simultaneously race for the last 2 Garba Workshop seats', async () => {
    const store = new InMemoryTransactionalStore();
    const { clock } = createMutableClock('2026-11-26T15:00:00Z');
    const app = createApp({ store, clock });

    const concurrentRequests = Array.from({ length: 10 }, (_, idx) =>
      invokeApp(app, {
        method: 'POST',
        path: '/api/bookings',
        headers: { 'Idempotency-Key': `race-${idx}-${crypto.randomUUID()}` },
        body: {
          mode: 'group',
          booker: {
            fullName: `Buyer ${idx}`,
            email: `buyer${idx}@example.com`,
            phone: `+1 469-555-10${String(idx).padStart(2, '0')}`,
            age: 35,
            isAttending: true,
          },
          attendees: [
            {
              clientId: 'a1',
              isBooker: true,
              selectedCategory: 'adult',
              fullName: `Buyer ${idx}`,
              phone: `+1 469-555-10${String(idx).padStart(2, '0')}`,
              age: 35,
              passKind: 'day_pass',
              days: ['2026-12-11'],
              extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: ['2026-12-11'] },
            },
            {
              clientId: 'a2',
              isBooker: false,
              selectedCategory: 'adult',
              fullName: `Spouse ${idx}`,
              phone: `+1 469-555-20${String(idx).padStart(2, '0')}`,
              age: 33,
              passKind: 'day_pass',
              days: ['2026-12-11'],
              extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: ['2026-12-11'] },
            },
          ],
          familyGroups: [],
          paymentMethod: 'stripe',
          expectedTotalCents: 7000,
        },
      }),
    );

    const results = await Promise.all(concurrentRequests);
    const created = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 409);

    expect(created).toHaveLength(1);
    expect(rejected).toHaveLength(9);

    const eventAfterHold = await invokeApp<EventCatalogResponseDTO>(app, {
      method: 'GET',
      path: '/api/event',
    });
    const workshopAfterHold = eventAfterHold.body.products.find(
      (p) => p.code === 'GARBA_WORKSHOP',
    );
    expect(workshopAfterHold?.availability.remaining).toBe(0);
  });

  it('restores held stock after 10-minute hold expiration and blocks late payment with 410 HOLD_EXPIRED', async () => {
    const store = new InMemoryTransactionalStore();
    const { clock, advanceMinutes } = createMutableClock('2026-11-26T15:00:00Z');
    const app = createApp({ store, clock });

    const createRes = await invokeApp<CreateBookingResponseDTO>(app, {
      method: 'POST',
      path: '/api/bookings',
      headers: { 'Idempotency-Key': `hold-exp-${crypto.randomUUID()}` },
      body: {
        mode: 'individual',
        booker: {
          fullName: 'Hold Tester',
          email: 'hold@example.com',
          phone: '+1 469-555-0190',
          age: 26,
          isAttending: true,
        },
        attendees: [
          {
            clientId: 'a1',
            isBooker: true,
            selectedCategory: 'adult',
            fullName: 'Hold Tester',
            phone: '+1 469-555-0190',
            age: 26,
            passKind: 'day_pass',
            days: ['2026-12-11'],
            extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: ['2026-12-11'] },
          },
        ],
        familyGroups: [],
        paymentMethod: 'card',
        expectedTotalCents: 3500,
      },
    });

    expect(createRes.status).toBe(201);
    const bookingId = createRes.body.bookingId;

    // Advance 11 minutes past hold expiration
    advanceMinutes(11);

    const latePayRes = await invokeApp<ApiErrorEnvelopeDTO>(app, {
      method: 'POST',
      path: `/api/bookings/${bookingId}/simulate-pay`,
      body: { outcome: 'success', method: 'card', cardLast4: '4242' },
    });

    expect(latePayRes.status).toBe(410);
    expect(latePayRes.body.error.code).toBe('HOLD_EXPIRED');

    const eventRes = await invokeApp<EventCatalogResponseDTO>(app, {
      method: 'GET',
      path: '/api/event',
    });
    const workshop = eventRes.body.products.find((p) => p.code === 'GARBA_WORKSHOP');
    expect(workshop?.availability.remaining).toBe(2);
  });

  it('handles double-click idempotency, generates Boarding Pass & Invoice PDFs, and stores simulated email with guardian details', async () => {
    const store = new InMemoryTransactionalStore();
    const { clock } = createMutableClock('2026-11-26T15:00:00Z');
    const app = createApp({ store, clock });

    const idemKey = `group-idem-${crypto.randomUUID()}`;
    const payload = {
      mode: 'group',
      booker: {
        fullName: 'Meera Nair',
        email: 'meera@example.com',
        phone: '+1 469-555-0177',
        age: 36,
        isAttending: true,
      },
      attendees: [
        {
          clientId: 'adult-1',
          isBooker: true,
          selectedCategory: 'adult',
          fullName: 'Meera Nair',
          phone: '+1 469-555-0177',
          age: 36,
          passKind: 'day_pass',
          days: ['2026-12-11'],
          extras: { dandiyaPairs: 1, dinnerDates: ['2026-12-11'], workshopDates: [] },
        },
        {
          clientId: 'child-1',
          isBooker: false,
          selectedCategory: 'child',
          fullName: 'Arjun Nair',
          age: 9,
          passKind: 'day_pass',
          days: ['2026-12-11'],
          extras: { dandiyaPairs: 1, dinnerDates: [], workshopDates: [] },
          guardian: { name: 'Meera Nair', phone: '+1 469-555-0177' },
        },
      ],
      familyGroups: [],
      paymentMethod: 'stripe',
      expectedTotalCents: 4500, // $15 + $5 + $12 + $8 + $5 = $45.00
    };

    const [firstCreate, duplicateCreate] = await Promise.all([
      invokeApp<CreateBookingResponseDTO>(app, {
        method: 'POST',
        path: '/api/bookings',
        headers: { 'Idempotency-Key': idemKey },
        body: payload,
      }),
      invokeApp<CreateBookingResponseDTO>(app, {
        method: 'POST',
        path: '/api/bookings',
        headers: { 'Idempotency-Key': idemKey },
        body: payload,
      }),
    ]);

    expect(firstCreate.status).toBe(201);
    expect(duplicateCreate.status).toBe(201);
    expect(duplicateCreate.body.bookingId).toBe(firstCreate.body.bookingId);

    const bookingId = firstCreate.body.bookingId;

    // Simulate payment twice (double-click Pay)
    const pay1 = await invokeApp<SimulatePaymentResponseDTO>(app, {
      method: 'POST',
      path: `/api/bookings/${bookingId}/simulate-pay`,
      body: { outcome: 'success', method: 'stripe', cardLast4: '4242' },
    });
    const pay2 = await invokeApp<SimulatePaymentResponseDTO>(app, {
      method: 'POST',
      path: `/api/bookings/${bookingId}/simulate-pay`,
      body: { outcome: 'success', method: 'stripe', cardLast4: '4242' },
    });

    expect(pay1.status).toBe(200);
    expect(pay2.status).toBe(200);
    expect(pay1.body.status).toBe('confirmed');

    // Verify Boarding Pass PDF & Invoice PDF streams
    const passesPdf = await invokeApp(app, {
      method: 'GET',
      path: `/api/bookings/${bookingId}/passes.pdf`,
    });
    expect(passesPdf.status).toBe(200);
    expect(String(passesPdf.headers['content-type'])).toContain('application/pdf');
    expect(passesPdf.rawBody.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    const invoicePdf = await invokeApp(app, {
      method: 'GET',
      path: `/api/bookings/${bookingId}/invoice.pdf`,
    });
    expect(invoicePdf.status).toBe(200);
    expect(String(invoicePdf.headers['content-type'])).toContain('application/pdf');
    expect(invoicePdf.rawBody.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    // Verify Simulated Email contains child Guardian details & PDF attachments
    const emailRes = await invokeApp<SimulatedEmailResponseDTO>(app, {
      method: 'GET',
      path: `/api/bookings/${bookingId}/email`,
    });
    expect(emailRes.status).toBe(200);
    expect(emailRes.body.toEmail).toBe('meera@example.com');
    expect(emailRes.body.htmlBody).toContain('Arjun Nair');
    expect(emailRes.body.htmlBody).toContain('Meera Nair');
    expect(emailRes.body.attachments).toHaveLength(2);
  });

  it('blocks booking a duplicate pass for the same individual on an overlapping festival evening across separate bookings (409 DUPLICATE_PASS_HOLDER)', async () => {
    const store = new InMemoryTransactionalStore();
    const { clock } = createMutableClock('2026-11-26T15:00:00Z');
    const app = createApp({ store, clock });

    const firstBooking = await invokeApp<CreateBookingResponseDTO>(app, {
      method: 'POST',
      path: '/api/bookings',
      headers: { 'Idempotency-Key': `dup-check-1-${crypto.randomUUID()}` },
      body: {
        mode: 'group',
        booker: {
          fullName: 'Kiran Desai',
          email: 'kiran@example.com',
          phone: '+1 469-555-0310',
          age: 37,
          isAttending: true,
        },
        attendees: [
          {
            clientId: 'a1',
            isBooker: true,
            selectedCategory: 'adult',
            fullName: 'Kiran Desai',
            phone: '+1 469-555-0310',
            age: 37,
            passKind: 'day_pass',
            days: ['2026-12-10'],
            extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: [] },
          },
          {
            clientId: 'c1',
            isBooker: false,
            selectedCategory: 'child',
            fullName: 'Neha Desai',
            age: 8,
            passKind: 'day_pass',
            days: ['2026-12-10'],
            extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: [] },
            guardian: { name: 'Kiran Desai', phone: '+1 469-555-0310' },
          },
        ],
        familyGroups: [],
        paymentMethod: 'card',
        expectedTotalCents: 2300,
      },
    });
    expect(firstBooking.status).toBe(201);

    // Same child + guardian phone on the SAME evening -> 409 DUPLICATE_PASS_HOLDER
    const duplicateChildBooking = await invokeApp<ApiErrorEnvelopeDTO>(app, {
      method: 'POST',
      path: '/api/bookings',
      headers: { 'Idempotency-Key': `dup-check-2-${crypto.randomUUID()}` },
      body: {
        mode: 'group',
        booker: {
          fullName: 'Kiran Desai',
          email: 'kiran@example.com',
          phone: '+1 469-555-0310',
          age: 37,
          isAttending: false,
        },
        attendees: [
          {
            clientId: 'c1',
            isBooker: false,
            selectedCategory: 'child',
            fullName: 'Neha Desai',
            age: 8,
            passKind: 'day_pass',
            days: ['2026-12-10'],
            extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: [] },
            guardian: { name: 'Kiran Desai', phone: '469-555-0310' },
          },
        ],
        familyGroups: [],
        paymentMethod: 'card',
        expectedTotalCents: 800,
      },
    });
    expect(duplicateChildBooking.status).toBe(409);
    expect(duplicateChildBooking.body.error.code).toBe('DUPLICATE_PASS_HOLDER');

    // Different sibling ("Rohan Desai") under the SAME guardian phone on the SAME evening -> 201 ALLOWED
    const siblingBooking = await invokeApp<CreateBookingResponseDTO>(app, {
      method: 'POST',
      path: '/api/bookings',
      headers: { 'Idempotency-Key': `dup-check-3-${crypto.randomUUID()}` },
      body: {
        mode: 'group',
        booker: {
          fullName: 'Kiran Desai',
          email: 'kiran@example.com',
          phone: '+1 469-555-0310',
          age: 37,
          isAttending: false,
        },
        attendees: [
          {
            clientId: 'c2',
            isBooker: false,
            selectedCategory: 'child',
            fullName: 'Rohan Desai',
            age: 6,
            passKind: 'day_pass',
            days: ['2026-12-10'],
            extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: [] },
            guardian: { name: 'Kiran Desai', phone: '+1 469-555-0310' },
          },
        ],
        familyGroups: [],
        paymentMethod: 'card',
        expectedTotalCents: 800,
      },
    });
    expect(siblingBooking.status).toBe(201);
  });

  it('prevents coupon abuse: limits coupon usage to 1 per booker and every attendee across bookings (even with a different code or new companions)', async () => {
    const store = new InMemoryTransactionalStore();
    const { clock } = createMutableClock('2026-11-26T15:00:00Z');
    const app = createApp({ store, clock });

    // Booking #1: Person A (+1 469-555-0401) books for 2 people [Person A, Person B (+1 469-555-0402)] on Thu Dec 10 with SEVA10 ($30 - $3 = $27)
    const booking1 = await invokeApp<CreateBookingResponseDTO>(app, {
      method: 'POST',
      path: '/api/bookings',
      headers: { 'Idempotency-Key': `coupon-abuse-1-${crypto.randomUUID()}` },
      body: {
        mode: 'group',
        booker: {
          fullName: 'Person A',
          email: 'persona@example.com',
          phone: '+1 469-555-0401',
          age: 30,
          isAttending: true,
        },
        attendees: [
          {
            clientId: 'p-a',
            isBooker: true,
            selectedCategory: 'adult',
            fullName: 'Person A',
            phone: '+1 469-555-0401',
            age: 30,
            passKind: 'day_pass',
            days: ['2026-12-10'],
            extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: [] },
          },
          {
            clientId: 'p-b',
            isBooker: false,
            selectedCategory: 'adult',
            fullName: 'Person B',
            phone: '+1 469-555-0402',
            age: 28,
            passKind: 'day_pass',
            days: ['2026-12-10'],
            extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: [] },
          },
        ],
        familyGroups: [],
        promoCode: 'SEVA10',
        paymentMethod: 'card',
        expectedTotalCents: 2700,
      },
    });
    expect(booking1.status).toBe(201);

    // Confirm payment on Booking #1
    await invokeApp<SimulatePaymentResponseDTO>(app, {
      method: 'POST',
      path: `/api/bookings/${booking1.body.bookingId}/simulate-pay`,
      body: { outcome: 'success', method: 'card', cardLast4: '4242' },
    });

    // Booking #2 attempt: Person B (previously an attendee on Booking #1!) comes back as Booker
    // for 2 new individuals [Person C, Person D] on Sat Dec 12 ($54 subtotal > $40) and tries FLAT20!
    const secondPayloadWithCoupon = {
      mode: 'group',
      booker: {
        fullName: 'Person B',
        email: 'personb@example.com',
        phone: '469-555-0402',
        age: 28,
        isAttending: false,
      },
      attendees: [
        {
          clientId: 'p-c',
          isBooker: false,
          selectedCategory: 'adult',
          fullName: 'Person C',
          phone: '+1 469-555-0403',
          age: 29,
          passKind: 'day_pass',
          days: ['2026-12-12'],
          extras: { dandiyaPairs: 0, dinnerDates: ['2026-12-12'], workshopDates: [] },
        },
        {
          clientId: 'p-d',
          isBooker: false,
          selectedCategory: 'adult',
          fullName: 'Person D',
          phone: '+1 469-555-0404',
          age: 31,
          passKind: 'day_pass',
          days: ['2026-12-12'],
          extras: { dandiyaPairs: 0, dinnerDates: ['2026-12-12'], workshopDates: [] },
        },
      ],
      familyGroups: [],
      promoCode: 'FLAT20',
    };

    // 1) /api/quote immediately flags promo as rejected with PROMO_ALREADY_USED
    const quoteRes = await invokeApp<QuoteResponseDTO>(app, {
      method: 'POST',
      path: '/api/quote',
      body: secondPayloadWithCoupon,
    });
    expect(quoteRes.status).toBe(200);
    expect(quoteRes.body.promo.status).toBe('rejected');
    expect(quoteRes.body.promo.rejectionCode).toBe('PROMO_ALREADY_USED');
    expect(quoteRes.body.totalCents).toBe(5400);

    // 2) /api/bookings strictly blocks submitting with that coupon (422 PROMO_ALREADY_USED)
    const blockedBooking = await invokeApp<ApiErrorEnvelopeDTO>(app, {
      method: 'POST',
      path: '/api/bookings',
      headers: { 'Idempotency-Key': `coupon-abuse-2-${crypto.randomUUID()}` },
      body: {
        ...secondPayloadWithCoupon,
        paymentMethod: 'card',
        expectedTotalCents: 3400,
      },
    });
    expect(blockedBooking.status).toBe(422);
    expect(blockedBooking.body.error.issues?.some((i) => i.code === 'PROMO_ALREADY_USED')).toBe(
      true,
    );

    // 3) Without a coupon, Person B CAN still book for Person C & Person D at standard price ($54.00)
    const regularPriceBooking = await invokeApp<CreateBookingResponseDTO>(app, {
      method: 'POST',
      path: '/api/bookings',
      headers: { 'Idempotency-Key': `coupon-abuse-3-${crypto.randomUUID()}` },
      body: {
        ...secondPayloadWithCoupon,
        promoCode: undefined,
        paymentMethod: 'card',
        expectedTotalCents: 5400,
      },
    });
    expect(regularPriceBooking.status).toBe(201);
  });
});
