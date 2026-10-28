'use client';

import React from 'react';
import { ShieldCheck, ShieldAlert, AlertTriangle } from 'lucide-react';

interface ThreatHeatmapProps {
  threatDistribution?: Array<{
    category: string;
    count: number;
    percentage: number;
  }>;
  blockedCount?: number;
  className?: string;
}

export function ThreatHeatmap({ threatDistribution = [], blockedCount = 0, className = '' }: ThreatHeatmapProps) {
  const hasThreats = blockedCount > 0 && threatDistribution.length > 0;

  return (
    <div className={`bg-[#222222] border border-white/[0.08] rounded-3xl p-5 sm:p-6 flex flex-col h-full relative shadow-xl min-h-[440px] sm:min-h-[460px] w-full ${className}`}>
      {/* Standardized Card Header */}
      <div className="flex items-center justify-between gap-3 mb-4 shrink-0 min-h-[36px]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-white/[0.06] flex items-center justify-center text-[#8E929C] shrink-0">
            <ShieldAlert className="w-4 h-4 text-[#D7FF70]" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white tracking-tight truncate">
              Threat Breakdown
            </h3>
            <span className="text-[11px] text-[#8E929C] block truncate">Intercepted adversarial actions</span>
          </div>
        </div>

        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-[#8E929C] font-mono shrink-0">
          {blockedCount} Total Blocked
        </span>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 flex flex-col justify-center">
        {!hasThreats ? (
          <div className="h-full min-h-[220px] flex flex-col items-center justify-center p-6 text-center space-y-3 rounded-2xl bg-[#171717] border border-white/[0.04]">
            <div className="w-10 h-10 rounded-2xl bg-[#D7FF70]/10 border border-[#D7FF70]/20 flex items-center justify-center text-[#D7FF70]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-white">Zero Active Threats Detected</h4>
              <p className="text-[11px] text-[#8E929C] max-w-xs leading-relaxed">
                No prompt injections, spending limit breaches, or denylisted recipients have been intercepted.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3.5 py-2">
            {threatDistribution.map((item) => (
              <div key={item.category} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white font-medium">{item.category}</span>
                  <span className="text-[#8E929C] font-mono">
                    {item.count} ({item.percentage}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-[#171717] overflow-hidden">
                  <div
                    style={{ width: `${Math.min(item.percentage, 100)}%` }}
                    className="h-full bg-gradient-to-r from-amber-400 to-[#D7FF70] rounded-full transition-all duration-300"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Standardized Card Footer */}
      <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-[#8E929C] shrink-0 mt-4">
        <span>Deterministic Rulebook v1</span>
        <span className="text-emerald-400 font-medium">Deny-by-default active</span>
      </div>
    </div>
  );
}
