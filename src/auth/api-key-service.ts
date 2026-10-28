import crypto from 'node:crypto';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, desc } from 'drizzle-orm';
import { apiKeys } from '../db/schema';
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../common/errors';

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  workspaceId: string;
  role: string;
  permissions: string[];
  rateLimitRpm: number;
  revoked: boolean;
  revokedAt?: Date | null;
  lastUsedAt?: Date | null;
  expiresAt?: Date | null;
  createdBy?: string | null;
  createdAt: Date;
}

export interface CreateApiKeyOptions {
  name: string;
  workspaceId?: string;
  role?: string;
  permissions?: string[];
  rateLimitRpm?: number;
  expiresInDays?: number;
  createdBy?: string;
  isTestKey?: boolean;
}

export interface IApiKeyService {
  generateKey(options: CreateApiKeyOptions): Promise<{ apiKey: ApiKeyRecord; secretKey: string }>;
  validateKey(rawKey: string, requiredPermission?: string): Promise<ApiKeyRecord>;
  listKeys(workspaceId?: string): Promise<ApiKeyRecord[]>;
  getKeyById(id: string): Promise<ApiKeyRecord | null>;
  revokeKey(id: string, revokedBy?: string): Promise<ApiKeyRecord>;
  rotateKey(id: string, rotatedBy?: string): Promise<{ apiKey: ApiKeyRecord; secretKey: string }>;
}

export function hashApiKey(secretKey: string): string {
  return crypto.createHash('sha256').update(secretKey.trim()).digest('hex');
}

export function generateRawApiKey(isTestKey = false): { secretKey: string; keyPrefix: string } {
  const prefix = isTestKey ? 'ag_test_' : 'ag_live_';
  const randomPart = crypto.randomBytes(24).toString('base64url');
  const secretKey = `${prefix}${randomPart}`;
  const keyPrefix = `${prefix}${randomPart.substring(0, 6)}...`;
  return { secretKey, keyPrefix };
}

export class PostgresApiKeyService implements IApiKeyService {
  private pool: Pool;
  private db: ReturnType<typeof drizzle>;

  constructor(connectionStringOrPool: string | Pool) {
    if (typeof connectionStringOrPool === 'string') {
      this.pool = new Pool({ connectionString: connectionStringOrPool });
    } else {
      this.pool = connectionStringOrPool;
    }
    this.db = drizzle(this.pool);
  }

  async generateKey(options: CreateApiKeyOptions): Promise<{ apiKey: ApiKeyRecord; secretKey: string }> {
    const { secretKey, keyPrefix } = generateRawApiKey(options.isTestKey);
    const keyHash = hashApiKey(secretKey);

    let expiresAt: Date | undefined;
    if (options.expiresInDays && options.expiresInDays > 0) {
      expiresAt = new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000);
    }

    const [inserted] = await this.db
      .insert(apiKeys)
      .values({
        name: options.name,
        keyPrefix,
        keyHash,
        workspaceId: options.workspaceId || 'default',
        role: options.role || 'CLIENT',
        permissions: options.permissions || ['evaluate'],
        rateLimitRpm: options.rateLimitRpm || 600,
        expiresAt,
        createdBy: options.createdBy,
      })
      .returning();

    if (!inserted) {
      throw new Error('Failed to insert API key record.');
    }

