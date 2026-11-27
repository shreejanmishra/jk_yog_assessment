import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  ApiErrorEnvelopeDTO,
  CreateBookingResponseDTO,
  EventCatalogResponseDTO,
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
            phone: '+1 469-555-0155',
            age: 35,
            isAttending: true,
          },
          attendees: [
            {
              clientId: 'a1',
              isBooker: true,
              selectedCategory: 'adult',
              fullName: `Buyer ${idx}`,
              phone: '+1 469-555-0155',
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
              phone: '+1 469-555-0156',
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
});
