import crypto from 'node:crypto';
import type { EventCatalogResponseDTO } from '../src/contract';
import { createApp } from '../src/server/app';
import { createClock } from '../src/server/lib/clock';
import { getDefaultStore } from '../src/server/store';
import { invokeApp } from '../tests/helpers/invoke-app';

async function main(): Promise<void> {
  const store = getDefaultStore();
  await store.resetInventoryToDefaults();

  const app = createApp({
    store,
    clock: createClock(new Date('2026-11-26T15:00:00Z')),
  });

  console.log('Firing 10 concurrent booking requests for the last 2 Garba Workshop seats...');

  const attempts = Array.from({ length: 10 }, (_, idx) =>
    invokeApp(app, {
      method: 'POST',
      path: '/api/bookings',
      headers: { 'Idempotency-Key': `race-workshop-${idx}-${crypto.randomUUID()}` },
      body: {
        mode: 'group',
        booker: {
          fullName: `Buyer ${idx + 1}`,
          email: `buyer${idx + 1}@example.com`,
          phone: '+1 469-555-0188',
          age: 32,
          isAttending: true,
        },
        attendees: [
          {
            clientId: `a-${idx}-1`,
            isBooker: true,
            selectedCategory: 'adult',
            fullName: `Buyer ${idx + 1}`,
            phone: '+1 469-555-0188',
            age: 32,
            passKind: 'day_pass',
            days: ['2026-12-11'],
            extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: ['2026-12-11'] },
          },
          {
            clientId: `a-${idx}-2`,
            isBooker: false,
            selectedCategory: 'adult',
            fullName: `Partner ${idx + 1}`,
            phone: '+1 469-555-0189',
            age: 30,
            passKind: 'day_pass',
            days: ['2026-12-11'],
            extras: { dandiyaPairs: 0, dinnerDates: [], workshopDates: ['2026-12-11'] },
          },
        ],
        familyGroups: [],
        paymentMethod: 'card',
        expectedTotalCents: 7000,
      },
    }),
  );

  const responses = await Promise.all(attempts);
  const succeeded = responses.filter((r) => r.status === 201);
  const conflicted = responses.filter((r) => r.status === 409);

  console.log(`Succeeded (201): ${succeeded.length}`);
  console.log(`Rejected Insufficient Stock (409): ${conflicted.length}`);

  const catalogRes = await invokeApp<EventCatalogResponseDTO>(app, {
    method: 'GET',
    path: '/api/event',
  });
  const workshop = catalogRes.body.products.find((p) => p.code === 'GARBA_WORKSHOP');
  console.log('Remaining Garba Workshop stock:', workshop?.availability.remaining);

  if (succeeded.length !== 1 || conflicted.length !== 9 || workshop?.availability.remaining !== 0) {
    throw new Error('Concurrency check failed!');
  }

  await store.resetInventoryToDefaults();
  console.log('Concurrency verification passed and stock restored.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
