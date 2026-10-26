'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Shield,
  Server,
  Lock,
  User,
  LogOut,
  LogIn,
  Key,
  CheckCircle2,
  AlertCircle,
  EyeOff,
  Cpu,
  Database,
} from 'lucide-react';
import { Navigation } from '../../components/Navigation';
import {
  fetchCurrentReviewer,
  fetchSystemHealth,
  loginReviewer,
  removeSessionToken,
} from '../../lib/api';
import { ReviewerProfile, SystemHealthStatus } from '../../types';

export default function SettingsPage() {
  const [reviewer, setReviewer] = useState<ReviewerProfile | null>(null);
  const [health, setHealth] = useState<SystemHealthStatus | null>(null);

  // Login Form State
  const [username, setUsername] = useState('darlene.robertson');
  const [password, setPassword] = useState('admin123');
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    fetchCurrentReviewer().then(setReviewer).catch(() => {});
    fetchSystemHealth().then(setHealth).catch(() => {});
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginMessage(null);
    try {
      const res = await loginReviewer(username, password);
      setReviewer(res.reviewer);
      setLoginMessage('Session authenticated successfully!');
    } catch (err) {
      setLoginMessage((err as Error).message || 'Authentication failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    removeSessionToken();
    setReviewer(null);
    setLoginMessage('Reviewer session revoked.');
  };

  return (
    <div className="min-h-screen bg-[#111215] text-[#F4F4F5]">
      <Navigation />

      <main className="max-w-[1600px] mx-auto px-4 lg:px-8 py-6 space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            System &amp; Security Settings
          </h1>
          <p className="text-xs text-[#8E929C] mt-1">
            Gateway telemetry, PayPal Sandbox adapter status, AI risk classifier parameters, and authenticated reviewer sessions
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Reviewer Authentication & Identity */}
          <div className="p-6 rounded-[24px] bg-[#1C1E24] border border-white/[0.08] space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#D7FF70]/15 text-[#D7FF70] flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Reviewer Session Profile</h2>
                  <p className="text-xs text-[#8E929C]">
                    Current authenticated supervisory identity
                  </p>
                </div>
              </div>

              {reviewer && (
                <button
                  onClick={handleLogout}
                  className="px-3.5 py-1.5 rounded-full bg-[#121316] border border-white/[0.08] hover:border-[#FF6B6B]/50 hover:bg-[#FF6B6B]/10 text-xs font-semibold text-[#FF6B6B] transition-colors flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Revoke Session</span>
                </button>
              )}
            </div>

            {reviewer ? (
              <div className="space-y-3">
                <div className="p-4 rounded-2xl bg-[#121316] border border-white/[0.04] space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#8E929C]">Full Name:</span>
                    <span className="font-bold text-white">{reviewer.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#8E929C]">Username:</span>
                    <span className="font-mono text-[#D7FF70]">{reviewer.username}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#8E929C]">Authorization Role:</span>
                    <span className="px-2 py-0.5 rounded-full bg-[#8C7CFF]/15 text-[#8C7CFF] font-bold text-[10px]">
                      {reviewer.role}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#8E929C]">Session Status:</span>
                    <span className="text-[#D7FF70] font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Authenticated</span>
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#D7FF70]/10 border border-[#D7FF70]/20 text-[11px] text-white/90">
                  You are authorized to review and approve transactions exceeding the $25.00 threshold in the Approval Queue.
                </div>
              </div>
            ) : (
              <form onSubmit={handleLogin} className="space-y-3 pt-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-white block">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full p-2.5 rounded-2xl bg-[#121316] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#D7FF70]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-white block">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full p-2.5 rounded-2xl bg-[#121316] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#D7FF70]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full py-2.5 rounded-full bg-[#D7FF70] text-[#0E1400] text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Authenticate Reviewer Session</span>
                </button>

                {loginMessage && (
                  <p className="text-xs text-center text-[#D7FF70] mt-2">{loginMessage}</p>
                )}
              </form>
            )}
          </div>

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
          <div className="p-6 rounded-[24px] bg-[#1C1E24] border border-white/[0.08] space-y-4">
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
                <span className="font-mono text-[#D7FF70]">0000_overjoyed_terrax.sql (Applied)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#8E929C]">Row-Level Locking:</span>
                <span className="text-white font-semibold">FOR UPDATE (Atomic daily spend)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#8E929C]">Schema Sanitization:</span>
                <span className="text-[#D7FF70] font-semibold">Active Recursive Redaction</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
