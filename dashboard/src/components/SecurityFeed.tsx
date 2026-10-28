'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Shield, Search, CheckCircle2, AlertTriangle, XCircle, ArrowUpRight, ShieldAlert } from 'lucide-react';
import { AuditRecord } from '../types';

interface SecurityFeedProps {
  events?: AuditRecord[];
  className?: string;
}

export function SecurityFeed({ events = [], className = '' }: SecurityFeedProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const displayList = events.map((e) => ({
    id: e.id || e.requestId,
    requestId: e.requestId,
    agentId: e.agentId || 'agent-unknown',
    merchant: e.merchant || (e.payloadSummary?.merchant as string) || (e.payloadSummary?.recipientEmail as string) || 'PayPal Sandbox API',
    summary: e.errorMessage || (e.payloadSummary?.description as string) || `Action ${e.eventType} evaluated: ${e.decision || e.status}`,
    time: e.createdAt ? new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
    decision: ((e.decision || e.policyDecision || (e.status === 'SUCCESS' ? 'ALLOW' : e.status === 'PENDING_APPROVAL' ? 'HOLD' : 'BLOCK')) as 'ALLOW' | 'HOLD' | 'BLOCK'),
    amount: e.amountFormatted || (e.amountCents ? `$${(Number(e.amountCents) / 100).toFixed(2)}` : undefined),
  }));

  const filtered = displayList.filter(
    (e) =>
      e.agentId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.merchant.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.summary.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getDecisionBadge = (decision: 'ALLOW' | 'HOLD' | 'BLOCK') => {
    switch (decision) {
      case 'ALLOW':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#D7FF70]/15 text-[#D7FF70] border border-[#D7FF70]/20 shrink-0">
            <CheckCircle2 className="w-3 h-3" />
            <span>ALLOW</span>
          </span>
        );
      case 'HOLD':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/15 text-amber-300 border border-amber-400/20 shrink-0">
            <AlertTriangle className="w-3 h-3" />
            <span>HOLD</span>
          </span>
        );
      case 'BLOCK':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/20 shrink-0">
            <XCircle className="w-3 h-3" />
            <span>BLOCK</span>
          </span>
        );
    }
  };

  return (
    <div className={`bg-[#222222] border border-white/[0.08] rounded-3xl p-5 sm:p-6 flex flex-col h-full relative shadow-xl min-h-[440px] sm:min-h-[460px] w-full ${className}`}>
      {/* Standardized Card Header */}
      <div className="shrink-0 mb-3">
        <div className="flex items-center justify-between gap-3 min-h-[36px]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-white/[0.06] flex items-center justify-center text-[#8E929C] shrink-0">
              <Shield className="w-4 h-4 text-[#D7FF70]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white tracking-tight truncate">
                Live Security Interceptions
              </h3>
              <span className="text-[11px] text-[#8E929C] block truncate">Real evaluation feed</span>
            </div>
          </div>

          <Link
            href="/audit"
            className="flex items-center gap-1 text-xs font-semibold text-[#8E929C] hover:text-[#D7FF70] transition-colors shrink-0"
          >
            <span>View all</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {events.length > 0 && (
          <div className="relative mt-2.5">
            <Search className="w-3.5 h-3.5 text-[#8E929C] absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search feed..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#171717] border border-white/[0.06] text-white text-xs placeholder-[#8E929C] focus:outline-none focus:border-[#D7FF70]/40 transition-colors"
            />
          </div>
        )}
      </div>

      {/* Scrollable Events Area or Empty State */}
      <div className="flex-1 min-h-0 flex flex-col">
        {displayList.length === 0 ? (
          <div className="h-full min-h-[220px] flex flex-col items-center justify-center p-6 text-center space-y-3 rounded-2xl bg-[#171717] border border-white/[0.04]">
            <div className="w-10 h-10 rounded-2xl bg-white/[0.04] flex items-center justify-center text-[#8E929C]">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-white">No security events yet</h4>
              <p className="text-[11px] text-[#8E929C] max-w-xs leading-relaxed">
                Connect your first agent or gateway integration to start monitoring activity.
              </p>
            </div>
            <Link
              href="/integrations"
              className="px-3.5 py-1.5 rounded-full bg-[#D7FF70] text-[#0E1400] text-[11px] font-bold hover:bg-[#c4f250] transition-colors btn-press mt-1"
            >
              Configure Integrations
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="h-full min-h-[220px] flex items-center justify-center p-6 text-center text-xs text-[#8E929C] rounded-2xl bg-[#171717] border border-white/[0.04]">
            No matching events found for &quot;{searchQuery}&quot;.
          </div>
        ) : (
          <div className="flex-1 min-h-0 max-h-[280px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {filtered.map((item) => (
              <Link
                key={item.id}
                href={`/audit?requestId=${encodeURIComponent(item.requestId)}`}
                className="p-3 rounded-2xl bg-[#171717] border border-white/[0.04] hover:border-white/[0.12] transition-colors flex items-start justify-between gap-3 group"
              >
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {getDecisionBadge(item.decision)}
                    <span className="text-xs font-bold text-white truncate group-hover:text-[#D7FF70] transition-colors">
                      {item.merchant}
                    </span>
                    {item.amount && (
                      <span className="text-[11px] font-mono text-white/80 font-semibold shrink-0">
                        {item.amount}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#8E929C] truncate leading-tight">
                    {item.summary}
                  </p>
                </div>
                <span className="text-[10px] text-[#8E929C] shrink-0 font-mono">
                  {item.time}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Standardized Card Footer */}
      <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-[#8E929C] shrink-0 mt-4">
        <span>Feed status</span>
        <span className="flex items-center gap-1.5 text-white/80 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[#D7FF70] animate-pulse" />
          <span>Active Polling (12s)</span>
        </span>
      </div>
    </div>
  );
}
