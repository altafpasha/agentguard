'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Sliders,
  FileSearch,
  FlaskConical,
  Settings,
  Search,
  Bell,
  Menu,
  X,
  ChevronDown,
  ShoppingBag,
  CreditCard,
  Plug,
  BookOpen,
  Users,
  LogOut,
  LogIn,
  AlertTriangle,
  PanelLeftClose,
  PanelLeftOpen,
  PanelLeft,
  Activity,
  Layers,
  ChevronRight,
} from 'lucide-react';
import {
  fetchPendingApprovals,
  fetchCurrentReviewer,
  fetchSetupStatus,
  logoutReviewer,
} from '../lib/api';
import { ReviewerProfile } from '../types';

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  id: string;
  desc?: string;
  badge?: number;
}

export interface NavCategory {
  group: string;
  items: NavItem[];
}

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();

  const [pendingCount, setPendingCount] = useState<number>(0);
  const [reviewer, setReviewer] = useState<ReviewerProfile | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);

  // Sidebar & Navigation States
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchFilterText, setSearchFilterText] = useState('');
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Initialize sidebar preference from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('agentguard_sidebar_state');
      if (saved === 'collapsed') {
        setSidebarExpanded(false);
      }
    }
  }, []);

  // Synchronize document attribute for main content margin offset
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.setAttribute('data-sidebar', sidebarExpanded ? 'expanded' : 'collapsed');
    }
  }, [sidebarExpanded]);

  useEffect(() => {
    // 1. Fetch current reviewer profile
    fetchCurrentReviewer()
      .then((res) => {
        setReviewer(res);
      })
      .catch(() => {
        setReviewer(null);
      });

    // 2. Check pending approvals count
    fetchPendingApprovals()
      .then((res) => {
        setPendingCount(res.count ?? (res.pendingApprovals?.length || 0));
      })
      .catch(() => {
        setPendingCount(0);
      });

    // 3. Check setup status
    fetchSetupStatus()
      .then((res) => {
        if (res.isSetupRequired) {
          setSetupRequired(true);
        }
      })
      .catch(() => {});
  }, [pathname]);

  // Close menus on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setProfileMenuOpen(false);
    setSearchModalOpen(false);
  }, [pathname]);

  const toggleSidebar = () => {
    const nextState = !sidebarExpanded;
    setSidebarExpanded(nextState);
    if (typeof window !== 'undefined') {
      localStorage.setItem('agentguard_sidebar_state', nextState ? 'expanded' : 'collapsed');
    }
  };

  // Keyboard shortcuts (Escape to close, ⌘B / Ctrl+B to toggle sidebar, ⌘K to search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
        setProfileMenuOpen(false);
        setSearchModalOpen(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sidebarExpanded]);

  // Click outside to close profile dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    if (profileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [profileMenuOpen]);

  const handleLogout = async () => {
    await logoutReviewer();
    setReviewer(null);
    setProfileMenuOpen(false);
    router.push('/login');
  };

  const userRole = (reviewer?.role || '').toUpperCase();
  const isAdminOrOwner = userRole === 'OWNER' || userRole === 'ADMIN' || userRole === 'SECURITY_ADMIN';

  // 1. PRIMARY Navigation Items (Prominently displayed in Top Navbar)
  const primaryNavItems: NavItem[] = [
    { label: 'Overview', href: '/dashboard', icon: LayoutDashboard, id: 'nav-link-overview', desc: 'Gateway telemetry & KPIs' },
    { label: 'Security Events', href: '/audit?eventType=SECURITY', icon: ShieldAlert, id: 'nav-link-security-events', desc: 'Real-time threat alerts' },
    { label: 'Transactions', href: '/transactions', icon: ShieldCheck, id: 'nav-link-transactions', desc: 'Evaluation ledger' },
    {
      label: 'Pending Approvals',
      href: '/approvals',
      icon: Clock,
      id: 'nav-link-pending-approvals',
      desc: 'Tier-3 2FA human reviews',
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
  ];

  // 2. SECONDARY Navigation Items (Moved to Sidebar to prevent navbar overflow)
  const sidebarCategories: NavCategory[] = [
    {
      group: 'Governance & Config',
      items: [
        { label: 'Policies', href: '/policies', icon: Sliders, desc: 'Deterministic limits & rules', id: 'sidebar-link-policies' },
        { label: 'Audit Logs', href: '/audit', icon: FileSearch, desc: 'Forensic tamper-evident records', id: 'sidebar-link-audit' },
        { label: 'Integrations', href: '/integrations', icon: Plug, desc: 'Gateway, DB, PayPal & AI probes', id: 'sidebar-link-integrations' },
        { label: 'Documentation', href: '/docs', icon: BookOpen, desc: 'Architecture, APIs & guides', id: 'sidebar-link-docs' },
        ...(isAdminOrOwner
          ? [{ label: 'Users', href: '/users', icon: Users, desc: 'Operator roles & invitations', id: 'sidebar-link-users' }]
          : []),
        { label: 'Settings', href: '/settings', icon: Settings, desc: 'Gateway telemetry & runtime', id: 'sidebar-link-settings' },
      ],
    },
    {
      group: 'Resources',
      items: [
        { label: 'Storefront Demo', href: '/storefront', icon: ShoppingBag, desc: 'Autonomous agent shopping checkout', id: 'sidebar-link-storefront' },
        { label: 'Open Source', href: '/pricing', icon: CreditCard, desc: 'Self-hosting & licensing', id: 'sidebar-link-pricing' },
      ],
    },
  ];

  const allNavCategories: NavCategory[] = [
    {
      group: 'Monitoring',
      items: primaryNavItems,
    },
    ...sidebarCategories,
  ];

  const getInitials = (name?: string, username?: string) => {
    if (name) {
      const parts = name.split(' ');
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return name.substring(0, 2).toUpperCase();
    }
    if (username) return username.substring(0, 2).toUpperCase();
    return 'OP';
  };

  return (
    <>
      {/* First-Run Setup Banner if installation has no owner */}
      {setupRequired && pathname !== '/setup' && (
        <div className="bg-[#D7FF70] text-[#0E1400] px-4 py-2 text-xs font-bold flex items-center justify-between shadow-md z-50 relative">
          <div className="flex items-center gap-2 mx-auto sm:mx-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>First-run setup required: This installation has no owner. Please complete initial setup.</span>
          </div>
          <Link
            href="/setup"
            className="hidden sm:inline-flex px-3 py-1 rounded-full bg-[#0E1400] text-[#D7FF70] text-[11px] font-bold hover:bg-black transition-colors"
          >
            Create Owner Account &rarr;
          </Link>
        </div>
      )}

      {/* =========================================================================
          TOP NAVBAR: Kept Clean & Free of Overflow (Primary Actions Only)
          ========================================================================= */}
      <header className="sticky top-0 z-40 bg-[#171717]/95 backdrop-blur-md border-b border-white/[0.08] px-3 sm:px-6 py-2.5 transition-all">
        <div className="flex items-center justify-between gap-2 sm:gap-4 w-full">
          {/* Left: Sidebar Toggle, Brand Logo & Primary Navigation Links */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Desktop Sidebar Toggle Button */}
            <button
              onClick={toggleSidebar}
              id="sidebar-toggle-btn"
              title={sidebarExpanded ? 'Collapse Sidebar (⌘B)' : 'Expand Sidebar (⌘B)'}
              aria-label="Toggle Navigation Sidebar"
              className="hidden xl:flex w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl bg-[#222222] border border-white/[0.08] hover:border-[#D7FF70]/40 text-[#8E929C] hover:text-white items-center justify-center transition-colors btn-press touch-manipulation"
            >
              {sidebarExpanded ? (
                <PanelLeftClose className="w-4 h-4 text-[#D7FF70]" />
              ) : (
                <PanelLeft className="w-4 h-4" />
              )}
            </button>

            {/* Brand Logo */}
            <Link
              href="/"
              aria-label="AgentGuard Dashboard Home"
              className="flex-shrink-0 flex items-center gap-2 sm:gap-2.5 px-2.5 py-1.5 rounded-2xl bg-[#222222] border border-white/[0.08] hover:border-[#D7FF70]/50 transition-all group btn-press touch-manipulation"
            >
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-br from-[#8C7CFF] to-[#D7FF70] p-[1.5px] flex items-center justify-center shadow-sm">
                <div className="w-full h-full bg-[#171717] rounded-[10px] flex items-center justify-center font-black text-xs text-[#D7FF70] tracking-tighter group-hover:scale-105 transition-transform">
                  AG
                </div>
              </div>
              <span className="font-bold text-xs sm:text-sm tracking-tight text-white hidden sm:inline">
                Agent<span className="text-[#D7FF70]">Guard</span>
              </span>
            </Link>

            {/* PRIMARY Navigation Links (No Overflow: only 4 core items) */}
            <nav className="hidden xl:flex items-center gap-1.5 ml-1" aria-label="Desktop Navigation">
              {primaryNavItems.map((item) => {
                const isOverview = (item.href === '/dashboard' || item.href === '/') && (pathname === '/' || pathname === '/dashboard' || pathname === '/overview');
                const isActive = pathname === item.href || isOverview;
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    id={item.id}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 relative shrink-0 btn-press touch-manipulation ${
                      isActive
                        ? 'bg-[#D7FF70] text-[#0E1400] font-semibold shadow-[0_2px_12px_rgba(215,255,112,0.25)]'
                        : 'bg-[#222222] text-[#9E9FA5] hover:text-white hover:bg-[#282828] border border-white/[0.05]'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-[#0E1400]' : 'text-[#8E929C]'}`} />
                    <span className="whitespace-nowrap">{item.label}</span>
                    {item.badge !== undefined && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold leading-none ${
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

          {/* Right: Environment, Search, Bell, Profile, Mobile Toggle */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Environment Indicator */}
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#222222] border border-white/[0.08] text-[11px] font-medium text-[#8E929C]">
              <span className="w-2 h-2 rounded-full bg-[#D7FF70] animate-pulse" />
              <span className="text-white font-semibold">Self-Hosted</span>
              <span className="text-white/40">|</span>
              <span>Gateway Node</span>
            </div>

            {/* Quick Search Button */}
            <button
              onClick={() => setSearchModalOpen(true)}
              aria-label="Open Global Search"
              title="Search (⌘K)"
              className="w-9 h-9 sm:w-10 sm:h-10 min-w-[36px] min-h-[36px] rounded-full bg-[#222222] border border-white/[0.08] flex items-center justify-center text-[#8E929C] hover:text-white hover:bg-[#282828] transition-colors btn-press touch-manipulation"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Documentation Quick Link */}
            <Link
              href="/docs"
              aria-label="Documentation"
              title="Documentation & Guides"
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#222222] border border-white/[0.08] hover:border-white/20 text-xs font-semibold text-[#8E929C] hover:text-[#D7FF70] transition-colors btn-press min-h-[36px]"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Docs</span>
            </Link>

            {/* Pending Approvals Bell */}
            <Link
              href="/approvals"
              aria-label={`Pending Approvals Queue${pendingCount > 0 ? `, ${pendingCount} pending` : ''}`}
              title="Pending Approvals"
              className="relative w-9 h-9 sm:w-10 sm:h-10 min-w-[36px] min-h-[36px] rounded-full bg-[#222222] border border-white/[0.08] flex items-center justify-center text-[#8E929C] hover:text-white hover:bg-[#282828] transition-colors btn-press touch-manipulation"
            >
              <Bell className="w-4 h-4" />
              {pendingCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-[#D7FF70] ring-2 ring-[#171717] animate-pulse" />
              )}
            </Link>

            {/* Operator Profile Dropdown */}
            {reviewer ? (
              <div className="relative" ref={profileMenuRef}>
                <button
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  aria-expanded={profileMenuOpen}
                  aria-haspopup="true"
                  aria-label="Operator Account Menu"
                  className="flex items-center gap-2 pl-1 pr-1.5 sm:pr-3 py-1 min-h-[36px] sm:min-h-[40px] rounded-full bg-[#222222] border border-white/[0.08] hover:border-white/20 transition-all group btn-press touch-manipulation"
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#6E56CF] via-[#8C7CFF] to-[#D7FF70] p-[1.5px] flex items-center justify-center shrink-0">
                    <div className="w-full h-full bg-[#171717] rounded-full flex items-center justify-center text-[10px] font-bold text-white">
                      {getInitials(reviewer.name, reviewer.username)}
                    </div>
                  </div>
                  <div className="hidden 2xl:flex flex-col text-left">
                    <span className="text-xs font-semibold text-white leading-tight">
                      {reviewer.name}
                    </span>
                    <span className="text-[10px] text-[#8E929C] leading-tight font-mono">
                      {reviewer.role}
                    </span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-[#8E929C] group-hover:text-white transition-colors hidden sm:block" />
                </button>

                {/* Dropdown Menu */}
                {profileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-[#222222] border border-white/[0.1] shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3 py-2 border-b border-white/[0.06] mb-2">
                      <div className="text-xs font-bold text-white">{reviewer.name}</div>
                      <div className="text-[11px] text-[#D7FF70] font-mono mt-0.5">@{reviewer.username} &bull; {reviewer.role}</div>
                    </div>
                    <div className="space-y-1">
                      {isAdminOrOwner && (
                        <Link
                          href="/users"
                          onClick={() => setProfileMenuOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/90 hover:bg-white/[0.06] transition-colors btn-press min-h-[38px]"
                        >
                          <Users className="w-4 h-4 text-[#8E929C] shrink-0" />
                          <span>User Management</span>
                        </Link>
                      )}
                      <Link
                        href="/integrations"
                        onClick={() => setProfileMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/90 hover:bg-white/[0.06] transition-colors btn-press min-h-[38px]"
                      >
                        <Plug className="w-4 h-4 text-[#8E929C] shrink-0" />
                        <span>Integrations & Health</span>
                      </Link>
                      <Link
                        href="/settings"
                        onClick={() => setProfileMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/90 hover:bg-white/[0.06] transition-colors btn-press min-h-[38px]"
                      >
                        <Settings className="w-4 h-4 text-[#8E929C] shrink-0" />
                        <span>Settings</span>
                      </Link>

                      <div className="pt-1 mt-1 border-t border-white/[0.06]">
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-rose-400 hover:bg-rose-500/10 transition-colors btn-press min-h-[38px]"
                        >
                          <LogOut className="w-4 h-4 shrink-0" />
                          <span>Sign Out</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-1.5 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full bg-[#222222] border border-white/[0.08] hover:border-white/20 text-xs font-semibold text-white transition-colors btn-press min-h-[36px] sm:min-h-[40px]"
              >
                <LogIn className="w-3.5 h-3.5 text-[#D7FF70]" />
                <span>Sign In</span>
              </Link>
            )}

            {/* Mobile & Tablet Hamburger Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              id="mobile-nav-toggle"
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle Navigation Menu"
              className="xl:hidden w-10 h-10 min-w-[40px] min-h-[40px] rounded-full bg-[#222222] border border-white/[0.08] hover:border-[#D7FF70]/40 flex items-center justify-center text-white btn-press touch-manipulation transition-colors"
            >
              {mobileMenuOpen ? <X className="w-5 h-5 text-[#D7FF70]" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* =========================================================================
          DESKTOP PERSISTENT SIDEBAR: Houses Secondary Actions (Governance & Lab)
          ========================================================================= */}
      <aside
        aria-label="Sidebar Navigation"
        className={`hidden xl:flex flex-col fixed top-[57px] left-0 bottom-0 z-30 bg-[#171717] border-r border-white/[0.08] transition-all duration-200 select-none ${
          sidebarExpanded ? 'w-68' : 'w-18'
        }`}
      >
        {/* Sidebar Header with Category / Collapse Trigger */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
          {sidebarExpanded ? (
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#D7FF70]" />
              <span className="text-xs font-bold uppercase tracking-wider text-[#8E929C]">Operations</span>
            </div>
          ) : (
            <div className="mx-auto">
              <Layers className="w-4 h-4 text-[#D7FF70]" />
            </div>
          )}

          <button
            onClick={toggleSidebar}
            title={sidebarExpanded ? 'Collapse to icon rail' : 'Expand sidebar'}
            className="p-1 rounded-lg text-[#8E929C] hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            {sidebarExpanded ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeftOpen className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Scrollable Categories of Secondary Actions */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar py-3 px-2 space-y-5">
          {sidebarCategories.map((cat) => (
            <div key={cat.group} className="space-y-1">
              {sidebarExpanded && (
                <div className="text-[10px] font-bold text-[#8E929C] uppercase tracking-wider px-3 mb-1">
                  {cat.group}
                </div>
              )}

              <div className="space-y-1">
                {cat.items.map((item) => {
                  const isOverview = (item.href === '/dashboard' || item.href === '/') && (pathname === '/' || pathname === '/dashboard' || pathname === '/overview');
                  const isActive = pathname === item.href || isOverview;
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      id={item.id}
                      title={!sidebarExpanded ? item.label : undefined}
                      className={`flex items-center gap-3 rounded-xl transition-all duration-150 group btn-press touch-manipulation relative ${
                        sidebarExpanded ? 'px-3 py-2 text-xs' : 'px-3 py-2.5 justify-center'
                      } ${
                        isActive
                          ? 'bg-[#222222] text-[#D7FF70] font-semibold border border-[#D7FF70]/30 shadow-sm'
                          : 'text-[#9E9FA5] hover:text-white hover:bg-[#222222]/70 border border-transparent'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-[#D7FF70]' : 'text-[#8E929C] group-hover:text-white'}`} />
                      {sidebarExpanded && (
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="truncate leading-tight font-medium">{item.label}</span>
                          <span className="text-[10px] text-[#8E929C] truncate leading-tight mt-0.5">{item.desc}</span>
                        </div>
                      )}

                      {sidebarExpanded && isActive && (
                        <div className="w-1.5 h-1.5 rounded-full bg-[#D7FF70] shrink-0" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* System Health Status Card in Sidebar */}
          {sidebarExpanded && (
            <div className="pt-2">
              <div className="p-3 rounded-2xl bg-[#222222] border border-white/[0.06] text-xs space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-[#8E929C] uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-[#D7FF70]" />
                    Node Status
                  </span>
                  <span className="text-[#D7FF70] font-mono text-[10px]">HEALTHY</span>
                </div>
                <div className="space-y-1 text-[11px] text-[#8E929C]">
                  <div className="flex items-center justify-between">
                    <span>Gateway Engine:</span>
                    <span className="text-white font-mono">v1.0.0</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Database:</span>
                    <span className="text-white font-mono">PostgreSQL</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>PayPal Sandbox:</span>
                    <span className="text-[#D7FF70] font-semibold">Active</span>
                  </div>
                </div>
                <Link
                  href="/integrations"
                  className="mt-2 block w-full py-1.5 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white text-[11px] font-semibold text-center transition-colors btn-press"
                >
                  Test Connection Health &rarr;
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Footer with Reviewer Profile */}
        <div className="p-3 border-t border-white/[0.06] shrink-0">
          {reviewer ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#6E56CF] to-[#D7FF70] p-[1.5px] shrink-0">
                  <div className="w-full h-full bg-[#171717] rounded-full flex items-center justify-center text-[10px] font-bold text-white">
                    {getInitials(reviewer.name, reviewer.username)}
                  </div>
                </div>
                {sidebarExpanded && (
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-white truncate">{reviewer.name}</span>
                    <span className="text-[10px] text-[#D7FF70] font-mono truncate">{reviewer.role}</span>
                  </div>
                )}
              </div>
              {sidebarExpanded && (
                <button
                  onClick={handleLogout}
                  title="Sign Out"
                  aria-label="Sign Out"
                  className="p-1.5 rounded-lg text-[#8E929C] hover:text-rose-400 hover:bg-rose-500/10 transition-colors btn-press"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className={`flex items-center gap-2 rounded-xl bg-[#222222] border border-white/[0.08] text-xs font-semibold text-white hover:border-[#D7FF70]/40 transition-colors btn-press ${
                sidebarExpanded ? 'px-3 py-2 justify-center' : 'p-2 justify-center'
              }`}
            >
              <LogIn className="w-3.5 h-3.5 text-[#D7FF70]" />
              {sidebarExpanded && <span>Sign In</span>}
            </Link>
          )}
        </div>
      </aside>

      {/* =========================================================================
          MOBILE & TABLET SLIDE-OUT DRAWER: All Actions Categorized with Large Touch Targets
          ========================================================================= */}
      {mobileMenuOpen && (
        <div className="xl:hidden fixed inset-0 z-50 flex">
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
          />

          <div className="relative w-full max-w-sm bg-[#171717] border-r border-white/[0.1] h-full flex flex-col p-4 shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-[#8C7CFF] to-[#D7FF70] p-[1.5px] flex items-center justify-center">
                  <div className="w-full h-full bg-[#171717] rounded-[8px] flex items-center justify-center font-black text-xs text-[#D7FF70]">
                    AG
                  </div>
                </div>
                <span className="font-bold text-sm text-white">
                  Agent<span className="text-[#D7FF70]">Guard</span>
                </span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close Menu"
                className="p-2 rounded-xl bg-white/[0.06] text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile Search Button */}
            <div className="pt-3">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setSearchModalOpen(true);
                }}
                className="w-full bg-[#222222] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-xs text-left text-[#8E929C] hover:border-[#D7FF70]/40 flex items-center justify-between min-h-[44px]"
              >
                <span className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-[#D7FF70]" />
                  <span>Search pages, commands...</span>
                </span>
                <kbd className="px-2 py-0.5 rounded bg-white/[0.06] text-[10px] font-mono text-white/60">⌘K</kbd>
              </button>
            </div>

            {/* Nav Categories */}
            <nav aria-label="Mobile Navigation" className="flex-1 overflow-y-auto py-4 space-y-4 no-scrollbar">
              {allNavCategories.map((cat) => (
                <div key={cat.group} className="space-y-1.5">
                  <div className="text-[10px] font-bold text-[#8E929C] uppercase tracking-wider px-2">
                    {cat.group}
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {cat.items.map((item) => {
                      const isOverview = (item.href === '/dashboard' || item.href === '/') && (pathname === '/' || pathname === '/dashboard' || pathname === '/overview');
                      const isActive = pathname === item.href || isOverview;
                      const Icon = item.icon;

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-semibold transition-all min-h-[44px] btn-press touch-manipulation ${
                            isActive
                              ? 'bg-[#D7FF70] text-[#0E1400] font-bold shadow-[0_2px_10px_rgba(215,255,112,0.25)]'
                              : 'bg-[#222222] text-[#9E9FA5] hover:text-white hover:bg-[#282828] border border-white/[0.05]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#0E1400]' : 'text-[#8E929C]'}`} />
                            <span>{item.label}</span>
                          </div>
                          {item.badge !== undefined && item.badge > 0 && (
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
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
                  </div>
                </div>
              ))}
            </nav>

            {/* Mobile Footer */}
            <div className="pt-3 border-t border-white/[0.08]">
              {reviewer ? (
                <div className="p-3 rounded-xl bg-[#222222] border border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#6E56CF] via-[#8C7CFF] to-[#D7FF70] p-[1.5px] flex items-center justify-center shrink-0">
                      <div className="w-full h-full bg-[#171717] rounded-full flex items-center justify-center text-xs font-bold text-white">
                        {getInitials(reviewer.name, reviewer.username)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">{reviewer.name}</div>
                      <div className="text-[10px] text-[#D7FF70] font-mono">{reviewer.role}</div>
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-medium flex items-center gap-1 transition-colors min-h-[36px]"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Exit</span>
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#D7FF70] text-[#0E1400] text-xs font-bold text-center flex items-center justify-center gap-1.5 min-h-[44px]"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Sign In</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          GLOBAL SEARCH MODAL (⌘K Command Palette)
          ========================================================================= */}
      {searchModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center pt-16 sm:pt-20 px-3 sm:px-4"
        >
          <div className="w-full max-w-xl bg-[#222222] border border-white/[0.12] rounded-2xl shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5 flex-1">
                <Search className="w-4 h-4 text-[#D7FF70] shrink-0" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Quick find pages, agents, policies, integrations..."
                  value={searchFilterText}
                  onChange={(e) => setSearchFilterText(e.target.value)}
                  className="w-full bg-transparent text-sm text-white placeholder-[#8E929C] focus:outline-none"
                />
              </div>
              <button
                onClick={() => setSearchModalOpen(false)}
                aria-label="Close search"
                className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white flex items-center justify-center btn-press touch-manipulation min-w-[32px] min-h-[32px]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-2 space-y-1 max-h-80 overflow-y-auto">
              {[
                { label: 'Overview Dashboard', href: '/', desc: 'Transaction statistics, metrics, and security feed' },
                { label: 'Security Events', href: '/audit?eventType=SECURITY', desc: 'Real intercepted and evaluated security events' },
                { label: 'Transactions', href: '/transactions', desc: 'Real purchase transactions evaluated against spending limits' },
                { label: 'Pending Approvals Queue', href: '/approvals', desc: 'Authoritative human-in-the-loop review queue' },
                { label: 'Policies', href: '/policies', desc: 'Deterministic limits, currency allowlists, and merchant denylists' },
                { label: 'Audit Logs', href: '/audit', desc: 'Forensic tamper-evident audit records and traces' },
                { label: 'Integrations & Health', href: '/integrations', desc: 'Live connectivity test for Gateway, DB, PayPal, OpenRouter' },
                { label: 'User Management', href: '/users', desc: 'Operator roles, single-use invitations, and session control' },
                { label: 'Settings', href: '/settings', desc: 'Gateway telemetry and environment configuration' },
                { label: 'Storefront Demo', href: '/storefront', desc: 'Storefront product catalog and real checkout test' },
                { label: 'Attack Lab', href: '/attack-lab', desc: 'Simulate prompt injection and spending cap breaches' },
                { label: 'Pricing Plans', href: '/pricing', desc: 'Transparent tier subscriptions and spend caps' },
              ]
                .filter((p) => p.label.toLowerCase().includes(searchFilterText.toLowerCase()) || p.desc.toLowerCase().includes(searchFilterText.toLowerCase()))
                .map((result) => (
                  <Link
                    key={result.href}
                    href={result.href}
                    onClick={() => setSearchModalOpen(false)}
                    className="flex flex-col p-3 rounded-xl hover:bg-white/[0.06] transition-colors btn-press touch-manipulation min-h-[44px]"
                  >
                    <span className="text-xs font-bold text-white hover:text-[#D7FF70]">{result.label}</span>
                    <span className="text-[11px] text-[#8E929C] mt-0.5">{result.desc}</span>
                  </Link>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
