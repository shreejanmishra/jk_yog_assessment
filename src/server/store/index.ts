import { getPool, hasDatabaseUrl } from '../db/client';
import { InMemoryTransactionalStore } from './memory-store';
import { PostgresDataStore } from './postgres-store';
import type { BookingDataStore } from './types';

let singletonStore: BookingDataStore | null = null;

export function getDefaultStore(): BookingDataStore {
  if (!singletonStore) {
    if (hasDatabaseUrl() || process.env.VERCEL === '1') {
      singletonStore = new PostgresDataStore(getPool());
    } else {
      console.warn(
        '[store] DATABASE_URL not configured — running with InMemoryTransactionalStore for local development.',
      );
      singletonStore = new InMemoryTransactionalStore();
    }
  }
  return singletonStore;
}
