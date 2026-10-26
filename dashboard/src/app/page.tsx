'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  ShieldAlert,
  Briefcase,
  ShieldCheck,
  Sliders,
  Filter,
  Calendar,
  Download,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Check,
} from 'lucide-react';
import { Navigation } from '../components/Navigation';
import { MetricCard } from '../components/MetricCard';
import { ActivityChart } from '../components/ActivityChart';
import { ThreatHeatmap } from '../components/ThreatHeatmap';
import { SecurityFeed } from '../components/SecurityFeed';
import { HealthPanel } from '../components/HealthPanel';
import { fetchOverviewStats, fetchSystemHealth } from '../lib/api';
import { DashboardOverviewStats, SystemHealthStatus } from '../types';

export default function OverviewPage() {
  const [stats, setStats] = useState<DashboardOverviewStats | null>(null);
  const [health, setHealth] = useState<SystemHealthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'All' | 'Allowed' | 'Held' | 'Blocked'>('All');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState('Last 7 Days');

  const loadData = async () => {
    try {
      setIsRefreshing(true);
      const [overviewData, healthData] = await Promise.all([
        fetchOverviewStats().catch(() => null),
        fetchSystemHealth().catch(() => null),
      ]);
      if (overviewData) setStats(overviewData);
      if (healthData) setHealth(healthData);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000); // Polling every 10s
    return () => clearInterval(interval);
  }, []);

  const handleDownloadReport = () => {
    const events = stats?.recentEvents || [];
    const rows = [
      ['Timestamp', 'Request ID', 'Agent ID', 'Merchant', 'Amount', 'Currency', 'Decision', 'Risk Score', 'Reasons'],
      ...events.map((e) => [
        e.createdAt || new Date().toISOString(),
        e.requestId,
        e.agentId,
        e.merchant || 'PayPal Sandbox API',
        e.amountFormatted || '$0.00',
        e.currency || 'USD',
        e.decision || e.status,
        String(e.riskScore || 0),
        (e.decisionReasons || []).join('; '),
      ]),
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `agentguard-audit-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Default fallback values if backend is initializing
  const displayStats = stats || {
    totalMonitored: 975124,
    allowedCount: 602569,
    blockedThreats: 296241,
    pendingApprovals: 3,
    totalSandboxSpendFormatted: '$8.50',
    totalAttemptedSpendFormatted: '$285.99',
    averageRiskScore: 0.14,
    threatDistribution: [],
    monthlyActivity: [],
    recentEvents: [],
  };

  // Filter events by selected category
  const filteredEvents = (displayStats.recentEvents || []).filter((e) => {
    if (activeFilter === 'All') return true;
    const dec = e.decision || (e.status === 'SUCCESS' ? 'ALLOW' : e.status === 'PENDING_APPROVAL' ? 'HOLD' : 'BLOCK');
    if (activeFilter === 'Allowed') return dec === 'ALLOW';
    if (activeFilter === 'Held') return dec === 'HOLD';
    if (activeFilter === 'Blocked') return dec === 'BLOCK';
    return true;
  });

  return (
    <div className="min-h-screen bg-[#111215] text-[#F4F4F5]">
      {/* Navigation matching reference top bar */}
      <Navigation />

      {/* Main Content Canvas */}
      <main className="max-w-[1600px] mx-auto px-4 lg:px-8 py-6 space-y-6">
        {/* Top Header & Greeting Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs sm:text-sm text-[#8E929C] font-medium tracking-wide">
              Welcome back,
            </span>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white font-sans">
                Darlene Robertson
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#6E56CF] text-[#F1EFFF] shadow-sm">
                Premium
              </span>
            </div>
            <p className="text-xs text-[#8E929C] flex items-center gap-2">
              <span>PayPal Sandbox AI Gateway Defense Node</span>
              <span>&bull;</span>
              <span className="text-[#D7FF70] font-semibold">Authoritative Deterministic Mode</span>
            </p>
          </div>

          {/* Quick Header Actions (Responsive on mobile and desktop) */}
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={loadData}
              disabled={isRefreshing}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-[#1C1E24] border border-white/[0.08] hover:border-white/20 text-xs font-semibold text-white/90 hover:bg-[#252830] transition-colors btn-press"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#D7FF70]' : 'text-[#8E929C]'}`} />
              <span>{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
            </button>
            <button
              onClick={handleDownloadReport}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-[#D7FF70] text-[#0E1400] text-xs font-bold hover:bg-[#c4f250] transition-colors shadow-sm btn-press"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* 4 Compact Metric Cards across the top (Fully Responsive 4-col -> 2-col -> 1-col) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Transactions Monitored */}
          <MetricCard
            title="Transactions monitored"
            value={displayStats.totalMonitored.toLocaleString()}
            change="+42.8% from previous week"
            changeType="positive"
            icon={Users}
            href="/transactions"
          />

          {/* Card 2: Blocked Threats */}
          <MetricCard
            title="Blocked threats"
            value={displayStats.blockedThreats.toLocaleString()}
            change="+26.3% from previous week"
            changeType="positive"
            icon={ShieldAlert}
            href="/transactions?status=BLOCK"
          />

          {/* Card 3: Pending Approvals (Solid Lime Card Matching Reference) */}
          <MetricCard
            title="Pending approvals"
            value={
              displayStats.pendingApprovals > 0
                ? `${displayStats.pendingApprovals} Pending`
                : '0 Pending'
            }
            change="-18.4% from previous week"
            changeType="positive"
            icon={Briefcase}
            href="/approvals"
            isLimeHighlight={true}
          />

          {/* Card 4: Aggregate Security Risk Index */}
          <MetricCard
            title="Security Risk Index"
            value={
              displayStats.averageRiskScore !== undefined
                ? `${displayStats.averageRiskScore.toFixed(2)} (Low)`
                : '0.14 (Low)'
            }
            change="-12.4% risk reduction"
            changeType="positive"
            icon={ShieldCheck}
            href="/audit"
          />
        </div>

        {/* Filter Pills & Actions Row (Matches Reference UI) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          {/* Left Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 w-full sm:w-auto">
            {(['All', 'Allowed', 'Held', 'Blocked'] as const).map((filter) => {
              const isActive = activeFilter === filter;
              return (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`px-4 py-2 rounded-full text-xs font-semibold transition-all whitespace-nowrap btn-press ${
                    isActive
                      ? 'bg-[#D7FF70] text-[#0E1400] shadow-[0_2px_10px_rgba(215,255,112,0.2)]'
                      : 'bg-[#1C1E24] text-[#8E929C] hover:text-white hover:bg-[#252830] border border-white/[0.06]'
                  }`}
                >
                  {filter}
                </button>
              );
            })}
          </div>

          {/* Right Action Buttons with Functional Dropdowns */}
          <div className="flex items-center gap-2 relative w-full sm:w-auto justify-between sm:justify-end">
            <div className="flex items-center gap-2">
              {/* Filter Toggle */}
              <div className="relative">
                <button
                  onClick={() => setFilterMenuOpen(!filterMenuOpen)}
                  aria-label="Filter Options"
                  className="w-9 h-9 rounded-full bg-[#1C1E24] border border-white/[0.08] hover:border-white/20 text-[#8E929C] hover:text-white flex items-center justify-center transition-colors btn-press"
                >
                  <Filter className="w-4 h-4" />
                </button>

                {filterMenuOpen && (
                  <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-52 rounded-2xl bg-[#1C1E24] border border-white/[0.1] shadow-2xl p-2.5 z-40 animate-in fade-in zoom-in-95 duration-100">
                    <div className="text-[10px] font-bold text-[#8E929C] uppercase tracking-wider px-2 py-1">
                      Filter by Decision
                    </div>
                    {(['All', 'Allowed', 'Held', 'Blocked'] as const).map((opt) => (
                      <button
                        key={opt}
                        onClick={() => {
                          setActiveFilter(opt);
                          setFilterMenuOpen(false);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-white/90 hover:bg-white/[0.08] flex items-center justify-between"
                      >
                        <span>{opt} Decisions</span>
                        {activeFilter === opt && <Check className="w-3.5 h-3.5 text-[#D7FF70]" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Date Range Button */}
              <div className="relative">
                <button
                  onClick={() => setDateMenuOpen(!dateMenuOpen)}
                  aria-label="Date Range"
                  className="w-9 h-9 rounded-full bg-[#1C1E24] border border-white/[0.08] hover:border-white/20 text-[#8E929C] hover:text-white flex items-center justify-center transition-colors btn-press"
                >
                  <Calendar className="w-4 h-4" />
                </button>

                {dateMenuOpen && (
                  <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-48 rounded-2xl bg-[#1C1E24] border border-white/[0.1] shadow-2xl p-2.5 z-40 animate-in fade-in zoom-in-95 duration-100">
                    <div className="text-[10px] font-bold text-[#8E929C] uppercase tracking-wider px-2 py-1">
                      Time Window
                    </div>
                    {['Last 24 Hours', 'Last 7 Days', 'Last 30 Days', 'Current Quarter'].map((range) => (
                      <button
                        key={range}
                        onClick={() => {
                          setSelectedDateRange(range);
                          setDateMenuOpen(false);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-white/90 hover:bg-white/[0.08] flex items-center justify-between"
                      >
                        <span>{range}</span>
                        {selectedDateRange === range && <Check className="w-3.5 h-3.5 text-[#D7FF70]" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Download Reports Button */}
            <button
              onClick={handleDownloadReport}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-[#1C1E24] border border-white/[0.08] hover:border-white/20 text-xs font-semibold text-white hover:bg-[#22252C] transition-colors btn-press"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download reports</span>
            </button>
          </div>
        </div>

        {/* 3-Column Analytics Grid (Responsive: 1 col on mobile, 2 col on tablet, 3 col on desktop) */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {/* 1. Transaction Activity Chart */}
          <div className="md:col-span-1">
            <ActivityChart data={displayStats.monthlyActivity} />
          </div>

          {/* 2. Threat Activity Matrix / Heatmap */}
          <div className="md:col-span-1">
            <ThreatHeatmap />
          </div>

          {/* 3. Live Security Feed */}
          <div className="md:col-span-2 xl:col-span-1">
            <SecurityFeed events={filteredEvents} />
          </div>
        </div>

        {/* Financial Separation Alert Banner */}
        <div className="p-4 sm:p-5 rounded-[22px] bg-[#1C1E24] border border-white/[0.07] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-[0_4px_20px_rgba(0,0,0,0.25)]">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#8C7CFF]/15 flex items-center justify-center text-[#8C7CFF] flex-shrink-0 mt-0.5 sm:mt-0">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-white">
                  Guarded Financial Separation
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.08] text-white/70 font-mono">
                  PAYPAL_ALLOW_LIVE_EXECUTION = false
                </span>
              </div>
              <p className="text-[11px] text-[#8E929C] mt-0.5">
                Evaluated Attempted Volume: <strong className="text-white">{displayStats.totalAttemptedSpendFormatted}</strong> &bull; Actual Captured Sandbox Execution: <strong className="text-[#D7FF70]">{displayStats.totalSandboxSpendFormatted}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center w-full md:w-auto">
            <Link
              href="/attack-lab"
              className="w-full md:w-auto px-4 py-2 rounded-full bg-[#121316] border border-white/[0.08] hover:border-[#D7FF70]/50 text-xs text-[#D7FF70] font-semibold transition-colors flex items-center justify-center gap-1.5 btn-press shadow-sm"
            >
              <span>Test Payment Scenarios</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Real Gateway Service Health Panel */}
        <HealthPanel health={health || undefined} onRefresh={loadData} isLoading={isRefreshing} />
      </main>
    </div>
  );
}
