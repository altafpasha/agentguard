'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { MessageSquare, Plus, Search, CheckCircle2, AlertTriangle, XCircle, ArrowUpRight } from 'lucide-react';
import { AuditRecord } from '../types';

interface SecurityFeedProps {
  events?: AuditRecord[];
}

export function SecurityFeed({ events }: SecurityFeedProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const defaultEvents: Array<{
    id: string;
    agentId: string;
    merchant: string;
    summary: string;
    time: string;
    decision: 'ALLOW' | 'HOLD' | 'BLOCK';
    amount?: string;
  }> = [
    {
      id: 'ev-1',
      agentId: 'agent-finance',
      merchant: 'AWS Cloud Services',
      summary: 'Automated invoice payment evaluated within deterministic limit.',
      time: '3 min',
      decision: 'ALLOW',
      amount: '$14.99',
    },
    {
      id: 'ev-2',
      agentId: 'agent-procure',
      merchant: 'Acme SaaS Tools',
      summary: 'Order exceeds $25.00 threshold; enqueued in approval queue.',
      time: '13:09',
      decision: 'HOLD',
      amount: '$35.00',
    },
    {
      id: 'ev-3',
      agentId: 'agent-support',
      merchant: 'hacker@blackhat.com',
      summary: 'Recipient domain denylisted. Payment dispatch blocked.',
      time: '11:42',
      decision: 'BLOCK',
      amount: '$99.00',
    },
    {
      id: 'ev-4',
      agentId: 'agent-research',
      merchant: 'Digital Ocean Host',
      summary: 'Prompt injection detected in untrusted context snippet.',
      time: '09:15',
      decision: 'BLOCK',
      amount: '$45.00',
    },
    {
      id: 'ev-5',
      agentId: 'agent-dev',
      merchant: 'GitHub Marketplace',
      summary: 'Pre-authorized dev tool subscription renewal completed.',
      time: 'Yesterday',
      decision: 'ALLOW',
      amount: '$8.50',
    },
  ];

  const displayList = (events && events.length > 0)
    ? events.map((e) => ({
        id: e.id || e.requestId,
        agentId: e.agentId || 'agent-unknown',
        merchant: e.merchant || (e.payloadSummary?.merchant as string) || (e.payloadSummary?.recipientEmail as string) || 'PayPal Sandbox API',
        summary: e.errorMessage || (e.payloadSummary?.description as string) || `Action ${e.eventType} evaluated: ${e.decision || e.status}`,
        time: e.createdAt ? new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '5 min',
        decision: ((e.decision || e.policyDecision || (e.status === 'SUCCESS' ? 'ALLOW' : e.status === 'PENDING_APPROVAL' ? 'HOLD' : 'BLOCK')) as 'ALLOW' | 'HOLD' | 'BLOCK'),
        amount: e.amountFormatted || (e.amountCents ? `$${(Number(e.amountCents) / 100).toFixed(2)}` : undefined),
      }))
    : defaultEvents;

  const filtered = displayList.filter(
    (item) =>
      item.merchant.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.agentId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.summary.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="bg-[#1C1E24] border border-white/[0.08] rounded-[22px] p-5 sm:p-6 flex flex-col justify-between relative shadow-[0_4px_24px_rgba(0,0,0,0.35)] min-h-[400px]">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-white/[0.06] flex items-center justify-center text-[#8E929C]">
              <MessageSquare className="w-4 h-4 text-[#D7FF70]" />
            </div>
            <span className="text-sm font-semibold text-white tracking-tight">
              Live Security Feed
            </span>
          </div>

          {/* Plus Action Button (Matches Screenshot) */}
          <Link
            href="/attack-lab"
            title="Launch test transaction in Attack Lab"
            className="w-8 h-8 rounded-full bg-white text-[#121316] hover:bg-[#D7FF70] transition-colors flex items-center justify-center shadow-md font-bold btn-press"
          >
            <Plus className="w-4 h-4" />
          </Link>
        </div>

        {/* Search Bar Input (Matches Screenshot) */}
        <div className="relative mb-3.5">
          <Search className="w-3.5 h-3.5 text-[#8E929C] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search events, merchants, agents..."
            className="w-full bg-[#121316] border border-white/[0.08] focus:border-[#D7FF70] focus:ring-1 focus:ring-[#D7FF70]/30 rounded-full pl-9 pr-8 py-2 text-xs text-white placeholder-[#6E7380] focus:outline-none transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E929C] hover:text-white text-xs"
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {/* Events List */}
      <div className="flex-1 space-y-2 overflow-y-auto max-h-[260px] pr-1">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-xs text-[#8E929C]">
            No security events found matching &ldquo;{searchQuery}&rdquo;
          </div>
        ) : (
          filtered.slice(0, 5).map((item) => {
            return (
              <Link
                key={item.id}
                href={`/transactions?search=${encodeURIComponent(item.agentId)}`}
                className="flex items-center justify-between p-2.5 rounded-2xl bg-[#121316]/50 hover:bg-[#22252C] border border-white/[0.04] hover:border-white/[0.1] transition-all group active:scale-[0.99]"
              >
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  {/* Avatar Icon */}
                  <div
                    className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${
                      item.decision === 'ALLOW'
                        ? 'bg-[#D7FF70]/15 text-[#D7FF70]'
                        : item.decision === 'HOLD'
                        ? 'bg-[#8C7CFF]/15 text-[#8C7CFF]'
                        : 'bg-[#FF6B6B]/15 text-[#FF6B6B]'
                    }`}
                  >
                    {item.decision === 'ALLOW' && <CheckCircle2 className="w-4 h-4" />}
                    {item.decision === 'HOLD' && <AlertTriangle className="w-4 h-4" />}
                    {item.decision === 'BLOCK' && <XCircle className="w-4 h-4" />}
                  </div>

                  {/* Merchant & Snippet */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white truncate group-hover:text-[#D7FF70] transition-colors">
                        {item.merchant}
                      </span>
                      {item.amount && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.08] text-white/90 font-mono font-medium">
                          {item.amount}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#8E929C] truncate">
                      {item.summary}
                    </p>
                  </div>
                </div>

                {/* Right Timestamp / Arrow */}
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-[10px] text-[#6E7380] whitespace-nowrap">
                    {item.time}
                  </span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-[#8E929C] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* Footer link to all events */}
      <div className="mt-3 pt-2.5 border-t border-white/[0.04] flex items-center justify-between text-[11px]">
        <span className="text-[#8E929C]">Live pipeline updates</span>
        <Link
          href="/transactions"
          className="text-[#D7FF70] hover:underline font-semibold flex items-center gap-1"
        >
          View all events &rarr;
        </Link>
      </div>
    </div>
  );
}
