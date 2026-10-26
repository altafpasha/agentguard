'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ShieldCheck,
  Clock,
  Sliders,
  FileSearch,
  FlaskConical,
  Settings,
  Search,
  Bell,
  Menu,
  X,
  User,
  ShieldAlert,
  ChevronDown,
  ShoppingBag,
} from 'lucide-react';
import { fetchPendingApprovals, fetchCurrentReviewer } from '../lib/api';
import { ReviewerProfile } from '../types';

export function Navigation() {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [reviewer, setReviewer] = useState<ReviewerProfile>({
    id: 'rev_darlene',
    username: 'darlene.robertson',
    name: 'Darlene Robertson',
    role: 'SECURITY_ADMIN',
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchFilterText, setSearchFilterText] = useState('');

  useEffect(() => {
    // Fetch pending count for badge
    fetchPendingApprovals()
      .then((res) => {
        setPendingCount(res.count ?? (res.pendingApprovals?.length || 0));
      })
      .catch(() => {
        // Fallback default
        setPendingCount(3);
      });

    fetchCurrentReviewer()
      .then((res) => {
        if (res) setReviewer(res);
      })
      .catch(() => {});
  }, [pathname]);

  const navItems = [
    { label: 'Overview', href: '/', icon: LayoutDashboard },
    { label: 'Storefront', href: '/storefront', icon: ShoppingBag },
    { label: 'Transactions', href: '/transactions', icon: ShieldCheck },
    {
      label: 'Approvals',
      href: '/approvals',
      icon: Clock,
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
    { label: 'Policies', href: '/policies', icon: Sliders },
    { label: 'Audit Logs', href: '/audit', icon: FileSearch },
    { label: 'Attack Lab', href: '/attack-lab', icon: FlaskConical },
    { label: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#121316]/90 backdrop-blur-md border-b border-white/[0.06] px-4 lg:px-8 py-3.5 transition-all">
      <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
        {/* Left: Logo & Top Nav Pills */}
        <div className="flex items-center gap-3 lg:gap-4 overflow-x-auto no-scrollbar py-0.5">
          {/* Logo Monogram */}
          <Link
            href="/"
            className="flex-shrink-0 flex items-center gap-2.5 px-3 py-1.5 rounded-2xl bg-[#1C1E24] border border-white/[0.08] hover:border-[#D7FF70]/50 transition-colors group"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#8C7CFF] to-[#D7FF70] p-[1.5px] flex items-center justify-center shadow-sm">
              <div className="w-full h-full bg-[#121316] rounded-[10px] flex items-center justify-center font-black text-xs text-[#D7FF70] tracking-tighter group-hover:scale-105 transition-transform">
                AG
              </div>
            </div>
            <span className="font-bold text-sm tracking-tight text-white hidden sm:inline">
              Agent<span className="text-[#D7FF70]">Guard</span>
            </span>
          </Link>

          {/* Desktop Nav Pills (Matches Reference UI on wide screens) */}
          <nav className="hidden xl:flex items-center gap-1.5">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  id={`nav-link-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-medium transition-all duration-150 relative ${
                    isActive
                      ? 'bg-[#D7FF70] text-[#0E1400] font-semibold shadow-[0_2px_12px_rgba(215,255,112,0.25)]'
                      : 'bg-[#1C1E24]/80 text-[#9E9FA5] hover:text-white hover:bg-[#252830] border border-white/[0.05]'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#0E1400]' : 'text-[#8E929C]'}`} />
                  <span>{item.label}</span>
                  {item.badge !== undefined && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none ${
                        isActive
                          ? 'bg-[#0E1400] text-[#D7FF70]'
                          : 'bg-[#D7FF70] text-[#0E1400]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: Environment, Search, Notifications & User Avatar */}
        <div className="flex items-center gap-2.5">
          {/* Environment Pill */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1C1E24] border border-white/[0.08] text-[11px] font-medium text-[#8E929C]">
            <span className="w-2 h-2 rounded-full bg-[#D7FF70] animate-pulse" />
            <span className="text-white font-semibold">Sandbox</span>
            <span className="text-white/40">|</span>
            <span>PayPal Gateway</span>
          </div>

          {/* Search Button */}
          <button
            onClick={() => setSearchModalOpen(true)}
            aria-label="Search"
            className="w-9 h-9 rounded-full bg-[#1C1E24] border border-white/[0.08] flex items-center justify-center text-[#8E929C] hover:text-white hover:bg-[#252830] transition-colors btn-press"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Notifications Button */}
          <Link
            href="/approvals"
            aria-label="Notifications"
            className="relative w-9 h-9 rounded-full bg-[#1C1E24] border border-white/[0.08] flex items-center justify-center text-[#8E929C] hover:text-white hover:bg-[#252830] transition-colors btn-press"
          >
            <Bell className="w-4 h-4" />
            {pendingCount > 0 && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-[#D7FF70] ring-2 ring-[#121316]" />
            )}
          </Link>

          {/* Reviewer Profile Avatar & Dropdown */}
          <div className="relative">
            <button
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-[#1C1E24] border border-white/[0.08] hover:border-white/20 transition-all group btn-press"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#6E56CF] via-[#8C7CFF] to-[#D7FF70] p-[1.5px] flex items-center justify-center">
                <div className="w-full h-full bg-[#181A1F] rounded-full flex items-center justify-center text-[11px] font-bold text-white">
                  DR
                </div>
              </div>
              <div className="hidden xl:flex flex-col text-left">
                <span className="text-xs font-semibold text-white leading-tight">
                  {reviewer.name}
                </span>
                <span className="text-[10px] text-[#8E929C] leading-tight font-mono">
                  {reviewer.role}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-[#8E929C] group-hover:text-white transition-colors hidden sm:block" />
            </button>

            {/* Profile Dropdown Menu */}
            {profileMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-[#1C1E24] border border-white/[0.1] shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-2 border-b border-white/[0.06] mb-2">
                  <div className="text-xs font-bold text-white">{reviewer.name}</div>
                  <div className="text-[11px] text-[#D7FF70] font-mono mt-0.5">{reviewer.role}</div>
                  <div className="text-[10px] text-[#8E929C] mt-1">Authorized Supervisory Clearance</div>
                </div>
                <div className="space-y-1">
                  <Link
                    href="/settings"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/90 hover:bg-white/[0.06] transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5 text-[#8E929C]" />
                    <span>System Settings & Keys</span>
                  </Link>
                  <Link
                    href="/policies"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/90 hover:bg-white/[0.06] transition-colors"
                  >
                    <Sliders className="w-3.5 h-3.5 text-[#8E929C]" />
                    <span>Policy Configuration</span>
                  </Link>
                  <Link
                    href="/audit"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/90 hover:bg-white/[0.06] transition-colors"
                  >
                    <FileSearch className="w-3.5 h-3.5 text-[#8E929C]" />
                    <span>Audit Explorer</span>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Mobile & Tablet Menu Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="xl:hidden w-9 h-9 rounded-full bg-[#1C1E24] border border-white/[0.08] flex items-center justify-center text-white btn-press"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile & Tablet Drawer */}
      {mobileMenuOpen && (
        <div className="xl:hidden pt-4 pb-3 border-t border-white/[0.06] mt-3 space-y-3">
          {/* Mobile Environment Badge */}
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#1C1E24] border border-white/[0.06]">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-[#D7FF70] animate-pulse" />
              <span className="text-white font-bold">PayPal Sandbox</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#D7FF70]/15 text-[#D7FF70] font-mono">
              Deterministic Mode
            </span>
          </div>

          <nav className="flex flex-col gap-1.5">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#D7FF70] text-[#0E1400] font-semibold shadow-sm'
                      : 'bg-[#1C1E24] text-[#8E929C] hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-[#0E1400] text-[#D7FF70]">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      )}

      {/* Global Command Search Modal */}
      {searchModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-20 px-4">
          <div className="w-full max-w-xl bg-[#1C1E24] border border-white/[0.12] rounded-2xl shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5 flex-1">
                <Search className="w-4 h-4 text-[#D7FF70]" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Quick find pages, agents, policies, attacks..."
                  value={searchFilterText}
                  onChange={(e) => setSearchFilterText(e.target.value)}
                  className="w-full bg-transparent text-sm text-white placeholder-[#8E929C] focus:outline-none"
                />
              </div>
              <button
                onClick={() => setSearchModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-2 space-y-1 max-h-72 overflow-y-auto">
              {[
                { label: 'Overview Dashboard', href: '/', desc: 'Transaction velocity, metric cards, heatmap' },
                { label: 'Live Transactions & Security Feed', href: '/transactions', desc: 'Inspect evaluated requests and sanitized payloads' },
                { label: 'Pending Approvals Queue', href: '/approvals', desc: 'Authoritative human-in-the-loop decision approvals' },
                { label: 'Deterministic Policies', href: '/policies', desc: 'Financial transaction limits and recipient denylists' },
                { label: 'Audit Explorer', href: '/audit', desc: 'Forensic tamper-evident audit records and scrubbed traces' },
                { label: 'Attack & Verification Lab', href: '/attack-lab', desc: 'Simulate adversarial prompt injection and limit breaches' },
                { label: 'System Settings', href: '/settings', desc: 'PayPal Sandbox and OpenRouter telemetry configuration' },
              ]
                .filter((p) => p.label.toLowerCase().includes(searchFilterText.toLowerCase()) || p.desc.toLowerCase().includes(searchFilterText.toLowerCase()))
                .map((result) => (
                  <Link
                    key={result.href}
                    href={result.href}
                    onClick={() => setSearchModalOpen(false)}
                    className="flex flex-col p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors"
                  >
                    <span className="text-xs font-bold text-white hover:text-[#D7FF70]">{result.label}</span>
                    <span className="text-[11px] text-[#8E929C]">{result.desc}</span>
                  </Link>
                ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
