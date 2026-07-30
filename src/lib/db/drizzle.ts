import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

function createDb() {
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_URL is not set');
    }
    // During build, return a placeholder — never called at build time
    return null as any;
  }
  const client = postgres(process.env.DATABASE_URL, { prepare: false });
  return drizzle(client, { schema });
}

export const db = createDb();
