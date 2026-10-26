import { Pool } from 'pg';
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashSessionToken,
} from './crypto';
import { UnauthorizedError } from '../common/errors';

export interface ReviewerProfile {
  id: string;
  username: string;
  role: string;
  name: string;
}

export interface LoginResult {
  sessionToken: string;
  reviewer: ReviewerProfile;
  expiresAt: string;
}

export interface IReviewerAuthService {
  seedReviewer(username: string, password: string, name?: string, role?: string): Promise<ReviewerProfile>;
  login(username: string, password: string): Promise<LoginResult>;
  validateSession(sessionToken: string): Promise<ReviewerProfile>;
  logout(sessionToken: string): Promise<boolean>;
}

/**
 * In-Memory Reviewer Auth Store for testing and isolated harnesses
 */
export class MemoryReviewerAuthService implements IReviewerAuthService {
  private reviewers = new Map<string, { id: string; username: string; passwordHash: string; salt: string; role: string; name: string }>();
  private sessions = new Map<string, { id: string; tokenHash: string; reviewer: ReviewerProfile; expiresAt: number; revoked: boolean }>();
  private sessionTtlMs: number;

  constructor(sessionTtlSeconds: number = 8 * 3600) {
    this.sessionTtlMs = sessionTtlSeconds * 1000;
  }

  public async seedReviewer(
    username: string,
    password: string,
    name: string = 'Security Reviewer',
    role: string = 'REVIEWER'
  ): Promise<ReviewerProfile> {
    const existing = this.reviewers.get(username);
    if (existing) {
      return { id: existing.id, username: existing.username, role: existing.role, name: existing.name };
    }

    const { hash, salt } = hashPassword(password);
    const id = `rev_${Math.random().toString(36).substring(2, 10)}`;
    const record = { id, username, passwordHash: hash, salt, role, name };
    this.reviewers.set(username, record);
    return { id, username, role, name };
  }

  public async login(username: string, password: string): Promise<LoginResult> {
    const reviewer = this.reviewers.get(username);
    if (!reviewer) {
      throw new UnauthorizedError('Invalid reviewer credentials.');
    }

    const isValid = verifyPassword(password, reviewer.passwordHash, reviewer.salt);
    if (!isValid) {
      throw new UnauthorizedError('Invalid reviewer credentials.');
    }

    const sessionToken = generateSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    const expiresAt = Date.now() + this.sessionTtlMs;

    this.sessions.set(tokenHash, {
      id: `sess_${Math.random().toString(36).substring(2, 10)}`,
      tokenHash,
      reviewer: { id: reviewer.id, username: reviewer.username, role: reviewer.role, name: reviewer.name },
      expiresAt,
      revoked: false,
    });

    return {
      sessionToken,
      reviewer: { id: reviewer.id, username: reviewer.username, role: reviewer.role, name: reviewer.name },
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  public async validateSession(sessionToken: string): Promise<ReviewerProfile> {
    if (!sessionToken || sessionToken.trim().length === 0) {
      throw new UnauthorizedError('Missing reviewer session token.');
    }

    const tokenHash = hashSessionToken(sessionToken);
    const session = this.sessions.get(tokenHash);

    if (!session || session.revoked) {
      throw new UnauthorizedError('Invalid or revoked reviewer session.');
    }

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(tokenHash);
      throw new UnauthorizedError('Reviewer session has expired.');
    }

    return session.reviewer;
  }

  public async logout(sessionToken: string): Promise<boolean> {
    const tokenHash = hashSessionToken(sessionToken);
    const session = this.sessions.get(tokenHash);
    if (session) {
      session.revoked = true;
      return true;
    }
    return false;
  }
}

/**
 * PostgreSQL Reviewer Auth Store using durable state
 */
export class PostgresReviewerAuthService implements IReviewerAuthService {
  private pool: Pool;
  private sessionTtlSeconds: number;

  constructor(poolOrUrl: Pool | string, sessionTtlSeconds: number = 8 * 3600) {
    if (typeof poolOrUrl === 'string') {
      this.pool = new Pool({ connectionString: poolOrUrl });
    } else {
      this.pool = poolOrUrl;
    }
    this.sessionTtlSeconds = sessionTtlSeconds;
  }

  public async seedReviewer(
    username: string,
    password: string,
    name: string = 'Security Reviewer',
    role: string = 'REVIEWER'
  ): Promise<ReviewerProfile> {
    const { rows } = await this.pool.query(
      'SELECT id, username, role, name FROM reviewers WHERE username = $1',
      [username]
    );

    if (rows.length > 0) {
      const r = rows[0];
      return { id: r.id, username: r.username, role: r.role, name: r.name };
    }

    const { hash, salt } = hashPassword(password);
    const insertRes = await this.pool.query(
      `INSERT INTO reviewers (username, password_hash, salt, role, name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, role, name`,
      [username, hash, salt, role, name]
    );

    const r = insertRes.rows[0];
    return { id: r.id, username: r.username, role: r.role, name: r.name };
  }

  public async login(username: string, password: string): Promise<LoginResult> {
    const { rows } = await this.pool.query(
      'SELECT id, username, password_hash, salt, role, name FROM reviewers WHERE username = $1',
      [username]
    );

    if (rows.length === 0) {
      throw new UnauthorizedError('Invalid reviewer credentials.');
    }

    const reviewer = rows[0];
    const isValid = verifyPassword(password, reviewer.password_hash, reviewer.salt);
    if (!isValid) {
      throw new UnauthorizedError('Invalid reviewer credentials.');
    }

    const sessionToken = generateSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    const expiresAt = new Date(Date.now() + this.sessionTtlSeconds * 1000);

    await this.pool.query(
      `INSERT INTO reviewer_sessions (session_token_hash, reviewer_id, reviewer_username, reviewer_role, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [tokenHash, reviewer.id, reviewer.username, reviewer.role, expiresAt.toISOString()]
    );

    return {
      sessionToken,
      reviewer: { id: reviewer.id, username: reviewer.username, role: reviewer.role, name: reviewer.name },
      expiresAt: expiresAt.toISOString(),
    };
  }

  public async validateSession(sessionToken: string): Promise<ReviewerProfile> {
    if (!sessionToken || sessionToken.trim().length === 0) {
      throw new UnauthorizedError('Missing reviewer session token.');
    }

    const tokenHash = hashSessionToken(sessionToken);
    const { rows } = await this.pool.query(
      `SELECT r.id, r.username, r.role, r.name, s.expires_at, s.revoked
       FROM reviewer_sessions s
       JOIN reviewers r ON s.reviewer_id = r.id
       WHERE s.session_token_hash = $1`,
      [tokenHash]
    );

    if (rows.length === 0) {
      throw new UnauthorizedError('Invalid or expired reviewer session.');
    }

    const s = rows[0];
    if (s.revoked) {
      throw new UnauthorizedError('Reviewer session has been revoked.');
    }

    const expiresAt = new Date(s.expires_at).getTime();
    if (Date.now() > expiresAt) {
      throw new UnauthorizedError('Reviewer session has expired.');
    }

    return { id: s.id, username: s.username, role: s.role, name: s.name };
  }

  public async logout(sessionToken: string): Promise<boolean> {
    if (!sessionToken) return false;
    const tokenHash = hashSessionToken(sessionToken);
    const { rowCount } = await this.pool.query(
      'UPDATE reviewer_sessions SET revoked = TRUE WHERE session_token_hash = $1',
      [tokenHash]
    );
    return (rowCount ?? 0) > 0;
  }
}
