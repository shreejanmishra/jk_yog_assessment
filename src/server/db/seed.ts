import { getPool } from './client';
import { runSchemaMigrations, seedDatabase } from './bootstrap';

async function main(): Promise<void> {
  const pool = getPool();
  await runSchemaMigrations(pool);
  await seedDatabase(pool, { resetStock: false });
  console.log('Database schema verified and Sharad Utsav 2026 data seeded.');
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
