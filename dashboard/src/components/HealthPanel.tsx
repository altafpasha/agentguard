'use client';

import React from 'react';
import { Server, Database, ShieldAlert, Cpu, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { SystemHealthStatus } from '../types';

interface HealthPanelProps {
  health?: SystemHealthStatus;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export function HealthPanel({ health, onRefresh, isLoading = false }: HealthPanelProps) {
  const defaultHealth: SystemHealthStatus = {
    gateway: { status: 'healthy', uptimeSeconds: 3600, version: '1.0.0' },
    database: { status: 'connected' },
    paypal: { environment: 'sandbox', liveExecutionAllowed: false, status: 'connected' },
    openRouter: { status: 'active', model: 'anthropic/claude-3.5-sonnet' },
  };

  const current = health || defaultHealth;

  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  return (
    <div className="bg-[#1C1E24] border border-white/[0.07] rounded-[22px] p-5 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-white/[0.06] flex items-center justify-center text-[#D7FF70]">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight">
              Gateway Service Health
            </h3>
            <p className="text-[11px] text-[#8E929C]">
              Continuous multi-tier health telemetry
            </p>
          </div>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#121316] border border-white/[0.08] hover:border-[#D7FF70]/50 text-xs text-[#8E929C] hover:text-[#D7FF70] transition-colors btn-press shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#D7FF70]' : ''}`} />
            <span>Check Now</span>
          </button>
        )}
      </div>

      {/* Grid of 4 Health Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Fastify Gateway */}
        <div className="p-3.5 rounded-2xl bg-[#121316]/60 border border-white/[0.04] flex items-start justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-[#8E929C] uppercase tracking-wider font-semibold">
              Gateway Core
            </span>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#D7FF70] animate-pulse" />
              <span className="text-xs font-bold text-white capitalize">
                {current.gateway.status}
              </span>
            </div>
            <p className="text-[10px] text-[#6E7380]">
              Uptime: {formatUptime(current.gateway.uptimeSeconds)} (v{current.gateway.version})
            </p>
          </div>
          <Server className="w-4 h-4 text-[#8E929C]" />
        </div>

        {/* 2. Audit & Postgres DB */}
        <div className="p-3.5 rounded-2xl bg-[#121316]/60 border border-white/[0.04] flex items-start justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-[#8E929C] uppercase tracking-wider font-semibold">
              Audit Database
            </span>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  current.database.status === 'connected'
                    ? 'bg-[#D7FF70]'
                    : 'bg-[#FF6B6B]'
                }`}
              />
              <span className="text-xs font-bold text-white capitalize">
                {current.database.status}
              </span>
            </div>
            <p className="text-[10px] text-[#6E7380]">
              Drizzle ORM &bull; PostgreSQL 16
            </p>
          </div>
          <Database className="w-4 h-4 text-[#8E929C]" />
        </div>

        {/* 3. PayPal Sandbox */}
        <div className="p-3.5 rounded-2xl bg-[#121316]/60 border border-white/[0.04] flex items-start justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-[#8E929C] uppercase tracking-wider font-semibold">
              PayPal Adapter
            </span>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#D7FF70]" />
              <span className="text-xs font-bold text-white capitalize">
                Sandbox Ready
              </span>
            </div>
            <p className="text-[10px] text-[#6E7380]">
              Guarded Foundation Mode
            </p>
          </div>
          <ShieldAlert className="w-4 h-4 text-[#8E929C]" />
        </div>

        {/* 4. OpenRouter AI Provider */}
        <div className="p-3.5 rounded-2xl bg-[#121316]/60 border border-white/[0.04] flex items-start justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-[#8E929C] uppercase tracking-wider font-semibold">
              AI Risk Provider
            </span>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#8C7CFF]" />
              <span className="text-xs font-bold text-white capitalize">
                Active Advisory
              </span>
            </div>
            <p className="text-[10px] text-[#6E7380] truncate max-w-[150px]">
              {current.openRouter.model.split('/')[1] || current.openRouter.model}
            </p>
          </div>
          <Cpu className="w-4 h-4 text-[#8E929C]" />
        </div>
      </div>
    </div>
  );
}
