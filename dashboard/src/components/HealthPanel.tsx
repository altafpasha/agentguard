'use client';

import React from 'react';
import Link from 'next/link';
import { Server, Database, ShieldAlert, Cpu, CheckCircle2, AlertCircle, RefreshCw, ArrowUpRight } from 'lucide-react';
import { SystemHealthStatus } from '../types';

interface HealthPanelProps {
  health?: SystemHealthStatus;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export function HealthPanel({ health, onRefresh, isLoading = false }: HealthPanelProps) {
  const formatUptime = (seconds?: number) => {
    if (!seconds && seconds !== 0) return '0m';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  };

  return (
    <div className="bg-[#222222] border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white/[0.06] flex items-center justify-center text-[#D7FF70]">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight">
              Gateway Service Health
            </h3>
            <p className="text-[11px] text-[#8E929C]">
              Continuous connectivity &amp; runtime verification
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/integrations"
            className="flex items-center gap-1 text-xs font-semibold text-[#8E929C] hover:text-[#D7FF70] transition-colors pr-2 hidden sm:flex"
          >
            <span>All Integrations</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 min-h-[36px] rounded-full bg-[#171717] border border-white/[0.08] hover:border-[#D7FF70]/50 text-xs text-[#8E929C] hover:text-[#D7FF70] transition-colors btn-press touch-manipulation shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isLoading ? 'animate-spin text-[#D7FF70]' : ''}`} />
              <span>Check</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid of 4 Health Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-stretch">
        {/* 1. Gateway */}
        <div className="p-4 rounded-2xl bg-[#171717] border border-white/[0.04] space-y-2 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#8E929C]">Core Gateway</span>
            <Cpu className="w-4 h-4 text-[#D7FF70]" />
          </div>
          <div className="flex items-center gap-2">
            {health?.gateway?.status === 'healthy' ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-sm font-bold text-white">Online</span>
              </>
            ) : health?.gateway?.status === 'degraded' ? (
              <>
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-sm font-bold text-amber-400">Degraded</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="text-sm font-bold text-rose-400">Unavailable</span>
              </>
            )}
          </div>
          <div className="text-[11px] text-[#8E929C] font-mono">
            Uptime: {formatUptime(health?.gateway?.uptimeSeconds)} &bull; v{health?.gateway?.version || '1.0.0'}
          </div>
        </div>

        {/* 2. PostgreSQL */}
        <div className="p-4 rounded-2xl bg-[#171717] border border-white/[0.04] space-y-2 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#8E929C]">Audit Database</span>
            <Database className="w-4 h-4 text-[#8C7CFF]" />
          </div>
          <div className="flex items-center gap-2">
            {health?.database?.status === 'connected' ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-sm font-bold text-white">Connected</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="text-sm font-bold text-rose-400">Disconnected</span>
              </>
            )}
          </div>
          <div className="text-[11px] text-[#8E929C]">
            PostgreSQL 16 Durable Storage
          </div>
        </div>

        {/* 3. PayPal Sandbox */}
        <div className="p-4 rounded-2xl bg-[#171717] border border-white/[0.04] space-y-2 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#8E929C]">PayPal Sandbox</span>
            <span className="w-2 h-2 rounded-full bg-[#38BDF8]" />
          </div>
          <div className="flex items-center gap-2">
            {health?.paypal?.status === 'connected' ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-sm font-bold text-white">Sandbox Active</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-[#8E929C] shrink-0" />
                <span className="text-sm font-bold text-[#8E929C]">Standby</span>
              </>
            )}
          </div>
          <div className="text-[11px] text-[#8E929C]">
            Guarded Sandbox Mode (Live execution disabled)
          </div>
        </div>

        {/* 4. OpenRouter AI */}
        <div className="p-4 rounded-2xl bg-[#171717] border border-white/[0.04] space-y-2 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#8E929C]">OpenRouter LLM</span>
            <span className="w-2 h-2 rounded-full bg-[#F472B6]" />
          </div>
          <div className="flex items-center gap-2">
            {health?.openRouter?.status === 'active' ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-sm font-bold text-white">Connected</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-[#8E929C] shrink-0" />
                <span className="text-sm font-bold text-[#8E929C]">Standby</span>
              </>
            )}
          </div>
          <div className="text-[11px] text-[#8E929C] truncate">
            {health?.openRouter?.model || 'claude-3.5-sonnet'}
          </div>
        </div>
      </div>
    </div>
  );
}
