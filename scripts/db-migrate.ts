import { getPool } from '../src/server/db/client';
import { runSchemaMigrations } from '../src/server/db/bootstrap';

async function main(): Promise<void> {
  const pool = getPool();
  await runSchemaMigrations(pool);
  console.log('PostgreSQL schema migrations applied successfully.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
