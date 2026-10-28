'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  ShieldAlert,
  Clock,
  ShieldCheck,
  Sliders,
  Filter,
  Calendar,
  Download,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Check,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { Navigation } from '../../components/Navigation';
import { MetricCard } from '../../components/MetricCard';
import { ActivityChart } from '../../components/ActivityChart';
import { ThreatHeatmap } from '../../components/ThreatHeatmap';
import { SecurityFeed } from '../../components/SecurityFeed';
import { HealthPanel } from '../../components/HealthPanel';
import { DocsAndIntegrationsCards } from '../../components/DocsAndIntegrationsCards';
import { AuthGuard } from '../../components/AuthGuard';
import { fetchOverviewStats, fetchSystemHealth, fetchCurrentReviewer } from '../../lib/api';
import { DashboardOverviewStats, SystemHealthStatus, ReviewerProfile } from '../../types';

export default function DashboardPage() {
  return (
    <AuthGuard>
      <OverviewContent />
    </AuthGuard>
  );
}

export function OverviewContent() {
  const [stats, setStats] = useState<DashboardOverviewStats | null>(null);
  const [health, setHealth] = useState<SystemHealthStatus | null>(null);
  const [reviewer, setReviewer] = useState<ReviewerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'All' | 'Allowed' | 'Held' | 'Blocked'>('All');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState('All Time');

  const loadData = async () => {
    try {
      setIsRefreshing(true);
      const [overviewData, healthData, reviewerData] = await Promise.all([
        fetchOverviewStats().catch(() => null),
        fetchSystemHealth().catch(() => null),
        fetchCurrentReviewer().catch(() => null),
      ]);
      if (overviewData) setStats(overviewData);
      if (healthData) setHealth(healthData);
      if (reviewerData) setReviewer(reviewerData);
    } catch (err: any) {
      console.error('Failed to load overview data:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleDownloadReport = () => {
    if (!stats) return;
    const headers = ['EventID', 'Timestamp', 'AgentID', 'Action', 'Amount', 'Currency', 'Decision', 'RiskScore', 'Reason'];
    const rows = (stats.recentEvents || []).map((e: any) => [
      e.id || e.requestId,
      e.createdAt || e.timestamp || new Date().toISOString(),
      e.agentId,
      e.action || e.eventType,
      e.amountFormatted || e.amountCents || e.amount || '$0.00',
      e.currency || 'USD',
      e.decision || e.policyDecision || e.status,
      e.riskScore ?? 0,
      `"${((e.decisionReasons && e.decisionReasons.join('; ')) || e.reason || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `agentguard-security-report-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const displayStats = stats || {
    totalMonitored: 0,
    blockedThreats: 0,
    pendingApprovals: 0,
    averageRiskScore: 0,
    totalAttemptedSpendFormatted: '$0.00',
    totalSandboxSpendFormatted: '$0.00',
    threatDistribution: [],
    monthlyActivity: [],
    recentEvents: [],
  };

  const filteredEvents = (displayStats.recentEvents || []).filter((e) => {
    if (activeFilter === 'All') return true;
    return e.decision?.toUpperCase() === activeFilter.toUpperCase();
  });

  const isZeroState = !isLoading && displayStats.totalMonitored === 0;

  return (
    <div className="min-h-screen bg-[#111215] text-[#F4F4F5] flex flex-col antialiased">
      <Navigation />

      <main className="flex-1 max-w-7xl mx-auto w-full px-3 sm:px-6 lg:px-8 py-5 sm:py-7 space-y-6">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#D7FF70] animate-pulse" />
              <span className="text-[11px] font-bold tracking-wider text-[#8E929C] uppercase font-mono">
                Operator Dashboard &bull; Live Monitoring
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {reviewer ? `Welcome back, ${reviewer.name}` : 'Security Administrator'}
            </h1>
            <p className="text-xs sm:text-sm text-[#8E929C]">
              Real-time threat evaluation, PayPal Sandbox transaction caps, and human-in-the-loop approvals.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={loadData}
              disabled={isRefreshing}
              aria-label="Refresh Data"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#222222] border border-white/[0.08] hover:border-[#D7FF70]/40 text-xs text-[#8E929C] hover:text-white transition-colors btn-press min-h-[40px]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#D7FF70]' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <Link
              href="/attack-lab"
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#D7FF70] text-[#0E1400] text-xs font-bold hover:bg-[#c4f250] transition-colors btn-press shadow-sm min-h-[40px]"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Simulate Attack</span>
            </Link>
          </div>
        </div>

        {/* 4 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
          <MetricCard
            title="Evaluated Actions"
            value={displayStats.totalMonitored.toLocaleString()}
            icon={Users}
            change={`${displayStats.totalMonitored} lifetime`}
            href="/transactions"
          />

          <MetricCard
            title="Blocked Threats"
            value={displayStats.blockedThreats.toLocaleString()}
            icon={ShieldAlert}
            href="/audit?decision=BLOCK"
          />

          <MetricCard
            title="Pending Approvals"
            value={
              displayStats.pendingApprovals > 0
                ? `${displayStats.pendingApprovals} Pending`
                : '0 Pending'
            }
            icon={Clock}
            href="/approvals"
            isLimeHighlight={displayStats.pendingApprovals > 0}
          />

          <MetricCard
            title="Average Risk Index"
            value={
              displayStats.totalMonitored > 0
                ? `${displayStats.averageRiskScore.toFixed(2)} (${displayStats.averageRiskScore < 0.3 ? 'Low' : displayStats.averageRiskScore < 0.7 ? 'Moderate' : 'High'})`
                : '0.00 (No Events)'
            }
            icon={ShieldCheck}
            href="/audit"
          />
        </div>

        {/* Empty State Banner if 0 events recorded */}
        {isZeroState && (
          <div className="p-8 sm:p-12 rounded-3xl bg-[#222222] border border-white/[0.08] text-center space-y-4 shadow-xl">
            <div className="w-14 h-14 rounded-2xl bg-[#D7FF70]/10 border border-[#D7FF70]/20 flex items-center justify-center mx-auto text-[#D7FF70]">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <h2 className="text-xl font-bold text-white">No security events yet</h2>
              <p className="text-sm text-[#8E929C] leading-relaxed">
                Connect your first agent or gateway integration to start monitoring activity.
              </p>
            </div>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/integrations"
                className="px-5 py-2.5 rounded-full bg-[#D7FF70] text-[#0E1400] text-xs font-bold hover:bg-[#c4f250] transition-colors btn-press min-h-[42px] flex items-center gap-2"
              >
                <span>Configure Integrations</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/attack-lab"
                className="px-5 py-2.5 rounded-full bg-[#171717] border border-white/[0.08] hover:border-white/20 text-xs font-semibold text-white transition-colors btn-press min-h-[42px] flex items-center gap-2"
              >
                <span>Test With Attack Lab</span>
                <ExternalLink className="w-3.5 h-3.5 text-[#8E929C]" />
              </Link>
            </div>
          </div>
        )}

        {/* Filter Pills & Actions Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 w-full sm:w-auto">
            {(['All', 'Allowed', 'Held', 'Blocked'] as const).map((filter) => {
              const isActive = activeFilter === filter;
              return (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`px-4 py-2 rounded-full text-xs font-semibold transition-all whitespace-nowrap btn-press touch-manipulation min-h-[38px] ${
                    isActive
                      ? 'bg-[#D7FF70] text-[#0E1400] shadow-[0_2px_10px_rgba(215,255,112,0.2)]'
                      : 'bg-[#222222] text-[#8E929C] hover:text-white hover:bg-[#282828] border border-white/[0.06]'
                  }`}
                >
                  {filter}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 relative w-full sm:w-auto justify-between sm:justify-end">
            <button
              onClick={handleDownloadReport}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-[#222222] border border-white/[0.08] hover:border-white/20 text-xs font-semibold text-white hover:bg-[#282828] transition-colors btn-press touch-manipulation min-h-[40px]"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* 3-Column Analytics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
          <div className="md:col-span-1 lg:col-span-1 h-full flex flex-col">
            <ActivityChart data={displayStats.monthlyActivity} />
          </div>

          <div className="md:col-span-1 lg:col-span-1 h-full flex flex-col">
            <ThreatHeatmap
              threatDistribution={displayStats.threatDistribution}
              blockedCount={displayStats.blockedThreats}
            />
          </div>

          <div className="md:col-span-2 lg:col-span-1 h-full flex flex-col">
            <SecurityFeed events={filteredEvents} />
          </div>
        </div>

        {/* 2-Card Row: Docs and Integrations Cards (Equally Sized and Aligned) */}
        <DocsAndIntegrationsCards
          gatewayVersion={health?.gateway?.version || '1.0.0'}
          isGatewayOnline={health?.gateway?.status === 'healthy'}
        />

        {/* Guarded Financial Separation Alert Banner */}
        <div className="p-4 sm:p-5 rounded-3xl bg-[#222222] border border-white/[0.08] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#8C7CFF]/15 flex items-center justify-center text-[#8C7CFF] shrink-0 mt-0.5 sm:mt-0">
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
              className="w-full md:w-auto px-4 py-2 rounded-full bg-[#171717] border border-white/[0.08] hover:border-[#D7FF70]/50 text-xs text-[#D7FF70] font-semibold transition-colors flex items-center justify-center gap-1.5 btn-press shadow-sm min-h-[38px]"
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
