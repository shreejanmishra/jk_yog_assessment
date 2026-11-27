import { getPool } from '../src/server/db/client';
import { runSchemaMigrations, seedDatabase } from '../src/server/db/bootstrap';

async function main(): Promise<void> {
  const pool = getPool();
  await runSchemaMigrations(pool);
  await pool.query(
    `UPDATE bookings SET status = 'expired' WHERE status = 'pending_payment'`,
  );
  await seedDatabase(pool, { resetStock: true });
  console.log('Inventory and promo code counts reset to initial Sharad Utsav 2026 values.');
  await pool.end();
}

main().catch((err) => {
  console.error('Stock reset failed:', err);
  process.exit(1);
});
