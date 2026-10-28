'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, Lock, User, UserCheck, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { acceptUserInvite } from '../../lib/api';

function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="w-full max-w-md bg-[#222222] border border-white/[0.08] rounded-3xl p-8 text-center space-y-4 shadow-2xl">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/15 text-rose-400 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-white">Missing Invitation Token</h1>
        <p className="text-sm text-[#8E929C]">
          This link is missing an invitation secret. Please check the invitation URL provided by your administrator.
        </p>
      </div>
    );
  }

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError('Please provide your name.');
      return;
    }
    if (formData.username.trim().length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      await acceptUserInvite({
        inviteToken: token,
        name: formData.name.trim(),
        username: formData.username.trim(),
        password: formData.password,
      });
      setSuccess(true);
      setTimeout(() => {
        router.push('/');
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to activate invitation. The link may have expired or already been used.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-[#222222] border border-white/[0.08] rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
      <div className="space-y-2 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#D7FF70]/15 text-[#D7FF70] mb-2 border border-[#D7FF70]/30">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white">
          Join AgentGuard Node
        </h1>
        <p className="text-xs sm:text-sm text-[#8E929C]">
          Complete your profile to accept your invitation and activate your account.
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}

      {success ? (
        <div className="p-6 rounded-2xl bg-[#D7FF70]/10 border border-[#D7FF70]/20 text-center space-y-3">
          <CheckCircle2 className="w-8 h-8 text-[#D7FF70] mx-auto animate-bounce" />
          <h2 className="text-base font-bold text-white">Account Successfully Activated!</h2>
          <p className="text-xs text-[#8E929C]">
            Logging you in to the security console...
          </p>
        </div>
      ) : (
        <form onSubmit={handleAccept} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#8E929C] uppercase tracking-wider">
              Full Name
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-[#8E929C] absolute left-3.5 top-3.5" />
              <input
                type="text"
                required
                autoFocus
                placeholder="e.g. Jordan Smith"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#171717] border border-white/[0.08] text-white text-xs sm:text-sm focus:outline-none focus:border-[#D7FF70] transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#8E929C] uppercase tracking-wider">
              Username
            </label>
            <div className="relative">
              <UserCheck className="w-4 h-4 text-[#8E929C] absolute left-3.5 top-3.5" />
              <input
                type="text"
                required
                placeholder="jsmith"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#171717] border border-white/[0.08] text-white text-xs sm:text-sm focus:outline-none focus:border-[#D7FF70] transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#8E929C] uppercase tracking-wider">
              Password (min. 8 characters)
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#8E929C] absolute left-3.5 top-3.5" />
              <input
                type="password"
                required
                placeholder="••••••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#171717] border border-white/[0.08] text-white text-xs sm:text-sm focus:outline-none focus:border-[#D7FF70] transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#8E929C] uppercase tracking-wider">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#8E929C] absolute left-3.5 top-3.5" />
              <input
                type="password"
                required
                placeholder="••••••••••••"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#171717] border border-white/[0.08] text-white text-xs sm:text-sm focus:outline-none focus:border-[#D7FF70] transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-6 rounded-full bg-[#D7FF70] text-[#0E1400] text-sm font-bold hover:bg-[#c4f250] transition-all flex items-center justify-center gap-2 btn-press disabled:opacity-50 min-h-[46px] mt-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-[#0E1400] border-t-transparent rounded-full animate-spin" />
                <span>Activating Account...</span>
              </>
            ) : (
              <>
                <span>Activate Account</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <div className="min-h-screen bg-[#171717] flex items-center justify-center p-4 sm:p-6 text-white font-sans">
      <Suspense fallback={
        <div className="text-white/70 text-sm flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-[#D7FF70] border-t-transparent rounded-full animate-spin" />
          <span>Loading invitation...</span>
        </div>
      }>
        <AcceptInviteContent />
      </Suspense>
    </div>
  );
}
