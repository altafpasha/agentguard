import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

export async function runMigrations(
  databaseUrl: string = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:54329/agentguard_dev'
): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

      // Create drizzle migrations tracking table if not exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
          id SERIAL PRIMARY KEY,
          hash TEXT NOT NULL,
          created_at BIGINT
        )
      `);

      // Read migration files from drizzle/ directory
      const migrationsDir = path.resolve(__dirname, '../../drizzle');
      if (fs.existsSync(migrationsDir)) {
        const files = fs
          .readdirSync(migrationsDir)
          .filter((f) => f.endsWith('.sql'))
          .sort();

        for (const file of files) {
          const filePath = path.join(migrationsDir, file);
          const sqlContent = fs.readFileSync(filePath, 'utf-8');

          // Check if already applied
          const { rows } = await client.query(
            'SELECT id FROM "__drizzle_migrations" WHERE hash = $1',
            [file]
          );

          if (rows.length === 0) {
            // Split by statement-breakpoint if present
            const statements = sqlContent
              .split('--> statement-breakpoint')
              .map((s) => s.trim())
              .filter((s) => s.length > 0);

            for (const statement of statements) {
              await client.query(statement);
            }

            await client.query(
              'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
              [file, Date.now()]
            );
          }
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

// Allow direct CLI execution: tsx src/db/migrate.ts
if (require.main === module || (typeof process !== 'undefined' && process.argv[1]?.includes('migrate.ts'))) {
  runMigrations()
    .then(() => {
      console.log('✅ Drizzle migrations applied successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    });
}
