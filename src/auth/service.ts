import { Pool } from 'pg';
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashSessionToken,
  generateInviteToken,
  hashInviteToken,
  validatePasswordStrength,
} from './crypto';
import {
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  NotFoundError,
  ConflictError,
} from '../common/errors';

export type UserRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER' | 'ANALYST';
export type UserStatus = 'ACTIVE' | 'INACTIVE';

export interface ReviewerProfile {
  id: string;
  username: string;
  email?: string | null;
  role: string;
  name: string;
  status: string;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export interface LoginResult {
  sessionToken: string;
  reviewer: ReviewerProfile;
  expiresAt: string;
}

export interface UserInviteResult {
  inviteId: string;
  inviteToken: string;
  email: string;
  role: string;
  expiresAt: string;
}

export interface AuthSettings {
  allowPublicSignup: boolean;
  defaultUserRole: 'VIEWER' | 'EDITOR';
  requireEmailVerification: boolean;
  inviteOnly: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface InvitationRecord {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  usedAt?: string | null;
  revoked: boolean;
  revokedAt?: string | null;
  createdBy?: string | null;
  createdAt: string;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
}

export function normalizeRole(role: string): 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER' {
  const upper = (role || '').toUpperCase();
  if (upper === 'OWNER') return 'OWNER';
  if (upper === 'ADMIN' || upper === 'SECURITY_ADMIN') return 'ADMIN';
  if (upper === 'EDITOR' || upper === 'ANALYST') return 'EDITOR';
  return 'VIEWER';
}

const ROLE_RANK: Record<'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER', number> = {
  OWNER: 40,
  ADMIN: 30,
  EDITOR: 20,
  VIEWER: 10,
};

export function hasRolePermission(userRole: string, requiredRole: string): boolean {
  const normUser = normalizeRole(userRole);
  const normReq = normalizeRole(requiredRole);
  return ROLE_RANK[normUser] >= ROLE_RANK[normReq];
}

export interface IReviewerAuthService {
  isSetupRequired(): Promise<boolean>;
  setupOwner(data: { username: string; email: string; password: string; name: string }): Promise<LoginResult>;
  seedReviewer(username: string, password: string, name?: string, role?: string): Promise<ReviewerProfile>;
  login(usernameOrEmail: string, password: string): Promise<LoginResult>;
  validateSession(sessionToken: string): Promise<ReviewerProfile>;
  logout(sessionToken: string): Promise<boolean>;
  listUsers(): Promise<ReviewerProfile[]>;
  inviteUser(data: { email: string; role: 'ADMIN' | 'EDITOR' | 'VIEWER' | 'ANALYST'; createdBy: string; ttlHours?: number }): Promise<UserInviteResult>;
  acceptInvite(data: { inviteToken: string; username: string; password: string; name: string }): Promise<LoginResult>;
  listInvitations(): Promise<InvitationRecord[]>;
  revokeInvitation(inviteId: string, actor: ReviewerProfile): Promise<boolean>;
  updateUserStatus(targetUserId: string, status: 'ACTIVE' | 'INACTIVE', actor: ReviewerProfile): Promise<ReviewerProfile>;
  updateUserRole(targetUserId: string, newRole: UserRole, actor: ReviewerProfile): Promise<ReviewerProfile>;
  deleteUser(targetUserId: string, actor: ReviewerProfile): Promise<boolean>;
  revokeUserSessions(userId: string): Promise<number>;
  getAuthSettings(): Promise<AuthSettings>;
  updateAuthSettings(settings: Partial<AuthSettings>, actor: ReviewerProfile): Promise<AuthSettings>;
  registerPublicUser(data: { username: string; email: string; password: string; name: string }): Promise<LoginResult>;
  changePassword(userId: string, oldPass: string, newPass: string): Promise<LoginResult>;
  resetUserPassword(userId: string, tempPassword: string, actor: ReviewerProfile): Promise<boolean>;
}

/**
 * In-Memory Reviewer Auth Store for testing and isolated test harnesses
 */
export class MemoryReviewerAuthService implements IReviewerAuthService {
  private reviewers = new Map<
    string,
    {
      id: string;
      username: string;
      email?: string | null;
      passwordHash: string;
      salt: string;
      role: string;
      name: string;
      status: string;
      lastLoginAt?: string | null;
      createdAt: string;
    }
  >();

  private sessions = new Map<
    string,
    {
      id: string;
      tokenHash: string;
      reviewer: ReviewerProfile;
      expiresAt: number;
      revoked: boolean;
    }
  >();

  private invitations = new Map<
    string,
    {
      id: string;
      email: string;
      role: string;
      tokenHash: string;
      expiresAt: number;
      usedAt?: number | null;
      revoked: boolean;
      revokedAt?: string | null;
      createdBy: string;
      createdAt: string;
    }
  >();

  private authSettings: AuthSettings = {
    allowPublicSignup: false,
    defaultUserRole: 'VIEWER',
    requireEmailVerification: false,
    inviteOnly: true,
    updatedAt: new Date().toISOString(),
  };

  private sessionTtlMs: number;

  constructor(sessionTtlSeconds: number = 8 * 3600) {
    this.sessionTtlMs = sessionTtlSeconds * 1000;
  }

  public async isSetupRequired(): Promise<boolean> {
    for (const r of this.reviewers.values()) {
      if (normalizeRole(r.role) === 'OWNER') {
        return false;
      }
    }
    return true;
  }

