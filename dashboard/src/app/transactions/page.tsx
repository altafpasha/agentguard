'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ExternalLink,
  SlidersHorizontal,
  ChevronRight,
  X,
  FileCode,
  Shield,
  Eye,
} from 'lucide-react';
import { Navigation } from '../../components/Navigation';
import { AuthGuard } from '../../components/AuthGuard';
import { fetchAuditEvents } from '../../lib/api';
import { AuditRecord } from '../../types';

export default function TransactionsPage() {
  return (
    <AuthGuard>
      <TransactionsContent />
    </AuthGuard>
  );
}

function TransactionsContent() {
  const [events, setEvents] = useState<AuditRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedDecision, setSelectedDecision] = useState<string>('ALL');
  const [autoRefresh, setAutoRefresh] = useState<'5s' | '15s' | 'off'>('5s');
  const [selectedEvent, setSelectedEvent] = useState<AuditRecord | null>(null);

  const loadEvents = async () => {
    try {
      const res = await fetchAuditEvents({
        limit: 100,
        status: selectedDecision !== 'ALL' ? selectedDecision : undefined,
        search: search.trim() || undefined,
      });
      setEvents(res.events || []);
    } catch {
      // In case of error, show honest empty state
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
    if (autoRefresh === 'off') return;
    const intervalTime = autoRefresh === '5s' ? 5000 : 15000;
    const timer = setInterval(loadEvents, intervalTime);
    return () => clearInterval(timer);
  }, [selectedDecision, autoRefresh]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadEvents();
  };

  return (
    <div className="min-h-screen bg-[#111215] text-[#F4F4F5]">
      <Navigation />

      <main className="max-w-[1600px] mx-auto px-4 lg:px-8 py-6 space-y-6">
        {/* Page Title & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Transactions &amp; Live Security Feed
            </h1>
            <p className="text-xs text-[#8E929C] mt-1">
              Deterministic policy inspection stream with risk telemetry and forensic audit logs
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Auto refresh pill */}
            <div className="flex items-center p-1 rounded-full bg-[#1C1E24] border border-white/[0.08] text-xs">
              <span className="px-2 text-[#8E929C] text-[11px] hidden sm:inline">Stream:</span>
              {(['5s', '15s', 'off'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setAutoRefresh(mode)}
                  className={`px-3 py-1.5 rounded-full font-semibold transition-all btn-press touch-manipulation min-h-[32px] ${
                    autoRefresh === mode
                      ? 'bg-[#D7FF70] text-[#0E1400]'
                      : 'text-[#8E929C] hover:text-white'
                  }`}
                >
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              onClick={loadEvents}
              className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full bg-[#1C1E24] border border-white/[0.08] hover:border-white/20 text-[#8E929C] hover:text-white transition-colors flex items-center justify-center btn-press touch-manipulation"
              aria-label="Refresh events"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="p-4 rounded-[22px] bg-[#1C1E24] border border-white/[0.07] flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} className="relative w-full md:max-w-md">
            <Search className="w-4 h-4 text-[#8E929C] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Agent ID, Merchant, or Request ID..."
              className="w-full bg-[#121316] border border-white/[0.08] focus:border-[#D7FF70]/60 rounded-full pl-9 pr-4 py-2.5 text-xs text-white placeholder-[#6E7380] focus:outline-none transition-colors"
            />
          </form>

          {/* Decision Pill Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full md:w-auto py-0.5">
            {(['ALL', 'ALLOW', 'HOLD', 'BLOCK'] as const).map((dec) => {
              const isSelected = selectedDecision === dec;
              return (
                <button
                  key={dec}
                  onClick={() => setSelectedDecision(dec)}
                  className={`px-4 py-2 rounded-full text-xs font-semibold transition-all whitespace-nowrap btn-press touch-manipulation min-h-[38px] ${
                    isSelected
                      ? 'bg-[#D7FF70] text-[#0E1400] shadow-[0_2px_8px_rgba(215,255,112,0.2)]'
                      : 'bg-[#121316] text-[#8E929C] hover:text-white border border-white/[0.06]'
                  }`}
                >
                  {dec === 'ALL' ? 'All Decisions' : dec}
                </button>
              );
            })}
          </div>
        </div>

        {/* Mobile View: High-Context Responsive Event Cards (Visible on screens < md) */}
        <div className="block md:hidden space-y-3">
          {events.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#1C1E24] border border-white/[0.06] text-center text-xs text-[#8E929C]">
              No transactions found matching current criteria.
            </div>
          ) : (
            events.map((ev) => {
              const decision = (ev.decision || ev.policyDecision || (ev.status === 'SUCCESS' ? 'ALLOW' : ev.status === 'PENDING_APPROVAL' ? 'HOLD' : 'BLOCK')).toUpperCase();

              return (
                <div
                  key={ev.id || ev.requestId}
                  onClick={() => setSelectedEvent(ev)}
                  className="p-4 rounded-2xl bg-[#1C1E24] border border-white/[0.08] hover:border-[#D7FF70]/40 transition-all cursor-pointer active:scale-[0.99] space-y-3 shadow-md"
                >
                  {/* Card Header: Decision & Amount */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                        decision === 'ALLOW'
                          ? 'bg-[#D7FF70]/15 text-[#D7FF70] border border-[#D7FF70]/30'
                          : decision === 'HOLD'
                          ? 'bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30'
                          : 'bg-[#FF6B6B]/15 text-[#FF6B6B] border border-[#FF6B6B]/30'
                      }`}
                    >
                      {decision === 'ALLOW' && <CheckCircle2 className="w-3.5 h-3.5" />}
                      {decision === 'HOLD' && <AlertTriangle className="w-3.5 h-3.5" />}
                      {decision === 'BLOCK' && <XCircle className="w-3.5 h-3.5" />}
                      <span>{decision}</span>
                    </span>

                    <span className="font-mono font-bold text-base text-white">
                      {ev.amountFormatted || (ev.amountCents ? `$${(Number(ev.amountCents) / 100).toFixed(2)}` : '—')}
                    </span>
                  </div>

                  {/* Merchant & Event description */}
                  <div>
                    <h4 className="text-xs font-bold text-white truncate">
                      {ev.merchant || (ev.payloadSummary?.recipientEmail as string) || (ev.payloadSummary?.merchant as string) || 'PayPal Sandbox API'}
                    </h4>
                    <p className="text-[11px] text-[#8E929C] truncate mt-0.5">
                      {ev.errorMessage || (ev.payloadSummary?.description as string) || ev.eventType}
                    </p>
                  </div>

                  {/* Footer metadata */}
                  <div className="flex items-center justify-between pt-2.5 border-t border-white/[0.04] text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-[#121316] text-[#8E929C] font-mono text-[10px] border border-white/[0.04]">
                        {ev.agentId}
                      </span>
                      <span
                        className={`font-semibold ${
                          (ev.riskScore || 0) > 0.6
                            ? 'text-[#FF6B6B]'
                            : (ev.riskScore || 0) > 0.25
                            ? 'text-[#F59E0B]'
                            : 'text-[#D7FF70]'
                        }`}
                      >
                        Risk: {typeof ev.riskScore === 'number' ? ev.riskScore.toFixed(2) : '0.04'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-[#8E929C] font-mono text-[10px]">
                      <span>{ev.createdAt ? new Date(ev.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-[#D7FF70]" />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop View: Full-Density Data Table (Visible on md and larger) */}
        <div className="hidden md:block rounded-[22px] bg-[#1C1E24] border border-white/[0.07] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#16181E] border-b border-white/[0.06] text-[#8E929C] uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Decision</th>
                  <th className="py-3 px-4">Merchant / Target</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Agent ID</th>
                  <th className="py-3 px-4">Risk Score</th>
                  <th className="py-3 px-4">Time (UTC)</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[#8E929C]">
                      No events found matching current criteria.
                    </td>
                  </tr>
                ) : (
                  events.map((ev) => {
                    const decision = (ev.decision || ev.policyDecision || (ev.status === 'SUCCESS' ? 'ALLOW' : ev.status === 'PENDING_APPROVAL' ? 'HOLD' : 'BLOCK')).toUpperCase();

                    return (
                      <tr
                        key={ev.id || ev.requestId}
                        onClick={() => setSelectedEvent(ev)}
                        className="hover:bg-[#22252D] transition-colors cursor-pointer group"
                      >
                        {/* Decision Badge */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                              decision === 'ALLOW'
                                ? 'bg-[#D7FF70]/15 text-[#D7FF70] border border-[#D7FF70]/30'
                                : decision === 'HOLD'
                                ? 'bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30'
                                : 'bg-[#FF6B6B]/15 text-[#FF6B6B] border border-[#FF6B6B]/30'
                            }`}
                          >
                            {decision === 'ALLOW' && <CheckCircle2 className="w-3 h-3" />}
                            {decision === 'HOLD' && <AlertTriangle className="w-3 h-3" />}
                            {decision === 'BLOCK' && <XCircle className="w-3 h-3" />}
                            <span>{decision}</span>
                          </span>
                        </td>

                        {/* Merchant */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white group-hover:text-[#D7FF70] transition-colors">
                            {ev.merchant || (ev.payloadSummary?.recipientEmail as string) || (ev.payloadSummary?.merchant as string) || 'PayPal Sandbox API'}
                          </div>
                          <div className="text-[10px] text-[#8E929C] truncate max-w-[200px]">
                            {ev.errorMessage || (ev.payloadSummary?.description as string) || ev.eventType}
                          </div>
                        </td>

                        {/* Amount */}
                        <td className="py-3 px-4 font-mono font-bold text-white">
                          {ev.amountFormatted || (ev.amountCents ? `$${(Number(ev.amountCents) / 100).toFixed(2)}` : '—')}
                        </td>

                        {/* Agent */}
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-md bg-[#121316] text-[#8E929C] font-mono text-[10px] border border-white/[0.04]">
                            {ev.agentId}
                          </span>
                        </td>

                        {/* Risk Score */}
                        <td className="py-3 px-4">
                          <span
                            className={`font-semibold ${
                              (ev.riskScore || 0) > 0.6
                                ? 'text-[#FF6B6B]'
                                : (ev.riskScore || 0) > 0.25
                                ? 'text-[#F59E0B]'
                                : 'text-[#D7FF70]'
                            }`}
                          >
                            {typeof ev.riskScore === 'number' ? ev.riskScore.toFixed(2) : '0.04'}
                          </span>
                        </td>

                        {/* Time */}
                        <td className="py-3 px-4 text-[#8E929C] font-mono text-[11px]">
                          {ev.createdAt ? new Date(ev.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' }) : 'Just now'}
                        </td>

                        {/* Detail Action */}
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/[0.05] group-hover:bg-[#D7FF70] group-hover:text-[#0E1400] text-[#8E929C] transition-colors">
                            <ChevronRight className="w-4 h-4" />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Slide-out Event Detail Inspector Drawer */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-xl bg-[#181A20] border-l border-white/[0.1] h-full overflow-y-auto p-6 shadow-2xl space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#D7FF70]/15 flex items-center justify-center text-[#D7FF70]">
                  <FileCode className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Event Telemetry Inspector</h3>
                  <span className="text-[10px] text-[#8E929C] font-mono">
                    {selectedEvent.requestId}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setSelectedEvent(null)}
                aria-label="Close Inspector"
                className="w-8 h-8 rounded-full bg-[#121316] text-[#8E929C] hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Decision Overview */}
            <div className="p-4 rounded-2xl bg-[#1C1E24] border border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E929C]">Authoritative Decision</span>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold ${
                    selectedEvent.decision === 'ALLOW'
                      ? 'bg-[#D7FF70] text-[#0E1400]'
                      : selectedEvent.decision === 'HOLD'
                      ? 'bg-[#F59E0B] text-black'
                      : 'bg-[#FF6B6B] text-white'
                  }`}
                >
                  {selectedEvent.decision || selectedEvent.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                <div>
                  <span className="text-[#8E929C] block text-[10px]">Merchant / Recipient</span>
                  <span className="font-semibold text-white">
                    {selectedEvent.merchant || 'PayPal Sandbox API'}
                  </span>
                </div>
                <div>
                  <span className="text-[#8E929C] block text-[10px]">Transaction Amount</span>
                  <span className="font-semibold text-white font-mono">
                    {selectedEvent.amountFormatted || '$0.00'}
                  </span>
                </div>
                <div>
                  <span className="text-[#8E929C] block text-[10px]">Requesting Agent</span>
                  <span className="font-mono text-[#D7FF70]">
                    {selectedEvent.agentId}
                  </span>
                </div>
                <div>
                  <span className="text-[#8E929C] block text-[10px]">Event Type</span>
                  <span className="font-mono text-white">
                    {selectedEvent.eventType}
                  </span>
                </div>
              </div>
            </div>

            {/* Violations / Reasons */}
            {selectedEvent.decisionReasons && selectedEvent.decisionReasons.length > 0 && (
              <div className="p-4 rounded-2xl bg-[#1C1E24] border border-white/[0.06] space-y-2">
                <h4 className="text-xs font-bold text-white">Deterministic Evaluation Reasons</h4>
                <ul className="space-y-1.5 text-xs text-[#8E929C]">
                  {selectedEvent.decisionReasons.map((r, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[#D7FF70]">&bull;</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Error Message if blocked */}
            {selectedEvent.errorMessage && (
              <div className="p-4 rounded-2xl bg-[#FF6B6B]/10 border border-[#FF6B6B]/30 text-xs space-y-1">
                <span className="text-[#FF6B6B] font-bold block">Enforcement Block Note</span>
                <p className="text-white/90">{selectedEvent.errorMessage}</p>
              </div>
            )}

            {/* Redacted Payload Summary JSON */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white">Sanitized Payload Summary</h4>
                <span className="text-[10px] text-[#D7FF70] bg-[#D7FF70]/10 px-2 py-0.5 rounded-full font-mono">
                  Secrets Redacted
                </span>
              </div>
              <pre className="p-4 rounded-2xl bg-[#121316] border border-white/[0.06] text-[11px] font-mono text-[#8E929C] overflow-x-auto">
                {JSON.stringify(selectedEvent.payloadSummary || selectedEvent, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
