'use client';

import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Shield,
  Save,
  History,
  Check,
  AlertTriangle,
  Plus,
  Trash2,
  Lock,
  RefreshCw,
  Clock,
  ArrowRight,
  Info,
} from 'lucide-react';
import { Navigation } from '../../components/Navigation';
import { AuthGuard, useAuth } from '../../components/AuthGuard';
import { fetchActivePolicy, fetchPolicyHistory, updatePolicy } from '../../lib/api';
import { PolicyDefinition } from '../../types';

export default function PoliciesPage() {
  return (
    <AuthGuard>
      <PoliciesContent />
    </AuthGuard>
  );
}

function PoliciesContent() {
  const { isOwnerOrAdmin } = useAuth();
  const [activePolicy, setActivePolicy] = useState<PolicyDefinition | null>(null);
  const [history, setHistory] = useState<PolicyDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Form State
  const [maxAmount, setMaxAmount] = useState<number>(50.0);
  const [maxDailyAmount, setMaxDailyAmount] = useState<number>(200.0);
  const [approvalThreshold, setApprovalThreshold] = useState<number>(25.0);
  const [allowedCurrencies, setAllowedCurrencies] = useState<string>('USD, EUR, GBP');
  const [blockedMerchants, setBlockedMerchants] = useState<string[]>(['hacker@blackhat.com', 'fraudulent-vendor@example.com']);
  const [newBlockedMerchant, setNewBlockedMerchant] = useState('');
  const [velocityLimit, setVelocityLimit] = useState<number>(10);

  const loadPolicy = async () => {
    try {
      const [activeRes, histRes] = await Promise.all([
        fetchActivePolicy('default').catch(() => null),
        fetchPolicyHistory('default').catch(() => null),
      ]);

      if (activeRes?.policy) {
        const p = activeRes.policy;
        setActivePolicy(p);
        setMaxAmount(Number(p.maxAmountCents) / 100);
        setMaxDailyAmount(Number(p.maxDailyAmountCents) / 100);
        setApprovalThreshold(Number(p.approvalThresholdCents) / 100);
        setAllowedCurrencies((p.allowedCurrencies || []).join(', '));
        setBlockedMerchants(p.blockedMerchants || []);
        setVelocityLimit(p.velocityLimit || 10);
      }

      if (histRes?.history) {
        setHistory(histRes.history);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPolicy();
  }, []);

  const handleAddBlockedMerchant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBlockedMerchant.trim()) return;
    if (blockedMerchants.includes(newBlockedMerchant.trim())) return;
    setBlockedMerchants([...blockedMerchants, newBlockedMerchant.trim()]);
    setNewBlockedMerchant('');
  };

  const handleRemoveBlockedMerchant = (email: string) => {
    setBlockedMerchants(blockedMerchants.filter((m) => m !== email));
  };

  const handleSavePolicy = async () => {
    setIsSaving(true);
    setNotification(null);
    try {
      const currencies = allowedCurrencies
        .split(',')
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);

      const res = await updatePolicy({
        policyId: 'default',
        maxAmount,
        maxDailyAmount,
        approvalThreshold,
        allowedCurrencies: currencies,
        blockedMerchants,
        velocityLimit,
      });

      setNotification({
        message: `Policy successfully published as Version ${res.policy.version}!`,
        type: 'success',
      });
      await loadPolicy();
    } catch (err) {
      setNotification({
        message: (err as Error).message || 'Failed to update policy',
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111215] text-[#F4F4F5]">
      <Navigation />

      <main className="max-w-[1600px] mx-auto px-4 lg:px-8 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Deterministic Policy Management
              </h1>
              {activePolicy && (
                <span className="px-3 py-1 rounded-full bg-[#D7FF70] text-[#0E1400] text-xs font-bold shadow-sm">
                  Active Version: v{activePolicy.version}
                </span>
              )}
            </div>
            <p className="text-xs text-[#8E929C] mt-1">
              Authoritative financial caps, rolling daily limits, recipient denylists, and HITL thresholds
            </p>
          </div>

          <button
            onClick={handleSavePolicy}
            disabled={isSaving || !isOwnerOrAdmin}
            title={!isOwnerOrAdmin ? 'Only administrators and owners can update policies' : undefined}
            id="save-policy-btn"
            className="w-full sm:w-auto px-6 py-3 rounded-full bg-[#D7FF70] hover:bg-[#C4F250] text-[#0E1400] text-xs font-bold transition-all shadow-[0_2px_14px_rgba(215,255,112,0.25)] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed btn-press touch-manipulation min-h-[44px]"
          >
            {isSaving ? (
              <span className="inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin shrink-0" />
            ) : (
              <Save className="w-4 h-4 shrink-0" />
            )}
            <span>Publish New Policy Version</span>
          </button>
        </div>

        {/* Read-Only Notice for Non-Admins */}
        {!isOwnerOrAdmin && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 text-xs text-amber-300">
            <Info className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              <strong>Read-Only Mode:</strong> Modifying deterministic gateway policies requires Administrator or Owner permissions. You have read-only inspection access.
            </span>
          </div>
        )}

        {/* Notification Toast */}
        {notification && (
          <div
            className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-xs font-semibold ${
              notification.type === 'success'
                ? 'bg-[#D7FF70]/15 text-[#D7FF70] border border-[#D7FF70]/30'
                : 'bg-[#FF6B6B]/15 text-[#FF6B6B] border border-[#FF6B6B]/30'
            }`}
          >
            <span>{notification.message}</span>
            <button onClick={() => setNotification(null)} className="p-1 hover:opacity-75">
              &times;
            </button>
          </div>
        )}

        {/* Policy Editor Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Controls (2 Cols) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Numeric Caps & Thresholds */}
            <div className="p-6 rounded-[24px] bg-[#1C1E24] border border-white/[0.08] space-y-5">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#D7FF70]" />
                <span>Financial Ceilings &amp; HITL Approval Gates</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Max Single Transaction */}
                <div className="p-4 rounded-2xl bg-[#121316] border border-white/[0.06] space-y-2">
                  <label className="text-[11px] font-semibold text-[#8E929C] uppercase tracking-wider block">
                    Max Single Transaction ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={maxAmount}
                    onChange={(e) => setMaxAmount(parseFloat(e.target.value) || 0)}
                    className="w-full bg-transparent text-xl font-bold font-mono text-white focus:outline-none"
                  />
                  <p className="text-[10px] text-[#6E7380]">
                    Hard block if exceeded
                  </p>
                </div>

                {/* Daily Spend Limit */}
                <div className="p-4 rounded-2xl bg-[#121316] border border-white/[0.06] space-y-2">
                  <label className="text-[11px] font-semibold text-[#8E929C] uppercase tracking-wider block">
                    Rolling 24h Spend ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={maxDailyAmount}
                    onChange={(e) => setMaxDailyAmount(parseFloat(e.target.value) || 0)}
                    className="w-full bg-transparent text-xl font-bold font-mono text-white focus:outline-none"
                  />
                  <p className="text-[10px] text-[#6E7380]">
                    Per-agent daily cap
                  </p>
                </div>

                {/* HITL Approval Threshold */}
                <div className="p-4 rounded-2xl bg-[#121316] border border-[#D7FF70]/30 space-y-2">
                  <label className="text-[11px] font-semibold text-[#D7FF70] uppercase tracking-wider block">
                    HITL Approval Threshold ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={approvalThreshold}
                    onChange={(e) => setApprovalThreshold(parseFloat(e.target.value) || 0)}
                    className="w-full bg-transparent text-xl font-bold font-mono text-[#D7FF70] focus:outline-none"
                  />
                  <p className="text-[10px] text-[#8E929C]">
                    Enqueues for human approval
                  </p>
                </div>
              </div>

              {/* Currency & Velocity Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-white block">
                    Allowed ISO Currencies (Comma Separated)
                  </label>
                  <input
                    type="text"
                    value={allowedCurrencies}
                    onChange={(e) => setAllowedCurrencies(e.target.value)}
                    className="w-full p-3 rounded-2xl bg-[#121316] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#D7FF70]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-white block">
                    Velocity Rate Limit (Max Requests / Hour)
                  </label>
                  <input
                    type="number"
                    value={velocityLimit}
                    onChange={(e) => setVelocityLimit(parseInt(e.target.value) || 10)}
                    className="w-full p-3 rounded-2xl bg-[#121316] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#D7FF70]"
                  />
                </div>
              </div>
            </div>

            {/* Blocked Merchants / Denylist */}
            <div className="p-6 rounded-[24px] bg-[#1C1E24] border border-white/[0.08] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white">Merchant &amp; Recipient Denylist</h2>
                  <p className="text-xs text-[#8E929C] mt-0.5">
                    Transactions to these email addresses or domains are unconditionally blocked
                  </p>
                </div>
                <span className="text-xs font-bold text-[#FF6B6B] px-2.5 py-1 rounded-full bg-[#FF6B6B]/15">
                  {blockedMerchants.length} Blocked
                </span>
              </div>

              {/* Add form (Responsive flex-col on mobile, flex-row on sm) */}
              <form onSubmit={handleAddBlockedMerchant} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newBlockedMerchant}
                  onChange={(e) => setNewBlockedMerchant(e.target.value)}
                  placeholder="Enter email or merchant domain (e.g. rogue@vendor.io)..."
                  className="flex-1 min-w-0 p-3 rounded-2xl bg-[#121316] border border-white/[0.08] text-xs text-white placeholder-[#6E7380] focus:outline-none focus:border-[#FF6B6B] transition-colors"
                />
                <button
                  type="submit"
                  className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-[#FF6B6B] hover:bg-[#FF5252] text-xs font-bold text-white transition-colors flex items-center justify-center gap-1.5 btn-press shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>Block Domain</span>
                </button>
              </form>

              {/* List */}
              <div className="space-y-2 pt-2">
                {blockedMerchants.map((merchant) => (
                  <div
                    key={merchant}
                    className="p-3 rounded-2xl bg-[#121316] border border-white/[0.04] flex items-center justify-between text-xs"
                  >
                    <span className="font-mono text-white/90">{merchant}</span>
                    <button
                      onClick={() => handleRemoveBlockedMerchant(merchant)}
                      aria-label={`Unblock ${merchant}`}
                      className="p-1.5 text-[#8E929C] hover:text-[#FF6B6B] transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Policy Version History */}
          <div className="space-y-6">
            <div className="p-6 rounded-[24px] bg-[#1C1E24] border border-white/[0.08] space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-[#8C7CFF]" />
                  <span>Policy Version History</span>
                </h2>
                <span className="text-xs text-[#8E929C]">
                  {history.length} Versions
                </span>
              </div>

              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {history.length === 0 ? (
                  <div className="p-4 text-xs text-[#8E929C] text-center">
                    Version 1 is currently active.
                  </div>
                ) : (
                  history.map((v) => {
                    const isActive = v.isActive || v.version === activePolicy?.version;

                    return (
                      <div
                        key={v.id || v.version}
                        className={`p-4 rounded-2xl border transition-all ${
                          isActive
                            ? 'bg-[#D7FF70]/10 border-[#D7FF70]/40'
                            : 'bg-[#121316] border-white/[0.04]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold font-mono text-white">
                              Version {v.version}
                            </span>
                            {isActive && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#D7FF70] text-[#0E1400]">
                                Current
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-[#6E7380] font-mono">
                            {v.createdAt ? new Date(v.createdAt).toLocaleDateString() : 'Active'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] text-[#8E929C]">
                          <div>Max: <strong className="text-white">${(Number(v.maxAmountCents) / 100).toFixed(2)}</strong></div>
                          <div>HITL: <strong className="text-white">${(Number(v.approvalThresholdCents) / 100).toFixed(2)}</strong></div>
                          <div>Daily: <strong className="text-white">${(Number(v.maxDailyAmountCents) / 100).toFixed(2)}</strong></div>
                          <div>Blocked: <strong className="text-white">{v.blockedMerchants?.length || 0}</strong></div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
