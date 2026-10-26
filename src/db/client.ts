import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';
import * as schema from './schema';

export type AgentGuardDb = NodePgDatabase<typeof schema>;

let defaultPool: Pool | null = null;
let defaultDb: AgentGuardDb | null = null;

export function createDb(connectionStringOrConfig: string | PoolConfig | Pool): {
  db: AgentGuardDb;
  pool: Pool;
} {
  let pool: Pool;
  if (connectionStringOrConfig instanceof Pool) {
    pool = connectionStringOrConfig;
  } else if (typeof connectionStringOrConfig === 'string') {
    pool = new Pool({ connectionString: connectionStringOrConfig });
  } else {
    pool = new Pool(connectionStringOrConfig);
  }

  const db = drizzle(pool, { schema });
  return { db, pool };
}

export function getDefaultDb(connectionString?: string): AgentGuardDb {
  if (!defaultDb) {
    const url =
      connectionString ||
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:54329/agentguard_dev';
    defaultPool = new Pool({ connectionString: url });
    defaultDb = drizzle(defaultPool, { schema });
  }
  return defaultDb;
}

export async function closeDefaultDb(): Promise<void> {
  if (defaultPool) {
    await defaultPool.end();
    defaultPool = null;
    defaultDb = null;
  }
}
