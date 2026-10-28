'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, UserCheck, Lock, Mail, User, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { fetchSetupStatus, setupOwner } from '../../lib/api';

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [isSetupRequired, setIsSetupRequired] = useState<boolean | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetchSetupStatus();
        setIsSetupRequired(res.isSetupRequired);
      } catch (err) {
        // If error fetching setup status, assume setup is required on fresh start
        setIsSetupRequired(true);
      } finally {
        setChecking(false);
      }
    }
    checkStatus();
  }, []);

  const hasMinLength = formData.password.length >= 8;
  const hasUppercase = /[A-Z]/.test(formData.password);
  const hasLowercase = /[a-z]/.test(formData.password);
  const hasNumberOrSpecial = /[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(formData.password);
  const isPasswordValid = hasMinLength && hasUppercase && hasLowercase && hasNumberOrSpecial;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError('Please provide your full name.');
      return;
    }
    if (formData.username.trim().length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }
    if (!formData.email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!isPasswordValid) {
      setError('Password must be at least 8 characters and include uppercase, lowercase, and a number or symbol.');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setSubmitting(true);
      await setupOwner({
        name: formData.name.trim(),
        username: formData.username.trim(),
        email: formData.email.trim(),
        password: formData.password,
      });
      setSuccess(true);
      setTimeout(() => {
        router.push('/');
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to complete initial setup.');
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#171717] flex items-center justify-center p-4">
        <div className="flex items-center gap-3 text-white/70 text-sm font-medium">
          <div className="w-5 h-5 border-2 border-[#D7FF70] border-t-transparent rounded-full animate-spin" />
          <span>Checking installation status...</span>
        </div>
      </div>
    );
  }

  if (isSetupRequired === false) {
    return (
      <div className="min-h-screen bg-[#171717] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#222222] border border-white/[0.08] rounded-3xl p-8 text-center space-y-6 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-[#D7FF70]/10 border border-[#D7FF70]/20 flex items-center justify-center mx-auto text-[#D7FF70]">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Setup Already Completed</h1>
            <p className="text-sm text-[#8E929C] leading-relaxed">
              This AgentGuard installation has already been initialized with a primary owner account. Unauthenticated setup is permanently closed.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 w-full px-5 py-3 rounded-full bg-[#D7FF70] text-[#0E1400] text-sm font-bold hover:bg-[#c4f250] transition-colors btn-press min-h-[44px]"
            >
              <span>Go to Sign In</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#171717] flex items-center justify-center p-4 sm:p-6 text-white font-sans">
      <div className="w-full max-w-lg bg-[#222222] border border-white/[0.08] rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
        {/* Header Branding */}
        <div className="space-y-2 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#D7FF70]/15 text-[#D7FF70] mb-2 border border-[#D7FF70]/30">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Initial Installation Setup
          </h1>
          <p className="text-xs sm:text-sm text-[#8E929C] max-w-sm mx-auto">
            Create the primary <strong className="text-white font-semibold">Owner</strong> account to initialize this self-hosted AgentGuard defense node.
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
            <h2 className="text-base font-bold text-white">Owner Account Initialized!</h2>
            <p className="text-xs text-[#8E929C]">
              Redirecting you to the security dashboard...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#8E929C] uppercase tracking-wider">
                Full Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#8E929C] absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex Vance"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#171717] border border-white/[0.08] text-white text-xs sm:text-sm focus:outline-none focus:border-[#D7FF70] transition-colors"
                />
              </div>
            </div>

            {/* Username & Email Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#8E929C] uppercase tracking-wider">
                  Username
                </label>
                <div className="relative">
                  <UserCheck className="w-4 h-4 text-[#8E929C] absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    required
                    placeholder="sysadmin"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#171717] border border-white/[0.08] text-white text-xs sm:text-sm focus:outline-none focus:border-[#D7FF70] transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#8E929C] uppercase tracking-wider">
                  Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#8E929C] absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    required
                    placeholder="admin@org.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#171717] border border-white/[0.08] text-white text-xs sm:text-sm focus:outline-none focus:border-[#D7FF70] transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#8E929C] uppercase tracking-wider">
                Master Password (min. 8 characters)
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

              {/* Password Strength Criteria Checklist */}
              {formData.password && (
                <div className="p-3 rounded-xl bg-[#121316] border border-white/[0.04] space-y-1.5 mt-2">
                  <span className="text-[10px] text-[#8E929C] uppercase tracking-wider font-semibold block">
                    Security Policy Criteria
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
              )}
            </div>

            {/* Confirm Password */}
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

            <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-[11px] text-[#8E929C] leading-relaxed">
              <strong className="text-white">Security Notice:</strong> The Owner account has unconstrained administrative control over security policies, integrations, users, and audit records. Once created, the initial setup endpoint permanently locks.
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 px-6 rounded-full bg-[#D7FF70] text-[#0E1400] text-sm font-bold hover:bg-[#c4f250] transition-all flex items-center justify-center gap-2 btn-press disabled:opacity-50 min-h-[46px]"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#0E1400] border-t-transparent rounded-full animate-spin" />
                  <span>Creating Primary Owner...</span>
                </>
              ) : (
                <>
                  <span>Create Primary Owner Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