  public async setupOwner(data: { username: string; email: string; password: string; name: string }): Promise<LoginResult> {
    const isRequired = await this.isSetupRequired();
    if (!isRequired) {
      throw new ForbiddenError('Initial setup has already been completed. An owner already exists.');
    }

    if (!data.username || data.username.trim().length < 3) {
      throw new ValidationError('Username must be at least 3 characters.');
    }

    const strength = validatePasswordStrength(data.password);
    if (!strength.valid) {
      throw new ValidationError(strength.message || 'Password must meet complexity requirements.');
    }

    const { hash, salt } = hashPassword(data.password);
    const id = `usr_${Math.random().toString(36).substring(2, 10)}`;
    const now = new Date().toISOString();

    const record = {
      id,
      username: data.username.trim(),
      email: data.email.trim().toLowerCase(),
      passwordHash: hash,
      salt,
      role: 'OWNER',
      name: data.name.trim() || 'System Owner',
      status: 'ACTIVE',
      lastLoginAt: now,
      createdAt: now,
    };

    this.reviewers.set(record.username.toLowerCase(), record);

    const sessionToken = generateSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    const expiresAt = Date.now() + this.sessionTtlMs;

    const profile: ReviewerProfile = {
      id: record.id,
      username: record.username,
      email: record.email,
      role: record.role,
      name: record.name,
      status: record.status,
      lastLoginAt: record.lastLoginAt,
      createdAt: record.createdAt,
    };

    this.sessions.set(tokenHash, {
      id: `sess_${Math.random().toString(36).substring(2, 10)}`,
      tokenHash,
      reviewer: profile,
      expiresAt,
      revoked: false,
    });

    return {
      sessionToken,
      reviewer: profile,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  public async seedReviewer(
    username: string,
    password: string,
    name: string = 'Security Reviewer',
    role: string = 'REVIEWER'
  ): Promise<ReviewerProfile> {
    const existing = this.reviewers.get(username.toLowerCase());
    if (existing) {
      return {
        id: existing.id,
        username: existing.username,
        email: existing.email,
        role: existing.role,
        name: existing.name,
        status: existing.status,
        lastLoginAt: existing.lastLoginAt,
        createdAt: existing.createdAt,
      };
    }

    const { hash, salt } = hashPassword(password);
    const id = `rev_${Math.random().toString(36).substring(2, 10)}`;
    const now = new Date().toISOString();
    const record = {
      id,
      username,
      email: `${username}@agentguard.internal`,
      passwordHash: hash,
      salt,
      role,
      name,
      status: 'ACTIVE',
      lastLoginAt: null,
      createdAt: now,
    };
    this.reviewers.set(username.toLowerCase(), record);
    return {
      id,
      username,
      email: record.email,
      role,
      name,
      status: record.status,
      lastLoginAt: null,
      createdAt: now,
    };
  }

  public async login(usernameOrEmail: string, password: string): Promise<LoginResult> {
    const query = usernameOrEmail.trim().toLowerCase();
    let reviewer = this.reviewers.get(query);

    if (!reviewer) {
      for (const r of this.reviewers.values()) {
        if (r.email?.toLowerCase() === query) {
          reviewer = r;
          break;
        }
      }
    }

    if (!reviewer) {
      throw new UnauthorizedError('Invalid reviewer credentials.');
    }

    if (reviewer.status !== 'ACTIVE') {
      throw new ForbiddenError('Account has been deactivated. Please contact an administrator.');
    }

    const isValid = verifyPassword(password, reviewer.passwordHash, reviewer.salt);
    if (!isValid) {
      throw new UnauthorizedError('Invalid reviewer credentials.');
    }

    const sessionToken = generateSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    const expiresAt = Date.now() + this.sessionTtlMs;
    const nowIso = new Date().toISOString();
    reviewer.lastLoginAt = nowIso;

    const profile: ReviewerProfile = {
      id: reviewer.id,
      username: reviewer.username,
      email: reviewer.email,
      role: reviewer.role,
      name: reviewer.name,
      status: reviewer.status,
      lastLoginAt: nowIso,
      createdAt: reviewer.createdAt,
    };

    this.sessions.set(tokenHash, {
      id: `sess_${Math.random().toString(36).substring(2, 10)}`,
      tokenHash,
      reviewer: profile,
      expiresAt,
      revoked: false,
    });

    return {
      sessionToken,
      reviewer: profile,
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

    const currentReviewer = Array.from(this.reviewers.values()).find((r) => r.id === session.reviewer.id);
    if (!currentReviewer || currentReviewer.status !== 'ACTIVE') {
      session.revoked = true;
      throw new UnauthorizedError('Account is deactivated or no longer exists.');
    }

    return {
      ...session.reviewer,
      role: currentReviewer.role,
      status: currentReviewer.status,
    };
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

  public async listUsers(): Promise<ReviewerProfile[]> {
    return Array.from(this.reviewers.values()).map((r) => ({
      id: r.id,
      username: r.username,
      email: r.email,
      role: r.role,
      name: r.name,
      status: r.status,
      lastLoginAt: r.lastLoginAt,
      createdAt: r.createdAt,
    }));
  }

  public async inviteUser(data: {
    email: string;
    role: 'ADMIN' | 'ANALYST';
    createdBy: string;
    ttlHours?: number;
  }): Promise<UserInviteResult> {
    const emailNorm = data.email.trim().toLowerCase();
    for (const r of this.reviewers.values()) {
      if (r.email?.toLowerCase() === emailNorm) {
        throw new ConflictError(`User with email ${data.email} already exists.`);
      }
    }

    const inviteToken = generateInviteToken();
    const tokenHash = hashInviteToken(inviteToken);
    const ttlMs = (data.ttlHours ?? 48) * 3600 * 1000;
    const expiresAt = Date.now() + ttlMs;
    const inviteId = `inv_${Math.random().toString(36).substring(2, 10)}`;

    this.invitations.set(tokenHash, {
      id: inviteId,
      email: emailNorm,
      role: data.role,
      tokenHash,
      expiresAt,
      usedAt: null,
      revoked: false,
      revokedAt: null,
      createdBy: data.createdBy,
      createdAt: new Date().toISOString(),
    });

    return {
      inviteId,
      inviteToken,
      email: emailNorm,
      role: data.role,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  public async acceptInvite(data: {
    inviteToken: string;
    username: string;
    password: string;
    name: string;
  }): Promise<LoginResult> {
    const tokenHash = hashInviteToken(data.inviteToken.trim());
    const invite = this.invitations.get(tokenHash);

    if (!invite || invite.usedAt || Date.now() > invite.expiresAt) {
      throw new ValidationError('Invalid, expired, or already used invitation token.');
    }

    if (invite.revoked) {
      throw new ValidationError('This invitation has been revoked by an administrator.');
    }

    const usernameNorm = data.username.trim().toLowerCase();
    if (this.reviewers.has(usernameNorm)) {
      throw new ConflictError(`Username '${data.username}' is already in use.`);
    }

    const strength = validatePasswordStrength(data.password);
    if (!strength.valid) {
      throw new ValidationError(strength.message || 'Password must meet complexity requirements.');
    }

    const { hash, salt } = hashPassword(data.password);
    const id = `usr_${Math.random().toString(36).substring(2, 10)}`;
    const now = new Date().toISOString();

    const record = {
      id,
      username: data.username.trim(),
      email: invite.email,
      passwordHash: hash,
      salt,
      role: invite.role,
      name: data.name.trim() || data.username.trim(),
      status: 'ACTIVE',
      lastLoginAt: now,
      createdAt: now,
    };

    this.reviewers.set(usernameNorm, record);
    invite.usedAt = Date.now();

    const sessionToken = generateSessionToken();
    const sTokenHash = hashSessionToken(sessionToken);
    const expiresAt = Date.now() + this.sessionTtlMs;

    const profile: ReviewerProfile = {
      id: record.id,
      username: record.username,
      email: record.email,
      role: record.role,
      name: record.name,
      status: record.status,
      lastLoginAt: now,
      createdAt: now,
    };

    this.sessions.set(sTokenHash, {
      id: `sess_${Math.random().toString(36).substring(2, 10)}`,
      tokenHash: sTokenHash,
      reviewer: profile,
      expiresAt,
      revoked: false,
    });

    return {
      sessionToken,
      reviewer: profile,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  public async listInvitations(): Promise<InvitationRecord[]> {
    const list: InvitationRecord[] = [];
    for (const inv of this.invitations.values()) {
      let status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED' = 'PENDING';
      if (inv.revoked) {
        status = 'REVOKED';
      } else if (inv.usedAt) {
        status = 'ACCEPTED';
      } else if (Date.now() > inv.expiresAt) {
        status = 'EXPIRED';
      }

      list.push({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        expiresAt: new Date(inv.expiresAt).toISOString(),
        usedAt: inv.usedAt ? new Date(inv.usedAt).toISOString() : null,
        revoked: Boolean(inv.revoked),
        revokedAt: inv.revokedAt ?? null,
        createdBy: inv.createdBy,
        createdAt: inv.createdAt,
        status,
      });
    }

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async revokeInvitation(inviteId: string, actor: ReviewerProfile): Promise<boolean> {
    if (!hasRolePermission(actor.role, 'ADMIN')) {
      throw new ForbiddenError('Only an administrator or owner can revoke invitations.');
    }

    const found = Array.from(this.invitations.values()).find((inv) => inv.id === inviteId);

    if (!found) {
      throw new NotFoundError('Invitation not found.');
    }

    if (found.usedAt) {
      throw new ValidationError('Cannot revoke an invitation that has already been accepted.');
    }

    found.revoked = true;
    found.revokedAt = new Date().toISOString();
    return true;
  }

  public async deleteUser(targetUserId: string, actor: ReviewerProfile): Promise<boolean> {
    if (!hasRolePermission(actor.role, 'ADMIN')) {
      throw new ForbiddenError('Only an administrator or owner can remove users.');
    }

    if (actor.id === targetUserId) {
      throw new ForbiddenError('Cannot delete your own account.');
    }

    let targetKey: string | null = null;
    let targetUser: ReturnType<typeof this.reviewers.get> = undefined;
    for (const [key, r] of this.reviewers.entries()) {
      if (r.id === targetUserId) {
        targetKey = key;
        targetUser = r;
        break;
      }
    }

    if (!targetUser || !targetKey) {
      throw new NotFoundError('User not found.');
    }

    if (normalizeRole(targetUser.role) === 'OWNER') {
      if (normalizeRole(actor.role) !== 'OWNER') {
        throw new ForbiddenError('Only an owner can delete an owner account.');
      }
      const activeOwners = Array.from(this.reviewers.values()).filter(
        (r) => normalizeRole(r.role) === 'OWNER' && r.status === 'ACTIVE' && r.id !== targetUserId
      );
      if (activeOwners.length === 0) {
        throw new ForbiddenError('Cannot delete the last remaining owner account.');
      }
    }

    this.reviewers.delete(targetKey);
    await this.revokeUserSessions(targetUserId);
    return true;
  }

  public async getAuthSettings(): Promise<AuthSettings> {
    return { ...this.authSettings };
  }

  public async updateAuthSettings(
    settings: Partial<AuthSettings>,
    actor: ReviewerProfile
  ): Promise<AuthSettings> {
    if (!hasRolePermission(actor.role, 'ADMIN')) {
      throw new ForbiddenError('Only an administrator or owner can change authentication settings.');
    }

    if (settings.allowPublicSignup !== undefined) {
      this.authSettings.allowPublicSignup = Boolean(settings.allowPublicSignup);
    }
    if (settings.defaultUserRole !== undefined) {
      this.authSettings.defaultUserRole = settings.defaultUserRole === 'EDITOR' ? 'EDITOR' : 'VIEWER';
    }
    if (settings.requireEmailVerification !== undefined) {
      this.authSettings.requireEmailVerification = Boolean(settings.requireEmailVerification);
    }
    if (settings.inviteOnly !== undefined) {
      this.authSettings.inviteOnly = Boolean(settings.inviteOnly);
    }
    this.authSettings.updatedAt = new Date().toISOString();
    this.authSettings.updatedBy = actor.username;

    return { ...this.authSettings };
  }

  public async registerPublicUser(data: {
    username: string;
    email: string;
    password: string;
    name: string;
  }): Promise<LoginResult> {
    if (!this.authSettings.allowPublicSignup) {
      throw new ForbiddenError('Public registration is currently disabled. An invitation is required to create an account.');
    }

    if (!data.username || data.username.trim().length < 3) {
      throw new ValidationError('Username must be at least 3 characters.');
    }

    const strength = validatePasswordStrength(data.password);
    if (!strength.valid) {
      throw new ValidationError(strength.message || 'Password must meet complexity requirements.');
    }

    const usernameNorm = data.username.trim().toLowerCase();
    const emailNorm = data.email.trim().toLowerCase();

    if (this.reviewers.has(usernameNorm)) {
      throw new ConflictError(`Username '${data.username}' is already in use.`);
    }

    for (const r of this.reviewers.values()) {
      if (r.email?.toLowerCase() === emailNorm) {
        throw new ConflictError(`Email '${data.email}' is already registered.`);
      }
    }

    const { hash, salt } = hashPassword(data.password);
    const id = `usr_${Math.random().toString(36).substring(2, 10)}`;
    const now = new Date().toISOString();
    const assignedRole = this.authSettings.defaultUserRole || 'VIEWER';

    const record = {
      id,
      username: data.username.trim(),
      email: emailNorm,
      passwordHash: hash,
      salt,
      role: assignedRole,
      name: data.name.trim() || data.username.trim(),
      status: 'ACTIVE',
      lastLoginAt: now,
      createdAt: now,
    };

    this.reviewers.set(usernameNorm, record);

    const sessionToken = generateSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    const expiresAt = Date.now() + this.sessionTtlMs;

    const profile: ReviewerProfile = {
      id: record.id,
      username: record.username,
      email: record.email,
      role: record.role,
      name: record.name,
      status: record.status,
      lastLoginAt: now,
      createdAt: now,
    };

    this.sessions.set(tokenHash, {
      id: `sess_${Math.random().toString(36).substring(2, 10)}`,
      tokenHash,
      reviewer: profile,
      expiresAt,
      revoked: false,
    });

    return {
      sessionToken,
      reviewer: profile,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  public async changePassword(
    userId: string,
    oldPass: string,
    newPass: string
  ): Promise<LoginResult> {
    const target = Array.from(this.reviewers.values()).find((r) => r.id === userId);
    if (!target) {
      throw new NotFoundError('User not found.');
    }

    const isValid = verifyPassword(oldPass, target.passwordHash, target.salt);
    if (!isValid) {
      throw new UnauthorizedError('Current password is incorrect.');
    }

    const strength = validatePasswordStrength(newPass);
    if (!strength.valid) {
      throw new ValidationError(strength.message || 'New password does not meet complexity requirements.');
    }

    const { hash, salt } = hashPassword(newPass);
    target.passwordHash = hash;
    target.salt = salt;

    await this.revokeUserSessions(userId);

    const sessionToken = generateSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    const expiresAt = Date.now() + this.sessionTtlMs;

    const profile: ReviewerProfile = {
      id: target.id,
      username: target.username,
      email: target.email,
      role: target.role,
      name: target.name,
      status: target.status,
      lastLoginAt: target.lastLoginAt,
      createdAt: target.createdAt,
    };

    this.sessions.set(tokenHash, {
      id: `sess_${Math.random().toString(36).substring(2, 10)}`,
      tokenHash,
      reviewer: profile,
      expiresAt,
      revoked: false,
    });

    return {
      sessionToken,
      reviewer: profile,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  public async resetUserPassword(
    userId: string,
    tempPassword: string,
    actor: ReviewerProfile
  ): Promise<boolean> {
    if (!hasRolePermission(actor.role, 'ADMIN')) {
      throw new ForbiddenError('Only an administrator or owner can reset user passwords.');
    }

    const target = Array.from(this.reviewers.values()).find((r) => r.id === userId);
    if (!target) {
      throw new NotFoundError('User not found.');
    }

    if (normalizeRole(target.role) === 'OWNER' && normalizeRole(actor.role) !== 'OWNER') {
      throw new ForbiddenError('Only an owner can reset the password of an owner account.');
    }

    const strength = validatePasswordStrength(tempPassword);
    if (!strength.valid) {
      throw new ValidationError(strength.message || 'Password does not meet complexity requirements.');
    }

    const { hash, salt } = hashPassword(tempPassword);
    target.passwordHash = hash;
    target.salt = salt;

    await this.revokeUserSessions(userId);
    return true;
  }

  public async updateUserStatus(
    targetUserId: string,
    status: 'ACTIVE' | 'INACTIVE',
    actor: ReviewerProfile
  ): Promise<ReviewerProfile> {
    const target = Array.from(this.reviewers.values()).find((r) => r.id === targetUserId);
    if (!target) {
      throw new NotFoundError('User not found.');
    }

    if (status === 'INACTIVE' && normalizeRole(target.role) === 'OWNER') {
      const activeOwners = Array.from(this.reviewers.values()).filter(
        (r) => normalizeRole(r.role) === 'OWNER' && r.status === 'ACTIVE'
      );
      if (activeOwners.length <= 1) {
        throw new ForbiddenError('Cannot deactivate the last remaining owner account.');
      }
    }

    if (normalizeRole(target.role) === 'OWNER' && normalizeRole(actor.role) !== 'OWNER') {
      throw new ForbiddenError('Only an owner can modify an owner account.');
    }

    target.status = status;

    if (status === 'INACTIVE') {
      await this.revokeUserSessions(targetUserId);
    }

    return {
      id: target.id,
      username: target.username,
      email: target.email,
      role: target.role,
      name: target.name,
      status: target.status,
      lastLoginAt: target.lastLoginAt,
      createdAt: target.createdAt,
    };
  }

  public async updateUserRole(
    targetUserId: string,
    newRole: UserRole,
    actor: ReviewerProfile
  ): Promise<ReviewerProfile> {
    if (normalizeRole(actor.role) !== 'OWNER') {
      throw new ForbiddenError('Only an owner can change user roles.');
    }

    const target = Array.from(this.reviewers.values()).find((r) => r.id === targetUserId);
    if (!target) {
      throw new NotFoundError('User not found.');
    }

    if (normalizeRole(target.role) === 'OWNER' && newRole !== 'OWNER') {
      const activeOwners = Array.from(this.reviewers.values()).filter(
        (r) => normalizeRole(r.role) === 'OWNER' && r.status === 'ACTIVE'
      );
      if (activeOwners.length <= 1) {
        throw new ForbiddenError('Cannot demote the last remaining owner account.');
      }
    }

    target.role = newRole;

    return {
      id: target.id,
      username: target.username,
      email: target.email,
      role: target.role,
      name: target.name,
      status: target.status,
      lastLoginAt: target.lastLoginAt,
      createdAt: target.createdAt,
    };
  }

  public async revokeUserSessions(userId: string): Promise<number> {
    let count = 0;
    for (const s of this.sessions.values()) {
      if (s.reviewer.id === userId && !s.revoked) {
        s.revoked = true;
        count++;
      }
    }
    return count;
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

  public async isSetupRequired(): Promise<boolean> {
    const { rows } = await this.pool.query(
      "SELECT count(*) FROM reviewers WHERE role = 'OWNER'"
    );
    return parseInt(rows[0].count, 10) === 0;
  }

  public async setupOwner(data: { username: string; email: string; password: string; name: string }): Promise<LoginResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock reviewers to avoid concurrent owner creation
      const checkRes = await client.query(
        "SELECT id FROM reviewers WHERE role = 'OWNER' FOR UPDATE"
      );
      if (checkRes.rows.length > 0) {
        throw new ForbiddenError('Initial setup has already been completed. An owner already exists.');
      }

      if (!data.username || data.username.trim().length < 3) {
        throw new ValidationError('Username must be at least 3 characters.');
      }
      const strength = validatePasswordStrength(data.password);
      if (!strength.valid) {
        throw new ValidationError(strength.message || 'Password must meet complexity requirements.');
      }

      const { hash, salt } = hashPassword(data.password);
      const email = data.email.trim().toLowerCase();
      const username = data.username.trim();
      const name = data.name.trim() || 'System Owner';

      // Check if username or email already exists
      const existingUser = await client.query(
        "SELECT id FROM reviewers WHERE LOWER(username) = LOWER($1) OR (email IS NOT NULL AND LOWER(email) = LOWER($2))",
        [username, email]
      );
      if (existingUser.rows.length > 0) {
        throw new ConflictError(`Username '${data.username}' or email '${data.email}' is already in use.`);
      }

      const insertRes = await client.query(
        `INSERT INTO reviewers (username, email, password_hash, salt, role, name, status, last_login_at)
         VALUES ($1, $2, $3, $4, 'OWNER', $5, 'ACTIVE', NOW())
         RETURNING id, username, email, role, name, status, last_login_at, created_at`,
        [username, email, hash, salt, name]
      );

      const owner = insertRes.rows[0];

      const sessionToken = generateSessionToken();
      const tokenHash = hashSessionToken(sessionToken);
      const expiresAt = new Date(Date.now() + this.sessionTtlSeconds * 1000);

      await client.query(
        `INSERT INTO reviewer_sessions (session_token_hash, reviewer_id, reviewer_username, reviewer_role, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [tokenHash, owner.id, owner.username, owner.role, expiresAt.toISOString()]
      );

      await client.query('COMMIT');

      const profile: ReviewerProfile = {
        id: owner.id,
        username: owner.username,
        email: owner.email,
        role: owner.role,
        name: owner.name,
        status: owner.status,
        lastLoginAt: owner.last_login_at?.toISOString?.() ?? String(owner.last_login_at),
        createdAt: owner.created_at?.toISOString?.() ?? String(owner.created_at),
      };

      return {
        sessionToken,
        reviewer: profile,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async seedReviewer(
    username: string,
    password: string,
    name: string = 'Security Reviewer',
    role: string = 'REVIEWER'
  ): Promise<ReviewerProfile> {
    const { rows } = await this.pool.query(
      'SELECT id, username, email, role, name, status, last_login_at, created_at FROM reviewers WHERE username = $1',
      [username]
    );

    if (rows.length > 0) {
      const r = rows[0];
      return {
        id: r.id,
        username: r.username,
        email: r.email,
        role: r.role,
        name: r.name,
        status: r.status ?? 'ACTIVE',
        lastLoginAt: r.last_login_at?.toISOString?.() ?? null,
        createdAt: r.created_at?.toISOString?.() ?? undefined,
      };
    }

    const { hash, salt } = hashPassword(password);
    const insertRes = await this.pool.query(
      `INSERT INTO reviewers (username, email, password_hash, salt, role, name, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
       RETURNING id, username, email, role, name, status, last_login_at, created_at`,
      [username, `${username}@agentguard.internal`, hash, salt, role, name]
    );

    const r = insertRes.rows[0];
    return {
      id: r.id,
      username: r.username,
      email: r.email,
      role: r.role,
      name: r.name,
      status: r.status,
      lastLoginAt: null,
      createdAt: r.created_at?.toISOString?.() ?? undefined,
    };
  }

  public async login(usernameOrEmail: string, password: string): Promise<LoginResult> {
    const query = usernameOrEmail.trim().toLowerCase();
    const { rows } = await this.pool.query(
      `SELECT id, username, email, password_hash, salt, role, name, status, created_at
       FROM reviewers
       WHERE LOWER(username) = $1 OR LOWER(email) = $1`,
      [query]
    );

    if (rows.length === 0) {
      throw new UnauthorizedError('Invalid credentials.');
    }

    const reviewer = rows[0];

    if (reviewer.status !== 'ACTIVE') {
      throw new ForbiddenError('Account has been deactivated. Please contact an administrator.');
    }

    const isValid = verifyPassword(password, reviewer.password_hash, reviewer.salt);
    if (!isValid) {
      throw new UnauthorizedError('Invalid credentials.');
    }

    const sessionToken = generateSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    const expiresAt = new Date(Date.now() + this.sessionTtlSeconds * 1000);

    await this.pool.query(
      'UPDATE reviewers SET last_login_at = NOW() WHERE id = $1',
      [reviewer.id]
    );

    await this.pool.query(
      `INSERT INTO reviewer_sessions (session_token_hash, reviewer_id, reviewer_username, reviewer_role, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [tokenHash, reviewer.id, reviewer.username, reviewer.role, expiresAt.toISOString()]
    );

    const profile: ReviewerProfile = {
      id: reviewer.id,
      username: reviewer.username,
      email: reviewer.email,
      role: reviewer.role,
      name: reviewer.name,
      status: reviewer.status,
      lastLoginAt: new Date().toISOString(),
      createdAt: reviewer.created_at?.toISOString?.() ?? undefined,
    };

    return {
      sessionToken,
      reviewer: profile,
      expiresAt: expiresAt.toISOString(),
    };
  }

  public async validateSession(sessionToken: string): Promise<ReviewerProfile> {
    if (!sessionToken || sessionToken.trim().length === 0) {
      throw new UnauthorizedError('Missing reviewer session token.');
    }

    const tokenHash = hashSessionToken(sessionToken);
    const { rows } = await this.pool.query(
      `SELECT r.id, r.username, r.email, r.role, r.name, r.status, r.last_login_at, r.created_at, s.expires_at, s.revoked
       FROM reviewer_sessions s
       JOIN reviewers r ON s.reviewer_id = r.id
       WHERE s.session_token_hash = $1`,
      [tokenHash]
    );

    if (rows.length === 0) {
      throw new UnauthorizedError('Invalid or expired session.');
    }

    const s = rows[0];
    if (s.revoked) {
      throw new UnauthorizedError('Session has been revoked.');
    }

    const expiresAt = new Date(s.expires_at).getTime();
    if (Date.now() > expiresAt) {
      throw new UnauthorizedError('Session has expired.');
    }

    if (s.status !== 'ACTIVE') {
      await this.pool.query(
        'UPDATE reviewer_sessions SET revoked = TRUE WHERE session_token_hash = $1',
        [tokenHash]
      );
      throw new UnauthorizedError('Account is deactivated.');
    }

    return {
      id: s.id,
      username: s.username,
      email: s.email,
      role: s.role,
      name: s.name,
      status: s.status,
      lastLoginAt: s.last_login_at?.toISOString?.() ?? null,
      createdAt: s.created_at?.toISOString?.() ?? undefined,
    };
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

  public async listUsers(): Promise<ReviewerProfile[]> {
    const { rows } = await this.pool.query(
      `SELECT id, username, email, role, name, status, last_login_at, created_at
       FROM reviewers
       ORDER BY created_at ASC`
    );

    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      email: r.email,
      role: r.role,
      name: r.name,
      status: r.status ?? 'ACTIVE',
      lastLoginAt: r.last_login_at?.toISOString?.() ?? null,
      createdAt: r.created_at?.toISOString?.() ?? undefined,
    }));
  }

  public async inviteUser(data: {
    email: string;
    role: 'ADMIN' | 'EDITOR' | 'VIEWER' | 'ANALYST';
    createdBy: string;
    ttlHours?: number;
  }): Promise<UserInviteResult> {
    const emailNorm = data.email.trim().toLowerCase();

    const existing = await this.pool.query(
      'SELECT id FROM reviewers WHERE LOWER(email) = $1',
      [emailNorm]
    );
    if (existing.rows.length > 0) {
      throw new ConflictError(`User with email '${data.email}' already exists.`);
    }

    const inviteToken = generateInviteToken();
    const tokenHash = hashInviteToken(inviteToken);
    const ttlMs = (data.ttlHours ?? 48) * 3600 * 1000;
    const expiresAt = new Date(Date.now() + ttlMs);

    const insertRes = await this.pool.query(
      `INSERT INTO user_invitations (email, role, token_hash, expires_at, created_by, revoked)
       VALUES ($1, $2, $3, $4, $5, FALSE)
       RETURNING id`,
      [emailNorm, data.role, tokenHash, expiresAt.toISOString(), data.createdBy]
    );

    return {
      inviteId: insertRes.rows[0].id,
      inviteToken,
      email: emailNorm,
      role: data.role,
      expiresAt: expiresAt.toISOString(),
    };
  }

  public async acceptInvite(data: {
    inviteToken: string;
    username: string;
    password: string;
    name: string;
  }): Promise<LoginResult> {
    const tokenHash = hashInviteToken(data.inviteToken.trim());

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `SELECT id, email, role, expires_at, used_at, revoked
         FROM user_invitations
         WHERE token_hash = $1
         FOR UPDATE`,
        [tokenHash]
      );

      if (rows.length === 0) {
        throw new ValidationError('Invalid invitation token.');
      }

      const invite = rows[0];
      if (invite.used_at) {
        throw new ValidationError('This invitation has already been used.');
      }

      if (invite.revoked) {
        throw new ValidationError('This invitation has been revoked by an administrator.');
      }

      if (new Date(invite.expires_at).getTime() < Date.now()) {
        throw new ValidationError('This invitation has expired.');
      }

      const usernameNorm = data.username.trim();
      const userCheck = await client.query(
        'SELECT id FROM reviewers WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)',
        [usernameNorm, invite.email]
      );
      if (userCheck.rows.length > 0) {
        throw new ConflictError('Username or email is already registered.');
      }

      const strength = validatePasswordStrength(data.password);
      if (!strength.valid) {
        throw new ValidationError(strength.message || 'Password must meet complexity requirements.');
      }

      const { hash, salt } = hashPassword(data.password);
      const name = data.name.trim() || usernameNorm;

      const userRes = await client.query(
        `INSERT INTO reviewers (username, email, password_hash, salt, role, name, status, last_login_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', NOW())
         RETURNING id, username, email, role, name, status, last_login_at, created_at`,
        [usernameNorm, invite.email, hash, salt, invite.role, name]
      );

      const newUser = userRes.rows[0];

      await client.query(
        'UPDATE user_invitations SET used_at = NOW() WHERE id = $1',
        [invite.id]
      );

      const sessionToken = generateSessionToken();
      const sTokenHash = hashSessionToken(sessionToken);
      const expiresAt = new Date(Date.now() + this.sessionTtlSeconds * 1000);

      await client.query(
        `INSERT INTO reviewer_sessions (session_token_hash, reviewer_id, reviewer_username, reviewer_role, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [sTokenHash, newUser.id, newUser.username, newUser.role, expiresAt.toISOString()]
      );

      await client.query('COMMIT');

      const profile: ReviewerProfile = {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        name: newUser.name,
        status: newUser.status,
        lastLoginAt: newUser.last_login_at?.toISOString?.() ?? new Date().toISOString(),
        createdAt: newUser.created_at?.toISOString?.() ?? undefined,
      };

      return {
        sessionToken,
        reviewer: profile,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async updateUserStatus(
    targetUserId: string,
    status: 'ACTIVE' | 'INACTIVE',
    actor: ReviewerProfile
  ): Promise<ReviewerProfile> {
    const { rows } = await this.pool.query(
      'SELECT id, username, email, role, name, status, last_login_at, created_at FROM reviewers WHERE id = $1',
      [targetUserId]
    );

    if (rows.length === 0) {
      throw new NotFoundError('User not found.');
    }

    const target = rows[0];

    if (status === 'INACTIVE' && normalizeRole(target.role) === 'OWNER') {
      const ownerCheck = await this.pool.query(
        "SELECT count(*) FROM reviewers WHERE role = 'OWNER' AND status = 'ACTIVE' AND id != $1",
        [targetUserId]
      );
      if (parseInt(ownerCheck.rows[0].count, 10) === 0) {
        throw new ForbiddenError('Cannot deactivate the last remaining owner account.');
      }
    }

    if (normalizeRole(target.role) === 'OWNER' && normalizeRole(actor.role) !== 'OWNER') {
      throw new ForbiddenError('Only an owner can modify an owner account.');
    }

    await this.pool.query(
      'UPDATE reviewers SET status = $1 WHERE id = $2',
      [status, targetUserId]
    );

    if (status === 'INACTIVE') {
      await this.revokeUserSessions(targetUserId);
    }

    return {
      id: target.id,
      username: target.username,
      email: target.email,
      role: target.role,
      name: target.name,
      status,
      lastLoginAt: target.last_login_at?.toISOString?.() ?? null,
      createdAt: target.created_at?.toISOString?.() ?? undefined,
    };
  }

  public async updateUserRole(
    targetUserId: string,
    newRole: UserRole,
    actor: ReviewerProfile
  ): Promise<ReviewerProfile> {
    if (normalizeRole(actor.role) !== 'OWNER') {
      throw new ForbiddenError('Only an owner can change user roles.');
    }

    const { rows } = await this.pool.query(
      'SELECT id, username, email, role, name, status, last_login_at, created_at FROM reviewers WHERE id = $1',
      [targetUserId]
    );

    if (rows.length === 0) {
      throw new NotFoundError('User not found.');
    }

    const target = rows[0];

    if (normalizeRole(target.role) === 'OWNER' && newRole !== 'OWNER') {
      const ownerCheck = await this.pool.query(
        "SELECT count(*) FROM reviewers WHERE role = 'OWNER' AND status = 'ACTIVE' AND id != $1",
        [targetUserId]
      );
      if (parseInt(ownerCheck.rows[0].count, 10) === 0) {
        throw new ForbiddenError('Cannot demote the last remaining owner account.');
      }
    }

    await this.pool.query(
      'UPDATE reviewers SET role = $1 WHERE id = $2',
      [newRole, targetUserId]
    );

    return {
      id: target.id,
      username: target.username,
      email: target.email,
      role: newRole,
      name: target.name,
      status: target.status,
      lastLoginAt: target.last_login_at?.toISOString?.() ?? null,
      createdAt: target.created_at?.toISOString?.() ?? undefined,
    };
  }

  public async revokeUserSessions(userId: string): Promise<number> {
    const { rowCount } = await this.pool.query(
      'UPDATE reviewer_sessions SET revoked = TRUE WHERE reviewer_id = $1 AND revoked = FALSE',
      [userId]
    );
    return rowCount ?? 0;
  }

  public async listInvitations(): Promise<InvitationRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT id, email, role, expires_at, used_at, revoked, revoked_at, created_by, created_at
       FROM user_invitations
       ORDER BY created_at DESC`
    );

    return rows.map((r) => {
      let status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED' = 'PENDING';
      const expiresAtMs = new Date(r.expires_at).getTime();
      if (r.revoked) {
        status = 'REVOKED';
      } else if (r.used_at) {
        status = 'ACCEPTED';
      } else if (Date.now() > expiresAtMs) {
        status = 'EXPIRED';
      }

      return {
        id: r.id,
        email: r.email,
        role: r.role,
        expiresAt: r.expires_at?.toISOString?.() ?? String(r.expires_at),
        usedAt: r.used_at ? (r.used_at?.toISOString?.() ?? String(r.used_at)) : null,
        revoked: Boolean(r.revoked),
        revokedAt: r.revoked_at ? (r.revoked_at?.toISOString?.() ?? String(r.revoked_at)) : null,
        createdBy: r.created_by,
        createdAt: r.created_at?.toISOString?.() ?? String(r.created_at),
        status,
      };
    });
  }

  public async revokeInvitation(inviteId: string, actor: ReviewerProfile): Promise<boolean> {
    if (!hasRolePermission(actor.role, 'ADMIN')) {
      throw new ForbiddenError('Only an administrator or owner can revoke invitations.');
    }

    const { rows } = await this.pool.query(
      'SELECT id, used_at, revoked FROM user_invitations WHERE id = $1',
      [inviteId]
    );

    if (rows.length === 0) {
      throw new NotFoundError('Invitation not found.');
    }

    if (rows[0].used_at) {
      throw new ValidationError('Cannot revoke an invitation that has already been accepted.');
    }

    const { rowCount } = await this.pool.query(
      'UPDATE user_invitations SET revoked = TRUE, revoked_at = NOW() WHERE id = $1 AND used_at IS NULL',
      [inviteId]
    );

    return (rowCount ?? 0) > 0;
  }

  public async deleteUser(targetUserId: string, actor: ReviewerProfile): Promise<boolean> {
    if (!hasRolePermission(actor.role, 'ADMIN')) {
      throw new ForbiddenError('Only an administrator or owner can remove users.');
    }

    if (actor.id === targetUserId) {
      throw new ForbiddenError('Cannot delete your own account.');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        'SELECT id, username, email, role FROM reviewers WHERE id = $1 FOR UPDATE',
        [targetUserId]
      );

      if (rows.length === 0) {
        throw new NotFoundError('User not found.');
      }

      const target = rows[0];

      if (normalizeRole(target.role) === 'OWNER') {
        if (normalizeRole(actor.role) !== 'OWNER') {
          throw new ForbiddenError('Only an owner can delete an owner account.');
        }

        const ownerCheck = await client.query(
          "SELECT count(*) FROM reviewers WHERE role = 'OWNER' AND status = 'ACTIVE' AND id != $1",
          [targetUserId]
        );
        if (parseInt(ownerCheck.rows[0].count, 10) === 0) {
          throw new ForbiddenError('Cannot delete the last remaining owner account.');
        }
      }

      // Revoke and delete sessions
      await client.query('DELETE FROM reviewer_sessions WHERE reviewer_id = $1', [targetUserId]);

      // Remove reviewer
      await client.query('DELETE FROM reviewers WHERE id = $1', [targetUserId]);

      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async getAuthSettings(): Promise<AuthSettings> {
    const { rows } = await this.pool.query(
      'SELECT allow_public_signup, default_user_role, require_email_verification, invite_only, updated_at, updated_by FROM auth_settings WHERE id = $1',
      ['default']
    );

    if (rows.length === 0) {
      // Seed default
      await this.pool.query(
        `INSERT INTO auth_settings (id, allow_public_signup, default_user_role, require_email_verification, invite_only)
         VALUES ('default', FALSE, 'VIEWER', FALSE, TRUE)
         ON CONFLICT (id) DO NOTHING`
      );
      return {
        allowPublicSignup: false,
        defaultUserRole: 'VIEWER',
        requireEmailVerification: false,
        inviteOnly: true,
      };
    }

    const s = rows[0];
    return {
      allowPublicSignup: Boolean(s.allow_public_signup),
      defaultUserRole: s.default_user_role === 'EDITOR' ? 'EDITOR' : 'VIEWER',
      requireEmailVerification: Boolean(s.require_email_verification),
      inviteOnly: Boolean(s.invite_only),
      updatedAt: s.updated_at?.toISOString?.() ?? String(s.updated_at),
      updatedBy: s.updated_by ?? undefined,
    };
  }

  public async updateAuthSettings(
    settings: Partial<AuthSettings>,
    actor: ReviewerProfile
  ): Promise<AuthSettings> {
    if (!hasRolePermission(actor.role, 'ADMIN')) {
      throw new ForbiddenError('Only an administrator or owner can change authentication settings.');
    }

    const current = await this.getAuthSettings();

    const allowPublicSignup = settings.allowPublicSignup !== undefined ? Boolean(settings.allowPublicSignup) : current.allowPublicSignup;
    const defaultUserRole = settings.defaultUserRole !== undefined ? (settings.defaultUserRole === 'EDITOR' ? 'EDITOR' : 'VIEWER') : current.defaultUserRole;
    const requireEmailVerification = settings.requireEmailVerification !== undefined ? Boolean(settings.requireEmailVerification) : current.requireEmailVerification;
    const inviteOnly = settings.inviteOnly !== undefined ? Boolean(settings.inviteOnly) : current.inviteOnly;

    await this.pool.query(
      `INSERT INTO auth_settings (id, allow_public_signup, default_user_role, require_email_verification, invite_only, updated_at, updated_by)
       VALUES ('default', $1, $2, $3, $4, NOW(), $5)
       ON CONFLICT (id) DO UPDATE
       SET allow_public_signup = EXCLUDED.allow_public_signup,
           default_user_role = EXCLUDED.default_user_role,
           require_email_verification = EXCLUDED.require_email_verification,
           invite_only = EXCLUDED.invite_only,
           updated_at = NOW(),
           updated_by = EXCLUDED.updated_by`,
      [allowPublicSignup, defaultUserRole, requireEmailVerification, inviteOnly, actor.username]
    );

    return {
      allowPublicSignup,
      defaultUserRole,
      requireEmailVerification,
      inviteOnly,
      updatedAt: new Date().toISOString(),
      updatedBy: actor.username,
    };
  }

  public async registerPublicUser(data: {
    username: string;
    email: string;
    password: string;
    name: string;
  }): Promise<LoginResult> {
    const settings = await this.getAuthSettings();
    if (!settings.allowPublicSignup) {
      throw new ForbiddenError('Public registration is currently disabled. An invitation is required to create an account.');
    }

    if (!data.username || data.username.trim().length < 3) {
      throw new ValidationError('Username must be at least 3 characters.');
    }

    const strength = validatePasswordStrength(data.password);
    if (!strength.valid) {
      throw new ValidationError(strength.message || 'Password must meet complexity requirements.');
    }

    const usernameNorm = data.username.trim();
    const emailNorm = data.email.trim().toLowerCase();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        'SELECT id FROM reviewers WHERE LOWER(username) = LOWER($1) OR (email IS NOT NULL AND LOWER(email) = LOWER($2))',
        [usernameNorm, emailNorm]
      );
      if (existing.rows.length > 0) {
        throw new ConflictError('Username or email is already registered.');
      }

      const { hash, salt } = hashPassword(data.password);
      const name = data.name.trim() || usernameNorm;
      const role = settings.defaultUserRole || 'VIEWER';

      const insertRes = await client.query(
        `INSERT INTO reviewers (username, email, password_hash, salt, role, name, status, last_login_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', NOW())
         RETURNING id, username, email, role, name, status, last_login_at, created_at`,
        [usernameNorm, emailNorm, hash, salt, role, name]
      );

      const newUser = insertRes.rows[0];

      const sessionToken = generateSessionToken();
      const tokenHash = hashSessionToken(sessionToken);
      const expiresAt = new Date(Date.now() + this.sessionTtlSeconds * 1000);

      await client.query(
        `INSERT INTO reviewer_sessions (session_token_hash, reviewer_id, reviewer_username, reviewer_role, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [tokenHash, newUser.id, newUser.username, newUser.role, expiresAt.toISOString()]
      );

      await client.query('COMMIT');

      const profile: ReviewerProfile = {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        name: newUser.name,
        status: newUser.status,
        lastLoginAt: newUser.last_login_at?.toISOString?.() ?? new Date().toISOString(),
        createdAt: newUser.created_at?.toISOString?.() ?? undefined,
      };

      return {
        sessionToken,
        reviewer: profile,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async changePassword(
    userId: string,
    oldPass: string,
    newPass: string
  ): Promise<LoginResult> {
    const { rows } = await this.pool.query(
      'SELECT id, username, email, password_hash, salt, role, name, status, created_at FROM reviewers WHERE id = $1',
      [userId]
    );

    if (rows.length === 0) {
      throw new NotFoundError('User not found.');
    }

    const target = rows[0];

    const isValid = verifyPassword(oldPass, target.password_hash, target.salt);
    if (!isValid) {
      throw new UnauthorizedError('Current password is incorrect.');
    }

    const strength = validatePasswordStrength(newPass);
    if (!strength.valid) {
      throw new ValidationError(strength.message || 'New password does not meet complexity requirements.');
    }

    const { hash, salt } = hashPassword(newPass);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        'UPDATE reviewers SET password_hash = $1, salt = $2 WHERE id = $3',
        [hash, salt, userId]
      );

      // Revoke all existing sessions for this user
      await client.query(
        'UPDATE reviewer_sessions SET revoked = TRUE WHERE reviewer_id = $1',
        [userId]
      );

      // Issue rotated session token
      const sessionToken = generateSessionToken();
      const tokenHash = hashSessionToken(sessionToken);
      const expiresAt = new Date(Date.now() + this.sessionTtlSeconds * 1000);

      await client.query(
        `INSERT INTO reviewer_sessions (session_token_hash, reviewer_id, reviewer_username, reviewer_role, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [tokenHash, target.id, target.username, target.role, expiresAt.toISOString()]
      );

      await client.query('COMMIT');

      const profile: ReviewerProfile = {
        id: target.id,
        username: target.username,
        email: target.email,
        role: target.role,
        name: target.name,
        status: target.status,
        lastLoginAt: new Date().toISOString(),
        createdAt: target.created_at?.toISOString?.() ?? undefined,
      };

      return {
        sessionToken,
        reviewer: profile,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async resetUserPassword(
    userId: string,
    tempPassword: string,
    actor: ReviewerProfile
  ): Promise<boolean> {
    if (!hasRolePermission(actor.role, 'ADMIN')) {
      throw new ForbiddenError('Only an administrator or owner can reset user passwords.');
    }

    const { rows } = await this.pool.query(
      'SELECT id, role FROM reviewers WHERE id = $1',
      [userId]
    );

    if (rows.length === 0) {
      throw new NotFoundError('User not found.');
    }

    const target = rows[0];

    if (normalizeRole(target.role) === 'OWNER' && normalizeRole(actor.role) !== 'OWNER') {
      throw new ForbiddenError('Only an owner can reset the password of an owner account.');
    }

    const strength = validatePasswordStrength(tempPassword);
    if (!strength.valid) {
      throw new ValidationError(strength.message || 'Password does not meet complexity requirements.');
    }

    const { hash, salt } = hashPassword(tempPassword);

    await this.pool.query(
      'UPDATE reviewers SET password_hash = $1, salt = $2 WHERE id = $3',
      [hash, salt, userId]
    );

    await this.revokeUserSessions(userId);
    return true;
  }
}
