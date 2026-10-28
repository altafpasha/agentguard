import { Pool } from 'pg';
import { hashPassword } from '../src/auth/crypto';

/**
 * Emergency Owner Account Creation / Recovery Utility
 * 
 * Usage:
 *   npx tsx scripts/create-owner.ts <username> <email> <password> "<Full Name>"
 * 
 * Or in Docker container:
 *   docker-compose exec agentguard npx tsx scripts/create-owner.ts admin admin@company.com "SecurePass123!" "System Administrator"
 */
async function main() {
  const args = process.argv.slice(2);

  const username = args[0] || process.env.RECOVERY_OWNER_USERNAME;
  const email = args[1] || process.env.RECOVERY_OWNER_EMAIL;
  const password = args[2] || process.env.RECOVERY_OWNER_PASSWORD;
  const name = args[3] || process.env.RECOVERY_OWNER_NAME || 'Primary System Owner';

  if (!username || !email || !password) {
    console.error('❌ Missing arguments.');
    console.error('Usage: npx tsx scripts/create-owner.ts <username> <email> <password> [name]');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('❌ Password must be at least 8 characters long.');
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:54329/agentguard_dev';
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { hash, salt } = hashPassword(password);
      const emailNorm = email.trim().toLowerCase();
      const usernameNorm = username.trim();

      // Check if user already exists
      const existing = await client.query(
        'SELECT id, role FROM reviewers WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)',
        [usernameNorm, emailNorm]
      );

      if (existing.rows.length > 0) {
        // Upgrade existing user to active owner and reset password
        const userId = existing.rows[0].id;
        await client.query(
          `UPDATE reviewers
           SET password_hash = $1, salt = $2, role = 'OWNER', status = 'ACTIVE', name = $3
           WHERE id = $4`,
          [hash, salt, name, userId]
        );
        console.log(`✅ Existing account upgraded/reset to OWNER for user '${usernameNorm}'.`);
      } else {
        // Insert new owner
        await client.query(
          `INSERT INTO reviewers (username, email, password_hash, salt, role, name, status, last_login_at)
           VALUES ($1, $2, $3, $4, 'OWNER', $5, 'ACTIVE', NOW())`,
          [usernameNorm, emailNorm, hash, salt, name]
        );
        console.log(`✅ Successfully created primary OWNER account for '${usernameNorm}' (${emailNorm}).`);
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

main().catch((err) => {
  console.error('❌ Emergency owner recovery failed:', err.message);
  process.exit(1);
});