    return {
      apiKey: inserted,
      secretKey,
    };
  }

  async validateKey(rawKey: string, requiredPermission?: string): Promise<ApiKeyRecord> {
    if (!rawKey || typeof rawKey !== 'string') {
      throw new UnauthorizedError('API key is required.');
    }

    const keyHash = hashApiKey(rawKey);

    const [record] = await this.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1);

    if (!record) {
      throw new UnauthorizedError('Invalid API key.');
    }

    if (record.revoked) {
      throw new UnauthorizedError('API key has been revoked.');
    }

    if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
      throw new UnauthorizedError('API key has expired.');
    }

    if (requiredPermission && !record.permissions.includes(requiredPermission) && !record.permissions.includes('*')) {
      throw new ForbiddenError(`API key lacks required permission: '${requiredPermission}'.`);
    }

    // Update last used timestamp asynchronously
    void this.db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, record.id))
      .execute()
      .catch(() => {});

    return record;
  }

  async listKeys(workspaceId?: string): Promise<ApiKeyRecord[]> {
    const query = this.db.select().from(apiKeys);
    if (workspaceId) {
      return query.where(eq(apiKeys.workspaceId, workspaceId)).orderBy(desc(apiKeys.createdAt));
    }
    return query.orderBy(desc(apiKeys.createdAt));
  }

  async getKeyById(id: string): Promise<ApiKeyRecord | null> {
    const [record] = await this.db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
    return record || null;
  }

  async revokeKey(id: string, _revokedBy?: string): Promise<ApiKeyRecord> {
    const [updated] = await this.db
      .update(apiKeys)
      .set({
        revoked: true,
        revokedAt: new Date(),
      })
      .where(eq(apiKeys.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundError(`API key with ID '${id}' not found.`);
    }

    return updated;
  }

  async rotateKey(id: string, rotatedBy?: string): Promise<{ apiKey: ApiKeyRecord; secretKey: string }> {
    const existing = await this.getKeyById(id);
    if (!existing) {
      throw new NotFoundError(`API key with ID '${id}' not found.`);
    }

    // Revoke old key
    await this.revokeKey(id, rotatedBy);

    // Create new replacement key with identical name, workspace, role, and permissions
    return this.generateKey({
      name: existing.name,
      workspaceId: existing.workspaceId,
      role: existing.role,
      permissions: existing.permissions,
      rateLimitRpm: existing.rateLimitRpm,
      createdBy: rotatedBy || existing.createdBy || undefined,
      isTestKey: existing.keyPrefix.startsWith('ag_test_'),
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export class MemoryApiKeyService implements IApiKeyService {
  private keys: Map<string, ApiKeyRecord & { keyHash: string }> = new Map();

  async generateKey(options: CreateApiKeyOptions): Promise<{ apiKey: ApiKeyRecord; secretKey: string }> {
    const { secretKey, keyPrefix } = generateRawApiKey(options.isTestKey);
    const keyHash = hashApiKey(secretKey);

    let expiresAt: Date | null = null;
    if (options.expiresInDays && options.expiresInDays > 0) {
      expiresAt = new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000);
    }

    const id = crypto.randomUUID();
    const record: ApiKeyRecord & { keyHash: string } = {
      id,
      name: options.name,
      keyPrefix,
      keyHash,
      workspaceId: options.workspaceId || 'default',
      role: options.role || 'CLIENT',
      permissions: options.permissions || ['evaluate'],
      rateLimitRpm: options.rateLimitRpm || 600,
      revoked: false,
      revokedAt: null,
      lastUsedAt: null,
      expiresAt,
      createdBy: options.createdBy || null,
      createdAt: new Date(),
    };

    this.keys.set(id, record);

    return {
      apiKey: record,
      secretKey,
    };
  }

  async validateKey(rawKey: string, requiredPermission?: string): Promise<ApiKeyRecord> {
    if (!rawKey || typeof rawKey !== 'string') {
      throw new UnauthorizedError('API key is required.');
    }

    const keyHash = hashApiKey(rawKey);
    let found: (ApiKeyRecord & { keyHash: string }) | undefined;

    for (const record of this.keys.values()) {
      if (record.keyHash === keyHash) {
        found = record;
        break;
      }
    }

    if (!found) {
      throw new UnauthorizedError('Invalid API key.');
    }

    if (found.revoked) {
      throw new UnauthorizedError('API key has been revoked.');
    }

    if (found.expiresAt && found.expiresAt < new Date()) {
      throw new UnauthorizedError('API key has expired.');
    }

    if (requiredPermission && !found.permissions.includes(requiredPermission) && !found.permissions.includes('*')) {
      throw new ForbiddenError(`API key lacks required permission: '${requiredPermission}'.`);
    }

    found.lastUsedAt = new Date();
    return found;
  }

  async listKeys(workspaceId?: string): Promise<ApiKeyRecord[]> {
    const all = Array.from(this.keys.values()).map(({ keyHash: _, ...rest }) => rest);
    if (workspaceId) {
      return all.filter((k) => k.workspaceId === workspaceId);
    }
    return all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getKeyById(id: string): Promise<ApiKeyRecord | null> {
    const found = this.keys.get(id);
    if (!found) return null;
    const { keyHash: _, ...rest } = found;
    return rest;
  }

  async revokeKey(id: string, _revokedBy?: string): Promise<ApiKeyRecord> {
    const found = this.keys.get(id);
    if (!found) {
      throw new NotFoundError(`API key with ID '${id}' not found.`);
    }
    found.revoked = true;
    found.revokedAt = new Date();
    const { keyHash: _, ...rest } = found;
    return rest;
  }

  async rotateKey(id: string, rotatedBy?: string): Promise<{ apiKey: ApiKeyRecord; secretKey: string }> {
    const existing = await this.getKeyById(id);
    if (!existing) {
      throw new NotFoundError(`API key with ID '${id}' not found.`);
    }

    await this.revokeKey(id, rotatedBy);

    return this.generateKey({
      name: existing.name,
      workspaceId: existing.workspaceId,
      role: existing.role,
      permissions: existing.permissions,
      rateLimitRpm: existing.rateLimitRpm,
      createdBy: rotatedBy || existing.createdBy || undefined,
      isTestKey: existing.keyPrefix.startsWith('ag_test_'),
    });
  }
}
