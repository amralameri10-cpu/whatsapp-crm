import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

function createDb() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '❌ DATABASE_URL غير موجود في متغيرات البيئة. ' +
        'أضفه في EasyPanel → Service → Environment Variables'
      );
    }
    // During build without DB, return placeholder
    return null as any;
  }

  try {
    const client = postgres(url, {
      prepare: false,
      connect_timeout: 10,
      idle_timeout: 30,
      max_lifetime: 1800,
    });
    return drizzle(client, { schema });
  } catch (err: any) {
    throw new Error(`❌ فشل الاتصال بقاعدة البيانات: ${err?.message || err}`);
  }
}

export const db = createDb();
