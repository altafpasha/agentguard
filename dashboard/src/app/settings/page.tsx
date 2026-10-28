'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Settings,
  Shield,
  Server,
  Lock,
  User,
  LogOut,
  Key,
  CheckCircle2,
  AlertCircle,
  EyeOff,
  Cpu,
  Database,
  Users,
  UserCheck,
  UserPlus,
  ArrowRight,
  RefreshCw,
  Sliders,
  Check,
  Sparkles,
  Info,
  Copy,
  Plus,
  Trash2,
  RotateCw,
  Terminal,
  Code2,
} from 'lucide-react';
import { Navigation } from '../../components/Navigation';
import { AuthGuard, useAuth } from '../../components/AuthGuard';
import {
  fetchCurrentReviewer,
  fetchSystemHealth,
  fetchAuthSettings,
  updateAuthSettings,
  changePassword,
  logoutReviewer,
  fetchApiKeys,
  createApiKey,
  revokeApiKey,
  rotateApiKey,
} from '../../lib/api';
import { ReviewerProfile, SystemHealthStatus, AuthSettings, ApiKeyRecord } from '../../types';

export default function SettingsPage() {
  return (
    <AuthGuard>
      <SettingsContent />
    </AuthGuard>
  );
}

function SettingsContent() {
  const { reviewer: authReviewer, isOwnerOrAdmin, logout } = useAuth();
  const [health, setHealth] = useState<SystemHealthStatus | null>(null);
  const [activeTab, setActiveTab] = useState<'api-keys' | 'auth-access' | 'account' | 'gateway'>('api-keys');

  // API Keys State
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [loadingApiKeys, setLoadingApiKeys] = useState(false);
  const [apiKeyMessage, setApiKeyMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [createKeyName, setCreateKeyName] = useState('');
  const [createKeyWorkspace, setCreateKeyWorkspace] = useState('default');
  const [createKeyEnvironment, setCreateKeyEnvironment] = useState('production');
  const [createKeyPermissions, setCreateKeyPermissions] = useState<string[]>(['evaluate', 'approvals:read']);
  const [createKeyExpiresInDays, setCreateKeyExpiresInDays] = useState(0);
  const [creatingKey, setCreatingKey] = useState(false);
  const [newlyGeneratedSecret, setNewlyGeneratedSecret] = useState<{
    name: string;
    secretKey: string;
    keyPrefix: string;
  } | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [actionInProgressKeyId, setActionInProgressKeyId] = useState<string | null>(null);
  const [sdkSnippetLang, setSdkSnippetLang] = useState<'typescript' | 'python'>('typescript');

  // Auth & Access Settings State (Admin/Owner)
  const [authSettings, setAuthSettings] = useState<AuthSettings>({
    allowPublicSignup: false,
    defaultUserRole: 'VIEWER',
    requireEmailVerification: false,
    inviteOnly: true,
  });
  const [loadingAuthSettings, setLoadingAuthSettings] = useState(true);
  const [savingAuthSettings, setSavingAuthSettings] = useState(false);
  const [authSettingsMessage, setAuthSettingsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Change Password Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadApiKeysData = async () => {
    setLoadingApiKeys(true);
    try {
      const res = await fetchApiKeys();
      if (res.apiKeys) {
        setApiKeys(res.apiKeys);
      }
    } catch (err: any) {
      console.error('Failed to load API keys:', err);
    } finally {
      setLoadingApiKeys(false);
    }
  };

  // Load initial settings and health
  const loadData = async () => {
    try {
      fetchSystemHealth().then(setHealth).catch(() => {});
      loadApiKeysData();
      if (isOwnerOrAdmin) {
        setLoadingAuthSettings(true);
        const res = await fetchAuthSettings();
        if (res.settings) {
          setAuthSettings(res.settings);
        }
      }
    } catch (err: any) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoadingAuthSettings(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [isOwnerOrAdmin]);

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createKeyName.trim()) {
      setApiKeyMessage({ type: 'error', text: 'Please provide a name for the API key.' });
      return;
    }
    setCreatingKey(true);
    setApiKeyMessage(null);
    try {
      const res = await createApiKey({
        name: createKeyName.trim(),
        workspaceId: createKeyWorkspace.trim() || 'default',
        environment: createKeyEnvironment,
        permissions: createKeyPermissions,
        expiresInDays: createKeyExpiresInDays > 0 ? createKeyExpiresInDays : undefined,
      });
      setNewlyGeneratedSecret({
        name: res.apiKey.name,
        secretKey: res.secretKey,
        keyPrefix: res.apiKey.keyPrefix,
      });
      setShowCreateKeyModal(false);
      setCreateKeyName('');
      setCreateKeyPermissions(['evaluate', 'approvals:read']);
      setCreateKeyExpiresInDays(0);
      setApiKeyMessage({ type: 'success', text: `API key "${res.apiKey.name}" generated successfully. Copy your secret below.` });
      await loadApiKeysData();
    } catch (err: any) {
      setApiKeyMessage({ type: 'error', text: err.message || 'Failed to create API key.' });
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeApiKey = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to revoke API key "${name}"? External applications using this key will immediately receive 401 Unauthorized.`)) {
      return;
    }
    setActionInProgressKeyId(id);
    try {
      await revokeApiKey(id);
      setApiKeyMessage({ type: 'success', text: `API key "${name}" revoked.` });
      await loadApiKeysData();
    } catch (err: any) {
      setApiKeyMessage({ type: 'error', text: err.message || 'Failed to revoke API key.' });
    } finally {
      setActionInProgressKeyId(null);
    }
  };

  const handleRotateApiKey = async (id: string, name: string) => {
    if (!confirm(`Rotate API key "${name}"? This invalidates the old key and generates a brand-new secret key.`)) {
      return;
    }
    setActionInProgressKeyId(id);
    try {
      const res = await rotateApiKey(id);
      setNewlyGeneratedSecret({
        name: res.apiKey.name,
        secretKey: res.secretKey,
        keyPrefix: res.apiKey.keyPrefix,
      });
      setApiKeyMessage({ type: 'success', text: `API key "${name}" rotated. Copy your new secret key below.` });
      await loadApiKeysData();
    } catch (err: any) {
      setApiKeyMessage({ type: 'error', text: err.message || 'Failed to rotate API key.' });
    } finally {
      setActionInProgressKeyId(null);
    }
  };

  const handleCopySecret = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2500);
  };

  // Password Policy Checks
  const hasMinLength = newPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasLowercase = /[a-z]/.test(newPassword);
  const hasNumberOrSpecial = /[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);
  const isPasswordValid = hasMinLength && hasUppercase && hasLowercase && hasNumberOrSpecial;

  // Handle Save Auth Settings
  const handleSaveAuthSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAuthSettings(true);
    setAuthSettingsMessage(null);
    try {
      const res = await updateAuthSettings(authSettings);
      setAuthSettings(res.settings);
      setAuthSettingsMessage({ type: 'success', text: 'Authentication & registration settings updated successfully.' });
    } catch (err: any) {
      setAuthSettingsMessage({ type: 'error', text: err.message || 'Failed to update authentication settings.' });
    } finally {
      setSavingAuthSettings(false);
    }
  };

  // Handle Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (!currentPassword) {
      setPasswordMessage({ type: 'error', text: 'Please enter your current password.' });
      return;
    }
    if (!isPasswordValid) {
      setPasswordMessage({ type: 'error', text: 'New password does not satisfy the security policy criteria.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await changePassword({ currentPassword, newPassword });
      setPasswordMessage({ type: 'success', text: res.message || 'Password changed successfully! Session rotated.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordMessage({ type: 'error', text: err.message || 'Failed to change password. Verify your current password.' });
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111215] text-[#F4F4F5] font-sans">
      <Navigation />

      <main className="max-w-[1600px] mx-auto px-4 lg:px-8 py-8 space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#D7FF70]/15 flex items-center justify-center text-[#D7FF70]">
                <Settings className="w-4 h-4" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                System &amp; Security Settings
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-[#8E929C]">
              Manage authentication controls, user registration policies, operator sessions, and gateway adapters.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isOwnerOrAdmin && (
              <Link
                href="/users"
                className="px-4 py-2.5 rounded-full bg-[#1C1E24] border border-white/[0.08] hover:border-[#D7FF70]/40 text-xs font-semibold text-white transition-all flex items-center gap-2 btn-press"
              >
                <Users className="w-4 h-4 text-[#D7FF70]" />
                <span>Manage Users &amp; Invitations</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#8E929C]" />
              </Link>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] pb-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('api-keys')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 border ${
              activeTab === 'api-keys'
                ? 'bg-[#D7FF70]/10 border-[#D7FF70]/30 text-[#D7FF70]'
                : 'border-transparent text-[#8E929C] hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>API Keys &amp; SDK</span>
          </button>

          {isOwnerOrAdmin && (
            <button
              onClick={() => setActiveTab('auth-access')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 border ${
                activeTab === 'auth-access'
                  ? 'bg-[#D7FF70]/10 border-[#D7FF70]/30 text-[#D7FF70]'
                  : 'border-transparent text-[#8E929C] hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Authentication &amp; Access</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('account')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 border ${
              activeTab === 'account'
                ? 'bg-[#D7FF70]/10 border-[#D7FF70]/30 text-[#D7FF70]'
                : 'border-transparent text-[#8E929C] hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Account &amp; Security</span>
          </button>

          <button
            onClick={() => setActiveTab('gateway')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 border ${
              activeTab === 'gateway'
                ? 'bg-[#D7FF70]/10 border-[#D7FF70]/30 text-[#D7FF70]'
                : 'border-transparent text-[#8E929C] hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Gateway &amp; Infrastructure</span>
          </button>
        </div>

        {/* TAB 0: API KEYS & SDK INTEGRATION */}
        {activeTab === 'api-keys' && (
          <div className="space-y-6">
            {apiKeyMessage && (
              <div
                className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-xs font-semibold ${
                  apiKeyMessage.type === 'success'
                    ? 'bg-[#D7FF70]/15 text-[#D7FF70] border border-[#D7FF70]/30'
                    : 'bg-[#FF5454]/15 text-[#FF5454] border border-[#FF5454]/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  {apiKeyMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{apiKeyMessage.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setApiKeyMessage(null)}
                  className="opacity-70 hover:opacity-100 text-xs px-2 py-0.5"
                >
                  &times;
                </button>
              </div>
            )}

            {/* NEWLY GENERATED SECRET NOTIFICATION MODAL / BANNER */}
            {newlyGeneratedSecret && (
              <div className="p-6 rounded-[24px] bg-[#1C241E] border-2 border-[#D7FF70]/60 space-y-4 shadow-2xl animate-in fade-in slide-in-from-top-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[#D7FF70]">
                      <Sparkles className="w-5 h-5" />
                      <h3 className="text-base font-bold text-white">
                        API Key Secret for &ldquo;{newlyGeneratedSecret.name}&rdquo;
                      </h3>
                    </div>
                    <p className="text-xs text-amber-300 font-medium">
                      &#9888; Important: Copy this secret key immediately. It is SHA-256 hashed in the database and will <strong>never</strong> be displayed again!
                    </p>
                  </div>
                  <button
                    onClick={() => setNewlyGeneratedSecret(null)}
                    className="text-xs text-[#8E929C] hover:text-white px-3 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] transition-all"
                  >
                    I&apos;ve Stored It
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 rounded-xl bg-[#111215] border border-[#D7FF70]/30">
                  <span className="font-mono text-sm text-[#D7FF70] break-all select-all flex-1 px-2">
                    {newlyGeneratedSecret.secretKey}
                  </span>
                  <button
                    onClick={() => handleCopySecret(newlyGeneratedSecret.secretKey)}
                    className="px-4 py-2 rounded-lg bg-[#D7FF70] text-[#111215] text-xs font-bold hover:bg-[#c2ef5a] transition-all flex items-center justify-center gap-1.5 shrink-0"
                  >
                    {copiedSecret ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSecret ? 'Copied!' : 'Copy Secret'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* API KEYS MANAGEMENT CARD */}
            <div className="p-6 sm:p-8 rounded-[28px] bg-[#1C1E24] border border-white/[0.08] space-y-6 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-5">
                <div className="space-y-1">
                  <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2.5">
                    <Key className="w-5 h-5 text-[#D7FF70]" />
                    <span>External Gateway API Keys</span>
                  </h2>
                  <p className="text-xs text-[#8E929C]">
                    Manage server-to-server credentials for external applications integrating with AgentGuard through the official TypeScript and Python SDKs.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowCreateKeyModal(true)}
                    className="px-4 py-2.5 rounded-full bg-[#D7FF70] hover:bg-[#c2ef5a] text-[#111215] text-xs font-bold transition-all flex items-center gap-2 btn-press"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Generate API Key</span>
                  </button>
                </div>
              </div>

              {/* KEYS TABLE / LIST */}
              {loadingApiKeys ? (
                <div className="p-8 text-center text-xs text-[#8E929C] flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#D7FF70]" />
                  <span>Loading API keys...</span>
                </div>
              ) : apiKeys.length === 0 ? (
                <div className="p-8 rounded-2xl bg-[#121316] border border-white/[0.04] text-center space-y-3">
                  <Key className="w-8 h-8 text-[#8E929C] mx-auto opacity-40" />
                  <p className="text-sm font-semibold text-white">No active API keys found</p>
                  <p className="text-xs text-[#8E929C] max-w-md mx-auto">
                    Generate an API key to allow external merchant backends, payment agents, and Python/Node.js services to submit pre-flight security evaluations.
                  </p>
                  <button
                    onClick={() => setShowCreateKeyModal(true)}
                    className="px-4 py-2 rounded-xl bg-[#D7FF70]/15 text-[#D7FF70] hover:bg-[#D7FF70]/25 text-xs font-bold transition-all inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Your First Key</span>
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.06] text-[#8E929C] font-semibold uppercase tracking-wider text-[10px]">
                        <th className="pb-3 px-3">Name / Prefix</th>
                        <th className="pb-3 px-3">Environment</th>
                        <th className="pb-3 px-3">Permissions</th>
                        <th className="pb-3 px-3">Created</th>
                        <th className="pb-3 px-3">Last Used</th>
                        <th className="pb-3 px-3">Status</th>
                        <th className="pb-3 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {apiKeys.map((key) => (
                        <tr key={key.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-3 px-3">
                            <div className="font-semibold text-white">{key.name}</div>
                            <div className="font-mono text-[11px] text-[#8E929C]">{key.keyPrefix}••••••••</div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-white/[0.06] text-white/80 border border-white/[0.08]">
                              {key.environment}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-wrap gap-1">
                              {key.permissions.map((perm) => (
                                <span
                                  key={perm}
                                  className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-[#8C7CFF]/15 text-[#8C7CFF]"
                                >
                                  {perm}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-[#8E929C]">
                            {new Date(key.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-3 text-[#8E929C]">
                            {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}
                          </td>
                          <td className="py-3 px-3">
                            {key.revoked ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#FF5454]/15 text-[#FF5454] border border-[#FF5454]/30">
                                Revoked
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#D7FF70]/15 text-[#D7FF70] border border-[#D7FF70]/30">
                                Active
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            {!key.revoked && (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleRotateApiKey(key.id, key.name)}
                                  disabled={actionInProgressKeyId === key.id}
                                  title="Rotate key and issue new secret"
                                  className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[#8E929C] hover:text-[#D7FF70] transition-all disabled:opacity-50"
                                >
                                  <RotateCw className={`w-3.5 h-3.5 ${actionInProgressKeyId === key.id ? 'animate-spin' : ''}`} />
                                </button>
                                <button
                                  onClick={() => handleRevokeApiKey(key.id, key.name)}
                                  disabled={actionInProgressKeyId === key.id}
                                  title="Revoke key immediately"
                                  className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-[#FF5454]/15 text-[#8E929C] hover:text-[#FF5454] transition-all disabled:opacity-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* SDK QUICKSTART CODE EXAMPLES */}
            <div className="p-6 sm:p-8 rounded-[28px] bg-[#1C1E24] border border-white/[0.08] space-y-6 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-5">
                <div className="space-y-1">
                  <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2.5">
                    <Code2 className="w-5 h-5 text-[#D7FF70]" />
                    <span>Official SDK Integration Quickstart</span>
                  </h2>
                  <p className="text-xs text-[#8E929C]">
                    Send security evaluations before executing financial or tool actions. Complete fail-closed guarantees.
                  </p>
                </div>

                <div className="flex items-center gap-1.5 bg-[#121316] p-1 rounded-xl border border-white/[0.06]">
                  <button
                    onClick={() => setSdkSnippetLang('typescript')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      sdkSnippetLang === 'typescript'
                        ? 'bg-[#D7FF70] text-[#111215] shadow-sm'
                        : 'text-[#8E929C] hover:text-white'
                    }`}
                  >
                    TypeScript (Node.js)
                  </button>
                  <button
                    onClick={() => setSdkSnippetLang('python')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      sdkSnippetLang === 'python'
                        ? 'bg-[#D7FF70] text-[#111215] shadow-sm'
                        : 'text-[#8E929C] hover:text-white'
                    }`}
                  >
                    Python
                  </button>
                </div>
              </div>

              {sdkSnippetLang === 'typescript' ? (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-[#121316] border border-white/[0.06] font-mono text-xs flex items-center justify-between">
                    <span className="text-[#8E929C]">
                      npm install <span className="text-[#D7FF70]">@codesec-ai/agentguard</span>
                    </span>
                    <button
                      onClick={() => handleCopySecret('npm install @codesec-ai/agentguard')}
                      className="text-[11px] text-[#8E929C] hover:text-white px-2 py-0.5 rounded bg-white/[0.06]"
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="p-4 rounded-2xl bg-[#121316] border border-white/[0.06] font-mono text-xs text-[#F4F4F5] overflow-x-auto leading-relaxed">
{`import { AgentGuard } from '@codesec-ai/agentguard';

const guard = new AgentGuard({
  baseUrl: process.env.AGENTGUARD_URL || 'http://localhost:3001',
  apiKey: process.env.AGENTGUARD_API_KEY!,
  timeoutMs: 5000,
});

// Pre-flight evaluate before executing payment or high-risk tool
const decision = await guard.evaluate({
  action: 'payment.create',
  amount: 5000,
  currency: 'INR',
  tool: 'payment',
  operation: 'payment.create',
  agentId: 'payment-agent-01',
});

if (decision.isAllowed) {
  // Authoritative ALLOW: Proceed with Razorpay order creation
  const order = await razorpay.orders.create({ amount: 5000, currency: 'INR' });
} else if (decision.isHeld) {
  // Authoritative HOLD: Awaiting human approval in AgentGuard dashboard
  console.log('Held for approval:', decision.approvalId);
} else {
  // Authoritative BLOCK: Reject operation
  throw new Error(\`Guarded by AgentGuard: \${decision.reasons.join(', ')}\`);
}`}
                  </pre>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-[#121316] border border-white/[0.06] font-mono text-xs flex items-center justify-between">
                    <span className="text-[#8E929C]">
                      pip install <span className="text-[#D7FF70]">agentguard-sdk</span>
                    </span>
                    <button
                      onClick={() => handleCopySecret('pip install agentguard-sdk')}
                      className="text-[11px] text-[#8E929C] hover:text-white px-2 py-0.5 rounded bg-white/[0.06]"
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="p-4 rounded-2xl bg-[#121316] border border-white/[0.06] font-mono text-xs text-[#F4F4F5] overflow-x-auto leading-relaxed">
{`import os
from agentguard import AgentGuard

guard = AgentGuard(
    base_url=os.getenv("AGENTGUARD_URL", "http://localhost:3001"),
    api_key=os.environ["AGENTGUARD_API_KEY"],
    timeout=5.0,
)

decision = guard.evaluate(
    action="payment.create",
    amount=5000,
    currency="INR",
    tool="payment",
    operation="payment.create",
    agent_id="payment-agent-01",
)

if decision.is_allowed:
    # Authoritative ALLOW: Safe to proceed
    pass
elif decision.is_held:
    # Authoritative HOLD: Awaiting reviewer approval in AgentGuard dashboard
    print(f"Approval required: {decision.approval_id}")
else:
    # Authoritative BLOCK: Reject operation (fail-closed)
    raise RuntimeError(f"AgentGuard blocked action: {', '.join(decision.reasons)}")`}
                  </pre>
                </div>
              )}
            </div>

            {/* CREATE API KEY MODAL */}
            {showCreateKeyModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                <div className="w-full max-w-lg rounded-[28px] bg-[#1C1E24] border border-white/[0.1] p-6 sm:p-8 space-y-6 shadow-2xl animate-in zoom-in-95">
                  <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-[#D7FF70]/15 flex items-center justify-center text-[#D7FF70]">
                        <Key className="w-4 h-4" />
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-white">Generate Gateway API Key</h3>
                    </div>
                    <button
                      onClick={() => setShowCreateKeyModal(false)}
                      className="text-[#8E929C] hover:text-white text-lg p-1"
                    >
                      &times;
                    </button>
                  </div>

                  <form onSubmit={handleCreateApiKey} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-[#8E929C]">Key Name / Description</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g., Razorpay Backend Service"
                        value={createKeyName}
                        onChange={(e) => setCreateKeyName(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-[#121316] border border-white/[0.08] focus:border-[#D7FF70] text-xs text-white outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-[#8E929C]">Environment</label>
                        <select
                          value={createKeyEnvironment}
                          onChange={(e) => setCreateKeyEnvironment(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl bg-[#121316] border border-white/[0.08] focus:border-[#D7FF70] text-xs text-white outline-none"
                        >
                          <option value="production">Production</option>
                          <option value="staging">Staging</option>
                          <option value="development">Development</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-[#8E929C]">Workspace</label>
                        <input
                          type="text"
                          value={createKeyWorkspace}
                          onChange={(e) => setCreateKeyWorkspace(e.target.value)}
                          placeholder="default"
                          className="w-full px-4 py-2.5 rounded-xl bg-[#121316] border border-white/[0.08] focus:border-[#D7FF70] text-xs text-white outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-[#8E929C]">Expiration</label>
                      <select
                        value={createKeyExpiresInDays}
                        onChange={(e) => setCreateKeyExpiresInDays(Number(e.target.value))}
                        className="w-full px-3 py-2.5 rounded-xl bg-[#121316] border border-white/[0.08] focus:border-[#D7FF70] text-xs text-white outline-none"
                      >
                        <option value={0}>Never expires (Standard Server Key)</option>
                        <option value={30}>30 Days</option>
                        <option value={90}>90 Days</option>
                        <option value={365}>365 Days</option>
                      </select>
                    </div>

                    <div className="space-y-2 pt-1">
                      <label className="text-xs font-semibold text-[#8E929C]">Permissions &amp; Scopes</label>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {[
                          { id: 'evaluate', label: 'evaluate (Security Checks)' },
                          { id: 'approvals:read', label: 'approvals:read (Check Held Status)' },
                          { id: 'approvals:write', label: 'approvals:write (Approve/Reject)' },
                          { id: 'policies:read', label: 'policies:read (Read Rules)' },
                        ].map((perm) => (
                          <label
                            key={perm.id}
                            className="flex items-center gap-2 p-2 rounded-xl bg-[#121316] border border-white/[0.04] cursor-pointer hover:border-white/[0.1]"
                          >
                            <input
                              type="checkbox"
                              checked={createKeyPermissions.includes(perm.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setCreateKeyPermissions([...createKeyPermissions, perm.id]);
                                } else {
                                  setCreateKeyPermissions(createKeyPermissions.filter((p) => p !== perm.id));
                                }
                              }}
                              className="rounded accent-[#D7FF70]"
                            />
                            <span className="text-[11px] text-white/90">{perm.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() => setShowCreateKeyModal(false)}
                        className="px-4 py-2 rounded-xl text-xs font-semibold text-[#8E929C] hover:text-white hover:bg-white/[0.04] transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={creatingKey}
                        className="px-5 py-2.5 rounded-xl bg-[#D7FF70] hover:bg-[#c2ef5a] text-[#111215] text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-50"
                      >
                        {creatingKey ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Generating...</span>
                          </>
                        ) : (
                          <span>Generate Key</span>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 1: AUTHENTICATION & ACCESS (ADMIN / OWNER ONLY) */}
        {activeTab === 'auth-access' && isOwnerOrAdmin && (
          <div className="space-y-6">
            <div className="p-6 sm:p-8 rounded-[28px] bg-[#1C1E24] border border-white/[0.08] space-y-6 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-5">
                <div className="space-y-1">
                  <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2.5">
                    <Shield className="w-5 h-5 text-[#D7FF70]" />
                    <span>Self-Hosted Registration &amp; Access Controls</span>
                  </h2>
                  <p className="text-xs text-[#8E929C]">
                    Configure whether public sign-up is permitted and how new users gain access to this AgentGuard defense node.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] px-2.5 py-1 rounded-full bg-[#D7FF70]/15 text-[#D7FF70] font-mono font-bold">
                    Admin Protected
                  </span>
                </div>
              </div>

              {authSettingsMessage && (
                <div
                  className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-xs font-semibold ${
                    authSettingsMessage.type === 'success'
                      ? 'bg-[#D7FF70]/15 text-[#D7FF70] border border-[#D7FF70]/30'
                      : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {authSettingsMessage.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{authSettingsMessage.text}</span>
                  </div>
                  <button onClick={() => setAuthSettingsMessage(null)} className="p-1 hover:opacity-75">
                    &times;
                  </button>
                </div>
              )}

              <form onSubmit={handleSaveAuthSettings} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Public Sign-Up Toggle */}
                  <div className="p-5 rounded-2xl bg-[#121316] border border-white/[0.04] space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-white">Allow Public Sign-Up</h3>
                        <p className="text-xs text-[#8E929C] mt-1">
                          When enabled, anyone with access to the login portal can register a new account without an invitation.
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                        <input
                          type="checkbox"
                          checked={authSettings.allowPublicSignup}
                          onChange={(e) =>
                            setAuthSettings({
                              ...authSettings,
                              allowPublicSignup: e.target.checked,
                              inviteOnly: e.target.checked ? false : authSettings.inviteOnly,
                            })
                          }
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-[#262830] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#D7FF70]"></div>
                      </label>
                    </div>
                    <div className="pt-2 text-[11px] text-[#8E929C] flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      <span>Recommended disabled for high-security production deployments.</span>
                    </div>
                  </div>

                  {/* Invite-Only Registration Toggle */}
                  <div className="p-5 rounded-2xl bg-[#121316] border border-white/[0.04] space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-white">Invite-Only Registration</h3>
                        <p className="text-xs text-[#8E929C] mt-1">
                          Restrict registration strictly to operators possessing a valid, single-use cryptographically signed invitation.
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                        <input
                          type="checkbox"
                          checked={authSettings.inviteOnly}
                          onChange={(e) =>
                            setAuthSettings({
                              ...authSettings,
                              inviteOnly: e.target.checked,
                              allowPublicSignup: e.target.checked ? false : authSettings.allowPublicSignup,
                            })
                          }
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-[#262830] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#D7FF70]"></div>
                      </label>
                    </div>
                    <div className="pt-2 text-[11px] text-[#8E929C] flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#D7FF70]" />
                      <span>Default self-hosted security standard.</span>
                    </div>
                  </div>

                  {/* Default New-User Role */}
                  <div className="p-5 rounded-2xl bg-[#121316] border border-white/[0.04] space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white">Default New-User Role</h3>
                      <p className="text-xs text-[#8E929C] mt-1">
                        Select the least-privileged permitted role granted to automatically registered users.
                      </p>
                    </div>
                    <div className="pt-1">
                      <select
                        value={authSettings.defaultUserRole}
                        onChange={(e) =>
                          setAuthSettings({
                            ...authSettings,
                            defaultUserRole: e.target.value as 'VIEWER' | 'EDITOR',
                          })
                        }
                        className="w-full p-3 rounded-xl bg-[#1C1E24] border border-white/[0.08] text-xs font-semibold text-white focus:outline-none focus:border-[#D7FF70]"
                      >
                        <option value="VIEWER">VIEWER (Read-Only Dashboards &amp; Telemetry)</option>
                        <option value="EDITOR">EDITOR (Can Authorize HITL Approvals &amp; Test Lab)</option>
                      </select>
                    </div>
                    <p className="text-[11px] text-[#8E929C]">
                      Administrative roles (<code className="text-[#D7FF70]">ADMIN</code>, <code className="text-[#D7FF70]">OWNER</code>) cannot be assigned by default.
                    </p>
                  </div>

                  {/* Require Email Verification */}
                  <div className="p-5 rounded-2xl bg-[#121316] border border-white/[0.04] space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-white">Require Email Verification</h3>
                        <p className="text-xs text-[#8E929C] mt-1">
                          Enforce verification tokens delivered via SMTP before newly registered users can initiate active sessions.
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                        <input
                          type="checkbox"
                          checked={authSettings.requireEmailVerification}
                          onChange={(e) =>
                            setAuthSettings({
                              ...authSettings,
                              requireEmailVerification: e.target.checked,
                            })
                          }
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-[#262830] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#D7FF70]"></div>
                      </label>
                    </div>
                    <div className="pt-2 text-[11px] text-[#8E929C]">
                      Requires configured SMTP credentials in environment (<code className="text-white/80">SMTP_HOST</code>).
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-white/[0.06]">
                  <div className="text-xs text-[#8E929C]">
                    {authSettings.updatedAt && (
                      <span>Last updated: {new Date(authSettings.updatedAt).toLocaleString()}</span>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={savingAuthSettings}
                    className="px-6 py-3 rounded-full bg-[#D7FF70] hover:bg-[#c4f250] text-[#0E1400] text-xs font-bold transition-all shadow-[0_2px_12px_rgba(215,255,112,0.25)] flex items-center justify-center gap-2 btn-press disabled:opacity-50 min-h-[44px]"
                  >
                    {savingAuthSettings ? (
                      <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    <span>Save Registration Policies</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 2: ACCOUNT & SECURITY (FOR AUTHENTICATED USER) */}
        {activeTab === 'account' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Reviewer Profile Card */}
            <div className="p-6 sm:p-8 rounded-[28px] bg-[#1C1E24] border border-white/[0.08] space-y-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#D7FF70]/15 text-[#D7FF70] flex items-center justify-center font-bold text-sm">
                    {authReviewer?.name ? authReviewer.name.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white">{authReviewer?.name || 'Operator Session'}</h2>
                    <p className="text-xs text-[#8E929C]">Active supervisor profile &amp; privileges</p>
                  </div>
                </div>

                <button
                  onClick={logout}
                  className="px-4 py-2 min-h-[38px] rounded-full bg-[#121316] border border-white/[0.08] hover:border-[#FF6B6B]/50 hover:bg-[#FF6B6B]/10 text-xs font-semibold text-[#FF6B6B] transition-colors flex items-center gap-1.5 btn-press"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Revoke Session</span>
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-[#121316] border border-white/[0.04] space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#8E929C]">Username:</span>
                  <span className="font-mono text-[#D7FF70]">{authReviewer?.username}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#8E929C]">Email Address:</span>
                  <span className="text-white font-mono">{authReviewer?.email || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#8E929C]">Role Assignment:</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#8C7CFF]/15 text-[#8C7CFF] font-bold text-[10px]">
                    {authReviewer?.role}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#8E929C]">Session Status:</span>
                  <span className="text-[#D7FF70] font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Active &bull; Validated</span>
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] space-y-2 text-xs text-[#8E929C]">
                <div className="flex items-center gap-2 text-white font-semibold">
                  <Shield className="w-4 h-4 text-[#D7FF70]" />
                  <span>Session Security Guarantee</span>
                </div>
                <p className="leading-relaxed text-[11px]">
                  Sessions are issued with HttpOnly, SameSite=Lax cryptographic session cookies and encrypted tokens. Passwords and authentication secrets are never retained in browser local storage or plaintext system logs.
                </p>
              </div>
            </div>

            {/* Change Password Form */}
            <div className="p-6 sm:p-8 rounded-[28px] bg-[#1C1E24] border border-white/[0.08] space-y-6 shadow-xl">
              <div className="border-b border-white/[0.06] pb-4">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Key className="w-4 h-4 text-[#D7FF70]" />
                  <span>Change Password</span>
                </h2>
                <p className="text-xs text-[#8E929C] mt-0.5">
                  Update your operator password. Existing active sessions will be automatically rotated.
                </p>
              </div>

              {passwordMessage && (
                <div
                  className={`p-3.5 rounded-2xl flex items-center justify-between gap-3 text-xs font-semibold ${
                    passwordMessage.type === 'success'
                      ? 'bg-[#D7FF70]/15 text-[#D7FF70] border border-[#D7FF70]/30'
                      : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {passwordMessage.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{passwordMessage.text}</span>
                  </div>
                  <button onClick={() => setPasswordMessage(null)} className="p-1 hover:opacity-75">
                    &times;
                  </button>
                </div>
              )}

              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#8E929C] uppercase tracking-wider">
                    Current Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#8E929C] absolute left-3.5 top-3.5" />
                    <input
                      type="password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-[#121316] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-[#D7FF70]"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#8E929C] uppercase tracking-wider">
                    New Master Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#8E929C] absolute left-3.5 top-3.5" />
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-[#121316] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-[#D7FF70]"
                    />
                  </div>
                </div>

                {/* Password Strength Checklist */}
                <div className="p-3.5 rounded-2xl bg-[#121316] border border-white/[0.04] space-y-2">
                  <span className="text-[10px] text-[#8E929C] uppercase tracking-wider font-semibold block">
                    Password Security Criteria
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className={`flex items-center gap-1.5 ${hasMinLength ? 'text-[#D7FF70]' : 'text-[#8E929C]'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${hasMinLength ? 'bg-[#D7FF70]' : 'bg-[#8E929C]/40'}`} />
                      <span>8+ characters</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${hasUppercase ? 'text-[#D7FF70]' : 'text-[#8E929C]'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${hasUppercase ? 'bg-[#D7FF70]' : 'bg-[#8E929C]/40'}`} />
                      <span>1+ uppercase (A-Z)</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${hasLowercase ? 'text-[#D7FF70]' : 'text-[#8E929C]'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${hasLowercase ? 'bg-[#D7FF70]' : 'bg-[#8E929C]/40'}`} />
                      <span>1+ lowercase (a-z)</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${hasNumberOrSpecial ? 'text-[#D7FF70]' : 'text-[#8E929C]'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${hasNumberOrSpecial ? 'bg-[#D7FF70]' : 'bg-[#8E929C]/40'}`} />
                      <span>1+ number or symbol</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#8E929C] uppercase tracking-wider">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#8E929C] absolute left-3.5 top-3.5" />
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-[#121316] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-[#D7FF70]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={passwordSaving || !isPasswordValid || newPassword !== confirmPassword}
                  className="w-full py-3 rounded-full bg-[#D7FF70] hover:bg-[#c4f250] text-[#0E1400] text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5 btn-press disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
                >
                  {passwordSaving ? (
                    <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Key className="w-4 h-4" />
                  )}
                  <span>Update Master Password</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 3: GATEWAY & INFRASTRUCTURE */}
        {activeTab === 'gateway' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* PayPal Sandbox Adapter Configuration */}
            <div className="p-6 rounded-[24px] bg-[#1C1E24] border border-white/[0.08] space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#8C7CFF]/15 text-[#8C7CFF] flex items-center justify-center">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">PayPal Sandbox Gateway</h2>
                  <p className="text-xs text-[#8E929C]">Guarded Sandbox adapter configuration</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#121316] border border-white/[0.04] space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#8E929C]">Target Environment:</span>
                  <span className="font-bold text-white uppercase">SANDBOX (Live Strictly Prohibited)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#8E929C]">Endpoint Base URL:</span>
                  <span className="font-mono text-white/80">https://api-m.sandbox.paypal.com</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#8E929C]">Client ID:</span>
                  <span className="font-mono text-[#D7FF70]">AY38...k91P (Masked)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#8E929C]">Client Secret:</span>
                  <span className="font-mono text-white/60 flex items-center gap-1">
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>•••••••••••••••• (Scrubbed)</span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#8E929C]">Live Sandbox Execution:</span>
                  <span className="px-2 py-0.5 rounded-full bg-white/[0.08] text-white/80 font-mono text-[10px]">
                    false (Guarded Dry-Run)
                  </span>
                </div>
              </div>
            </div>

            {/* OpenRouter AI Risk Classifier */}
            <div className="p-6 rounded-[24px] bg-[#1C1E24] border border-white/[0.08] space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#8C7CFF]/15 text-[#8C7CFF] flex items-center justify-center">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">AI Risk Analyzer (Advisory Layer)</h2>
                  <p className="text-xs text-[#8E929C]">Auxiliary semantic scoring and prompt classifier</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#121316] border border-white/[0.04] space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#8E929C]">AI Provider:</span>
                  <span className="font-bold text-white">OpenRouter API</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#8E929C]">Target Model:</span>
                  <span className="font-mono text-[#8C7CFF]">anthropic/claude-3.5-sonnet</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#8E929C]">Base URL:</span>
                  <span className="font-mono text-white/80">https://openrouter.ai/api/v1</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#8E929C]">Authority Boundary:</span>
                  <span className="text-[#D7FF70] font-semibold">Strictly Advisory (Non-Authoritative)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#8E929C]">API Key Status:</span>
                  <span className="font-mono text-white/60 flex items-center gap-1">
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>sk-or-v1-•••••••• (Never exposed)</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Database & Infrastructure */}
            <div className="p-6 rounded-[24px] bg-[#1C1E24] border border-white/[0.08] space-y-4 lg:col-span-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#D7FF70]/15 text-[#D7FF70] flex items-center justify-center">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Database &amp; Durability</h2>
                  <p className="text-xs text-[#8E929C]">PostgreSQL 16 &bull; Drizzle ORM Schema Migrations</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#121316] border border-white/[0.04] space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#8E929C]">Engine:</span>
                  <span className="font-bold text-white">PostgreSQL 16 Alpine</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#8E929C]">Drizzle Migrations:</span>
                  <span className="font-mono text-[#D7FF70]">0002_auth_settings.sql (Applied)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#8E929C]">Row-Level Locking:</span>
                  <span className="text-white font-semibold">FOR UPDATE (Concurrency-safe admin setup &amp; spend limits)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#8E929C]">Schema Sanitization:</span>
                  <span className="text-[#D7FF70] font-semibold">Active Recursive Redaction</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
