'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  UserPlus,
  ShieldAlert,
  ShieldCheck,
  Check,
  Copy,
  AlertCircle,
  RefreshCw,
  PowerOff,
  Power,
  KeyRound,
  X,
  Trash2,
  Clock,
  Ban,
  CheckCircle2,
  Mail,
  Shield,
  ExternalLink,
} from 'lucide-react';
import { Navigation } from '../../components/Navigation';
import { AuthGuard, useAuth } from '../../components/AuthGuard';
import { ConfirmModal } from '../../components/ConfirmModal';
import {
  fetchUsers,
  fetchInvitations,
  inviteUser,
  revokeInvitation,
  updateUserStatus,
  updateUserRole,
  revokeUserSessions,
  resetUserPassword,
  deleteUser,
} from '../../lib/api';
import { ReviewerProfile, UserInviteResult, InvitationRecord } from '../../types';

export default function UsersPage() {
  return (
    <AuthGuard requiredRole="ADMIN">
      <UsersContent />
    </AuthGuard>
  );
}

function UsersContent() {
  const router = useRouter();
  const { reviewer: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'users' | 'invitations'>('users');

  const [users, setUsers] = useState<ReviewerProfile[]>([]);
  const [invitations, setInvitations] = useState<InvitationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Invite Modal State
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'EDITOR' | 'VIEWER'>('EDITOR');
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<UserInviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset Password Modal State
  const [resetModalUser, setResetModalUser] = useState<ReviewerProfile | null>(null);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetTempPassword, setResetTempPassword] = useState<string | null>(null);
  const [copiedResetPass, setCopiedResetPass] = useState(false);

  // Delete User Modal State
  const [deleteModalUser, setDeleteModalUser] = useState<ReviewerProfile | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);

  const loadData = async () => {
    try {
      setRefreshing(true);
      setError(null);
      const [usersRes, invitesRes] = await Promise.all([
        fetchUsers().catch((err) => ({ users: [] })),
        fetchInvitations().catch((err) => ({ invitations: [] })),
      ]);
      setUsers(usersRes.users || []);
      setInvitations(invitesRes.invitations || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load user and invitation records.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    try {
      setInviting(true);
      setError(null);
      const res = await inviteUser({
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setInviteResult(res);
      setInviteEmail('');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to generate invitation.');
    } finally {
      setInviting(false);
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    try {
      setActionMessage(null);
      const res = await revokeInvitation(invitationId);
      setActionMessage(res.message || 'Invitation revoked.');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke invitation.');
    }
  };

  const handleCopyLink = () => {
    if (!inviteResult?.inviteUrl) return;
    navigator.clipboard.writeText(inviteResult.inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleStatus = async (user: ReviewerProfile) => {
    const nextStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      setActionMessage(null);
      await updateUserStatus(user.id, nextStatus);
      setActionMessage(`User ${user.username} is now ${nextStatus}.`);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update user status.');
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    try {
      setActionMessage(null);
      await updateUserRole(userId, newRole);
      setActionMessage(`Role successfully updated to ${newRole}.`);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to change role.');
    }
  };

  const handleRevokeSessions = async (userId: string, username: string) => {
    try {
      setActionMessage(null);
      const res = await revokeUserSessions(userId);
      setActionMessage(`Revoked ${res.revokedCount} active session(s) for ${username}.`);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke sessions.');
    }
  };

  const handleConfirmResetPassword = async () => {
    if (!resetModalUser) return;
    try {
      setResettingPassword(true);
      const res = await resetUserPassword(resetModalUser.id);
      setResetTempPassword(res.temporaryPassword);
      setActionMessage(`Temporary password generated for ${resetModalUser.username}.`);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to reset password.');
      setResetModalUser(null);
    } finally {
      setResettingPassword(false);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!deleteModalUser) return;
    try {
      setDeletingUser(true);
      const res = await deleteUser(deleteModalUser.id);
      setActionMessage(res.message || `User ${deleteModalUser.username} removed.`);
      setDeleteModalUser(null);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete user.');
    } finally {
      setDeletingUser(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111215] text-[#F4F4F5] font-sans">
      <Navigation />

      <main className="max-w-[1500px] mx-auto px-4 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#D7FF70]/15 flex items-center justify-center text-[#D7FF70]">
                <Users className="w-4 h-4" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                User Management &amp; Invitations
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-[#8E929C]">
              Manage authenticated installation operators, role assignments, cryptographic invitations, and active sessions.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              disabled={refreshing}
              className="p-2.5 rounded-full bg-[#1C1E24] border border-white/[0.08] hover:border-white/20 text-[#8E929C] hover:text-white transition-colors"
              title="Refresh Records"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={() => {
                setInviteResult(null);
                setInviteModalOpen(true);
              }}
              className="px-5 py-2.5 rounded-full bg-[#D7FF70] hover:bg-[#c4f250] text-[#0E1400] text-xs font-bold transition-all shadow-[0_2px_12px_rgba(215,255,112,0.25)] flex items-center gap-2 btn-press min-h-[42px]"
            >
              <UserPlus className="w-4 h-4" />
              <span>Invite New Operator</span>
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-3 border-b border-white/[0.06] pb-1">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 border ${
              activeTab === 'users'
                ? 'bg-[#D7FF70]/10 border-[#D7FF70]/30 text-[#D7FF70]'
                : 'border-transparent text-[#8E929C] hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Active Operators ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('invitations')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 border ${
              activeTab === 'invitations'
                ? 'bg-[#D7FF70]/10 border-[#D7FF70]/30 text-[#D7FF70]'
                : 'border-transparent text-[#8E929C] hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Mail className="w-4 h-4" />
            <span>Invitations ({invitations.length})</span>
          </button>
        </div>

        {/* Action / Error Alerts */}
        {actionMessage && (
          <div className="p-3.5 rounded-2xl bg-[#D7FF70]/10 border border-[#D7FF70]/20 text-[#D7FF70] text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>{actionMessage}</span>
            </div>
            <button onClick={() => setActionMessage(null)} className="p-1 hover:opacity-75">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="p-1 hover:opacity-75">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* TAB 1: OPERATORS TABLE */}
        {activeTab === 'users' && (
          <div className="bg-[#1C1E24] border border-white/[0.08] rounded-3xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-[#121316]/50 text-[#8E929C] uppercase tracking-wider font-semibold">
                    <th className="py-4 px-6">Operator</th>
                    <th className="py-4 px-4">Role &amp; Privilege</th>
                    <th className="py-4 px-4">Status</th>
                    <th className="py-4 px-4">Registered</th>
                    <th className="py-4 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-[#8E929C]">
                        No user records found.
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => {
                      const isSelf = currentUser?.id === user.id;
                      const isOwner = user.role?.toUpperCase() === 'OWNER';

                      return (
                        <tr key={user.id} className="hover:bg-white/[0.02] transition-colors">
                          {/* User Info */}
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-[#D7FF70]/10 border border-[#D7FF70]/20 flex items-center justify-center font-bold text-[#D7FF70] text-xs">
                                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-white text-sm">{user.name}</span>
                                  {isSelf && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/[0.08] text-white/70 font-mono">
                                      You
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-[#8E929C] font-mono mt-0.5 flex items-center gap-2">
                                  <span>@{user.username}</span>
                                  <span>&bull;</span>
                                  <span>{user.email || 'No email registered'}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Role Selector */}
                          <td className="py-4 px-4">
                            {isOwner ? (
                              <span className="px-2.5 py-1 rounded-full bg-[#D7FF70]/15 text-[#D7FF70] border border-[#D7FF70]/30 font-bold text-[11px]">
                                OWNER (Root Authority)
                              </span>
                            ) : (
                              <select
                                value={user.role?.toUpperCase() || 'VIEWER'}
                                onChange={(e) => handleChangeRole(user.id, e.target.value)}
                                disabled={isSelf}
                                className="px-2.5 py-1 rounded-xl bg-[#121316] border border-white/[0.08] text-[11px] font-semibold text-white focus:outline-none focus:border-[#D7FF70] disabled:opacity-50"
                              >
                                <option value="ADMIN">ADMIN</option>
                                <option value="EDITOR">EDITOR</option>
                                <option value="VIEWER">VIEWER</option>
                              </select>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-4 px-4">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                                user.status === 'ACTIVE'
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  user.status === 'ACTIVE' ? 'bg-emerald-400' : 'bg-rose-400'
                                }`}
                              />
                              <span>{user.status}</span>
                            </span>
                          </td>

                          {/* Registered */}
                          <td className="py-4 px-4 text-[#8E929C] font-mono text-[11px]">
                            {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                          </td>

                          {/* Action Buttons */}
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Toggle Active / Inactive */}
                              <button
                                onClick={() => handleToggleStatus(user)}
                                disabled={isSelf || isOwner}
                                title={user.status === 'ACTIVE' ? 'Deactivate Account' : 'Reactivate Account'}
                                className="p-2 rounded-xl bg-[#121316] border border-white/[0.06] hover:border-white/20 text-[#8E929C] hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                {user.status === 'ACTIVE' ? (
                                  <PowerOff className="w-3.5 h-3.5 text-amber-400" />
                                ) : (
                                  <Power className="w-3.5 h-3.5 text-emerald-400" />
                                )}
                              </button>

                              {/* Revoke Sessions */}
                              <button
                                onClick={() => handleRevokeSessions(user.id, user.username)}
                                title="Revoke all active sessions"
                                className="p-2 rounded-xl bg-[#121316] border border-white/[0.06] hover:border-white/20 text-[#8E929C] hover:text-white transition-colors"
                              >
                                <Ban className="w-3.5 h-3.5 text-cyan-400" />
                              </button>

                              {/* Reset Password */}
                              <button
                                onClick={() => {
                                  setResetTempPassword(null);
                                  setResetModalUser(user);
                                }}
                                title="Reset Operator Password"
                                className="p-2 rounded-xl bg-[#121316] border border-white/[0.06] hover:border-white/20 text-[#8E929C] hover:text-white transition-colors"
                              >
                                <KeyRound className="w-3.5 h-3.5 text-[#D7FF70]" />
                              </button>

                              {/* Delete User */}
                              <button
                                onClick={() => setDeleteModalUser(user)}
                                disabled={isSelf || isOwner}
                                title="Delete Operator"
                                className="p-2 rounded-xl bg-[#121316] border border-white/[0.06] hover:border-rose-500/40 text-[#8E929C] hover:text-rose-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: INVITATIONS TABLE */}
        {activeTab === 'invitations' && (
          <div className="bg-[#1C1E24] border border-white/[0.08] rounded-3xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-[#121316]/50 text-[#8E929C] uppercase tracking-wider font-semibold">
                    <th className="py-4 px-6">Invitee Email</th>
                    <th className="py-4 px-4">Assigned Role</th>
                    <th className="py-4 px-4">Status</th>
                    <th className="py-4 px-4">Issued At</th>
                    <th className="py-4 px-4">Expires At</th>
                    <th className="py-4 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {invitations.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-[#8E929C]">
                        No invitations recorded. Use &quot;Invite New Operator&quot; to issue an invitation.
                      </td>
                    </tr>
                  ) : (
                    invitations.map((inv) => {
                      const isExpired = new Date(inv.expiresAt).getTime() < Date.now();
                      const isAccepted = Boolean(inv.usedAt);
                      const isRevoked = Boolean(inv.revoked);
                      const isPending = !isAccepted && !isRevoked && !isExpired;

                      return (
                        <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-4 px-6 font-mono text-white text-xs">
                            {inv.email}
                          </td>
                          <td className="py-4 px-4">
                            <span className="px-2 py-0.5 rounded-full bg-[#8C7CFF]/15 text-[#8C7CFF] font-bold text-[10px]">
                              {inv.role}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            {isAccepted ? (
                              <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] font-semibold">
                                Accepted
                              </span>
                            ) : isRevoked ? (
                              <span className="px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 text-[11px] font-semibold">
                                Revoked
                              </span>
                            ) : isExpired ? (
                              <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[11px] font-semibold">
                                Expired
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full bg-[#D7FF70]/15 text-[#D7FF70] border border-[#D7FF70]/30 text-[11px] font-semibold">
                                Pending
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-4 text-[#8E929C] font-mono text-[11px]">
                            {new Date(inv.createdAt).toLocaleString()}
                          </td>
                          <td className="py-4 px-4 text-[#8E929C] font-mono text-[11px]">
                            {new Date(inv.expiresAt).toLocaleString()}
                          </td>
                          <td className="py-4 px-6 text-right">
                            {isPending && (
                              <button
                                onClick={() => handleRevokeInvitation(inv.id)}
                                className="px-3 py-1.5 rounded-full bg-[#121316] border border-white/[0.08] hover:border-rose-500/50 hover:bg-rose-500/10 text-xs font-semibold text-rose-400 transition-all"
                              >
                                Revoke
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* MODAL: INVITE OPERATOR */}
        {inviteModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-[#1C1E24] border border-white/[0.08] rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#D7FF70]/15 text-[#D7FF70] flex items-center justify-center">
                    <UserPlus className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">Invite New Operator</h2>
                    <p className="text-xs text-[#8E929C]">Issue single-use cryptographic invitation</p>
                  </div>
                </div>

                <button
                  onClick={() => setInviteModalOpen(false)}
                  className="p-1.5 rounded-full hover:bg-white/[0.06] text-[#8E929C] hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {inviteResult ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-[#D7FF70]/10 border border-[#D7FF70]/20 space-y-3">
                    <div className="flex items-center gap-2 text-[#D7FF70] font-semibold text-xs">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Invitation Secret Generated Successfully!</span>
                    </div>
                    <p className="text-xs text-[#8E929C] leading-relaxed">
                      Share the secret activation link below with the operator. For security, the raw invitation token is never stored in plaintext and this link cannot be retrieved again.
                    </p>
                    <div className="p-3 rounded-xl bg-[#121316] border border-white/[0.06] font-mono text-xs text-white break-all">
                      {inviteResult.inviteUrl}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      onClick={handleCopyLink}
                      className="px-5 py-2.5 rounded-full bg-[#D7FF70] text-[#0E1400] text-xs font-bold transition-all flex items-center gap-2 btn-press"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied to Clipboard!' : 'Copy Activation Link'}</span>
                    </button>
                    <button
                      onClick={() => setInviteModalOpen(false)}
                      className="px-5 py-2.5 rounded-full bg-[#121316] border border-white/[0.08] text-xs font-semibold text-white hover:bg-white/[0.04]"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleInvite} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[#8E929C] uppercase tracking-wider">
                      Operator Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-[#8E929C] absolute left-3.5 top-3.5" />
                      <input
                        type="email"
                        required
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="operator@defense.node"
                        className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-[#121316] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-[#D7FF70]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[#8E929C] uppercase tracking-wider">
                      Assigned Privilege Role
                    </label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as any)}
                      className="w-full p-2.5 rounded-2xl bg-[#121316] border border-white/[0.08] text-white text-xs font-semibold focus:outline-none focus:border-[#D7FF70]"
                    >
                      <option value="VIEWER">VIEWER (Read-Only Telemetry &amp; Dashboards)</option>
                      <option value="EDITOR">EDITOR (Operational Approvals &amp; Test Lab)</option>
                      <option value="ADMIN">ADMIN (Full Access, User &amp; Security Settings)</option>
                    </select>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.04] text-[11px] text-[#8E929C]">
                    Invitation tokens are cryptographically generated, hashed with SHA-256 before database insertion, and expire automatically after 72 hours.
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3">
                    <button
                      type="button"
                      onClick={() => setInviteModalOpen(false)}
                      className="px-5 py-2.5 rounded-full bg-[#121316] border border-white/[0.08] text-xs font-semibold text-white hover:bg-white/[0.04]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={inviting}
                      className="px-6 py-2.5 rounded-full bg-[#D7FF70] hover:bg-[#c4f250] text-[#0E1400] text-xs font-bold transition-all shadow-md flex items-center gap-2 btn-press disabled:opacity-50"
                    >
                      {inviting ? (
                        <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <UserPlus className="w-3.5 h-3.5" />
                      )}
                      <span>Generate Invitation Link</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* MODAL: RESET PASSWORD */}
        <ConfirmModal
          isOpen={Boolean(resetModalUser)}
          onClose={() => {
            setResetModalUser(null);
            setResetTempPassword(null);
          }}
          onConfirm={handleConfirmResetPassword}
          title={resetTempPassword ? 'Temporary Password Generated' : 'Reset Operator Password'}
          description={
            resetTempPassword
              ? 'Provide this temporary password securely to the operator. Existing sessions have been immediately revoked.'
              : `Are you sure you want to reset the password for ${resetModalUser?.name} (@${resetModalUser?.username})? All existing sessions will be immediately terminated.`
          }
          confirmText={resetTempPassword ? 'Done' : 'Confirm Password Reset'}
          cancelText={resetTempPassword ? undefined : 'Cancel'}
          type="lime"
          isLoading={resettingPassword}
        >
          {resetTempPassword && (
            <div className="space-y-3 pt-2">
              <div className="p-3.5 rounded-2xl bg-[#121316] border border-white/[0.08] flex items-center justify-between">
                <span className="font-mono text-sm text-[#D7FF70] font-bold">{resetTempPassword}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(resetTempPassword);
                    setCopiedResetPass(true);
                    setTimeout(() => setCopiedResetPass(false), 2000);
                  }}
                  className="px-3 py-1 rounded-full bg-[#D7FF70]/15 text-[#D7FF70] text-xs font-bold hover:bg-[#D7FF70]/25 transition-colors flex items-center gap-1.5"
                >
                  {copiedResetPass ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedResetPass ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          )}
        </ConfirmModal>

        {/* MODAL: DELETE USER */}
        <ConfirmModal
          isOpen={Boolean(deleteModalUser)}
          onClose={() => setDeleteModalUser(null)}
          onConfirm={handleConfirmDeleteUser}
          title="Delete Operator Account"
          description={`Permanently remove ${deleteModalUser?.name} (@${deleteModalUser?.username}) from this AgentGuard node? All active sessions will be terminated.`}
          confirmText="Permanently Delete Operator"
          cancelText="Cancel"
          type="danger"
          isLoading={deletingUser}
        />
      </main>
    </div>
  );
}
