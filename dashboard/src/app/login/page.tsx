'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, Lock, User, Mail, AlertCircle, ArrowRight, UserPlus, CheckCircle2 } from 'lucide-react';
import { loginReviewer, fetchSetupStatus, fetchAuthSettings, registerPublicUser } from '../../lib/api';

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#111215] flex items-center justify-center p-4">
          <div className="w-6 h-6 border-2 border-[#D7FF70] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/';

  // Mode: 'signin' | 'signup'
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  // Sign In Form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sign Up Form (when allowPublicSignup = true)
  const [signupName, setSignupName] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');

  // Status & Settings
  const [setupRequired, setSetupRequired] = useState(false);
  const [allowPublicSignup, setAllowPublicSignup] = useState(false);

  useEffect(() => {
    async function checkState() {
      try {
        const setupRes = await fetchSetupStatus().catch(() => ({ isSetupRequired: false }));
        if (setupRes.isSetupRequired) {
          setSetupRequired(true);
        }
        const authRes = await fetchAuthSettings().catch(() => null);
        if (authRes?.settings?.allowPublicSignup) {
          setAllowPublicSignup(true);
        }
      } catch {}
    }
    checkState();
  }, []);

  // Password Policy Checks for Registration
  const hasMinLength = signupPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(signupPassword);
  const hasLowercase = /[a-z]/.test(signupPassword);
  const hasNumberOrSpecial = /[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(signupPassword);
  const isPasswordValid = hasMinLength && hasUppercase && hasLowercase && hasNumberOrSpecial;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError('Please provide your username/email and password.');
      return;
    }

    try {
      setLoading(true);
      await loginReviewer(username.trim(), password);
      router.push(redirectPath);
    } catch (err: any) {
      setError(err.message || 'Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!signupName.trim() || !signupUsername.trim() || !signupEmail.trim()) {
      setError('Please complete all required fields.');
      return;
    }
    if (!isPasswordValid) {
      setError('Password must be at least 8 characters and include uppercase, lowercase, and a number or symbol.');
      return;
    }
    if (signupPassword !== signupConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      await registerPublicUser({
        name: signupName.trim(),
        username: signupUsername.trim(),
        email: signupEmail.trim(),
        password: signupPassword,
      });
      router.push(redirectPath);
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please contact the administrator.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111215] flex items-center justify-center p-4 sm:p-6 text-white font-sans">
      <div className="w-full max-w-md bg-[#1C1E24] border border-white/[0.08] rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
        {/* Logo and Greeting */}
        <div className="space-y-2 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#D7FF70]/15 text-[#D7FF70] mb-2 border border-[#D7FF70]/30 shadow-[0_0_20px_rgba(215,255,112,0.15)]">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            {mode === 'signin' ? 'Sign In to AgentGuard' : 'Create Operator Account'}
          </h1>
          <p className="text-xs sm:text-sm text-[#8E929C]">
            Autonomous AI-agent payment defense &amp; security console
          </p>
        </div>

        {setupRequired && (
          <div className="p-3.5 rounded-2xl bg-[#D7FF70]/10 border border-[#D7FF70]/30 text-[#D7FF70] text-xs flex items-center justify-between gap-3">
            <span>First-run setup is required for this installation.</span>
            <Link
              href="/setup"
              className="px-3 py-1.5 rounded-full bg-[#D7FF70] text-[#0E1400] font-bold text-[11px] hover:bg-[#c4f250] transition-colors btn-press shrink-0"
            >
              Start Setup
            </Link>
          </div>
        )}

        {/* Tab switch between Sign In and Sign Up if public signup is permitted */}
        {allowPublicSignup && (
          <div className="flex rounded-2xl bg-[#121316] p-1 border border-white/[0.06]">
            <button
              onClick={() => {
                setMode('signin');
                setError(null);
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                mode === 'signin'
                  ? 'bg-[#1C1E24] text-white shadow-sm border border-white/[0.08]'
                  : 'text-[#8E929C] hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                mode === 'signup'
                  ? 'bg-[#1C1E24] text-white shadow-sm border border-white/[0.08]'
                  : 'text-[#8E929C] hover:text-white'
              }`}
            >
              Register Account
            </button>
          </div>
        )}

        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {mode === 'signin' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#8E929C] uppercase tracking-wider">
                Username or Email
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#8E929C] absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="username or email"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#121316] border border-white/[0.08] text-white text-xs sm:text-sm focus:outline-none focus:border-[#D7FF70] transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#8E929C] uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#8E929C] absolute left-3.5 top-3.5" />
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#121316] border border-white/[0.08] text-white text-xs sm:text-sm focus:outline-none focus:border-[#D7FF70] transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-6 rounded-full bg-[#D7FF70] text-[#0E1400] text-sm font-bold hover:bg-[#c4f250] transition-all flex items-center justify-center gap-2 btn-press disabled:opacity-50 min-h-[46px] mt-2 shadow-[0_2px_12px_rgba(215,255,112,0.25)]"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#0E1400] border-t-transparent rounded-full animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#8E929C] uppercase tracking-wider">
                Full Name
              </label>
              <input
                type="text"
                required
                placeholder="Alex Vance"
                value={signupName}
                onChange={(e) => setSignupName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl bg-[#121316] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-[#D7FF70]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#8E929C] uppercase tracking-wider">
                  Username
                </label>
                <input
                  type="text"
                  required
                  placeholder="avance"
                  value={signupUsername}
                  onChange={(e) => setSignupUsername(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-[#121316] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-[#D7FF70]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#8E929C] uppercase tracking-wider">
                  Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="alex@org.io"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-[#121316] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-[#D7FF70]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#8E929C] uppercase tracking-wider">
                Password (min. 8 chars)
              </label>
              <input
                type="password"
                required
                placeholder="••••••••••••"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl bg-[#121316] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-[#D7FF70]"
              />
            </div>

            {signupPassword && (
              <div className="p-3 rounded-xl bg-[#121316] border border-white/[0.04] space-y-1.5">
                <span className="text-[10px] text-[#8E929C] uppercase tracking-wider font-semibold block">
                  Password Policy
                </span>
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <div className={`flex items-center gap-1.5 ${hasMinLength ? 'text-[#D7FF70]' : 'text-[#8E929C]'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${hasMinLength ? 'bg-[#D7FF70]' : 'bg-[#8E929C]/40'}`} />
                    <span>8+ characters</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${hasUppercase ? 'text-[#D7FF70]' : 'text-[#8E929C]'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${hasUppercase ? 'bg-[#D7FF70]' : 'bg-[#8E929C]/40'}`} />
                    <span>1+ uppercase</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${hasLowercase ? 'text-[#D7FF70]' : 'text-[#8E929C]'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${hasLowercase ? 'bg-[#D7FF70]' : 'bg-[#8E929C]/40'}`} />
                    <span>1+ lowercase</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${hasNumberOrSpecial ? 'text-[#D7FF70]' : 'text-[#8E929C]'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${hasNumberOrSpecial ? 'bg-[#D7FF70]' : 'bg-[#8E929C]/40'}`} />
                    <span>1+ symbol/digit</span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#8E929C] uppercase tracking-wider">
                Confirm Password
              </label>
              <input
                type="password"
                required
                placeholder="••••••••••••"
                value={signupConfirmPassword}
                onChange={(e) => setSignupConfirmPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl bg-[#121316] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-[#D7FF70]"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !isPasswordValid || signupPassword !== signupConfirmPassword}
              className="w-full py-3.5 px-6 rounded-full bg-[#D7FF70] text-[#0E1400] text-sm font-bold hover:bg-[#c4f250] transition-all flex items-center justify-center gap-2 btn-press disabled:opacity-50 min-h-[46px] shadow-[0_2px_12px_rgba(215,255,112,0.25)]"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#0E1400] border-t-transparent rounded-full animate-spin" />
                  <span>Registering...</span>
                </>
              ) : (
                <>
                  <span>Create Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        <div className="pt-2 text-center text-xs text-[#8E929C] border-t border-white/[0.06]">
          {!allowPublicSignup ? (
            <span>Self-hosted node &bull; Public sign-up is disabled by default.</span>
          ) : (
            <span>Self-hosted node &bull; Public registration active.</span>
          )}
        </div>
      </div>
    </div>
  );
}
