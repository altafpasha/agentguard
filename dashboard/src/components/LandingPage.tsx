'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  ShieldAlert,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Clock,
  Plug,
  Server,
  Terminal,
  Cpu,
  Database,
  CreditCard,
  Bot,
  Copy,
  Check,
  ArrowRight,
  Sparkles,
  ExternalLink,
  Lock,
  Menu,
  X,
  BookOpen,
  Code2,
  Users,
  Activity,
  ChevronRight,
  ShoppingBag,
  Eye,
  FileSearch,
  Play,
  RotateCcw,
  Zap,
} from 'lucide-react';
import { GithubIcon } from './GithubIcon';
import { ReviewerProfile } from '../types';

interface LandingPageProps {
  reviewer?: ReviewerProfile | null;
}

const GITHUB_REPO_URL = 'https://github.com/altafpasha/agentguard';

export function LandingPage({ reviewer }: LandingPageProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeShowcaseTab, setActiveShowcaseTab] = useState<'injection' | 'approval' | 'razorpay'>('injection');

  const copyQuickStart = () => {
    navigator.clipboard.writeText(
      `git clone https://github.com/altafpasha/agentguard.git\ncd agentguard\ncp .env.example .env\ndocker compose up -d`
    );
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const scenariosList = [
    {
      id: 'prompt-injection',
      title: 'Prompt Injection Defense',
      category: 'Prompt Security',
      icon: ShieldAlert,
      problem: 'Adversarial user prompts attempt jailbreaks, delimiter hijacking, or secret prompt leaking to hijack agent tool execution.',
      expected: 'AgentGuard scans input heuristics and token boundaries before execution. Injection payloads are immediately flagged and BLOCKED.',
      takeaway: 'Deterministic heuristic scanning stops malicious prompts before tools or payment APIs are ever called.',
    },
    {
      id: 'spending-limit',
      title: 'Deterministic Spending Caps',
      category: 'Financial Safety',
      icon: CreditCard,
      problem: 'Autonomous agents can hallucinate excessive prices or trigger repeated loops, depleting merchant or customer bank balances.',
      expected: 'Policy engine checks amount against strict per-transaction and 24h limits. Exceeding operations ($50 max) are strictly BLOCKED.',
      takeaway: 'Deterministic mathematical policies prevent unauthorized spending regardless of model hallucination.',
    },
    {
      id: 'unauthorized-tool',
      title: 'Unauthorized Tool Invocation',
      category: 'Least Privilege',
      icon: Lock,
      problem: 'Compromised agents attempt to call high-privilege tools like command shells (shell_executor) or raw database query endpoints.',
      expected: 'The gateway checks requested tools against an authorized whitelist. Unapproved tools are instantly BLOCKED with DISALLOWED_TOOL.',
      takeaway: 'Principle-of-least-privilege at the gateway layer halts lateral movement and unauthorized tool escalation.',
    },
    {
      id: 'razorpay-protection',
      title: 'Razorpay Payment Protection',
      category: 'Payment Integration',
      icon: ShieldCheck,
      problem: 'Agent-initiated commerce checkouts can attempt unverified currencies, rogue amounts, or bypass merchant business logic.',
      expected: 'Merchant backend requests pre-flight evaluation. AgentGuard verifies limits and currencies. Razorpay orders are created ONLY on ALLOW.',
      takeaway: 'By placing AgentGuard as an authoritative pre-flight gateway, downstream Razorpay APIs are never called for blocked or held actions.',
    },
    {
      id: 'approval-required',
      title: 'Human-in-the-Loop Review (HITL)',
      category: 'Human Governance',
      icon: Clock,
      problem: 'High-value transactions execute without human oversight, creating serious financial liability and compliance risk.',
      expected: 'Operations exceeding the review threshold ($25.00) return HOLD, creating an immutable approval record with cryptographic digest.',
      takeaway: 'Dual-key authorization pauses sensitive operations until an authorized human operator grants a single-use token.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#0D0E11] text-[#F4F4F5] flex flex-col antialiased selection:bg-[#D7FF70] selection:text-[#0E1400]">
      {/* =========================================================================
          1. TOP NAVBAR
          ========================================================================= */}
      <header className="sticky top-0 z-50 bg-[#0D0E11]/90 backdrop-blur-md border-b border-white/[0.08] px-4 sm:px-8 py-3.5 transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#8C7CFF] to-[#D7FF70] p-[1.5px] flex items-center justify-center shadow-[0_0_15px_rgba(215,255,112,0.15)] group-hover:shadow-[0_0_20px_rgba(215,255,112,0.3)] transition-all">
              <div className="w-full h-full bg-[#111215] rounded-[10px] flex items-center justify-center font-black text-xs text-[#D7FF70]">
                AG
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-extrabold text-base tracking-tight text-white">
                Agent<span className="text-[#D7FF70]">Guard</span>
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-white/70 font-mono hidden sm:inline-block">
                Open Source
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-6 text-xs font-semibold text-[#8E929C]">
            <a href="#capabilities" className="hover:text-white transition-colors">
              Capabilities
            </a>
            <Link href="/scenarios" className="hover:text-white transition-colors flex items-center gap-1">
              <span>Scenarios</span>
              <span className="px-1.5 py-0.2 rounded bg-[#D7FF70]/10 text-[#D7FF70] text-[9px] font-bold">5 Demos</span>
            </Link>
            <a href="#razorpay" className="hover:text-white transition-colors">
              Razorpay Protection
            </a>
            <a href="#how-it-works" className="hover:text-white transition-colors">
              How It Works
            </a>
            <a href="#self-hosting" className="hover:text-white transition-colors">
              Self-Hosting
            </a>
            <Link href="/docs" className="hover:text-[#D7FF70] transition-colors">
              Documentation
            </Link>
            <Link href="/pricing" className="hover:text-white transition-colors">
              Open Source
            </Link>
          </nav>

          {/* Right Action CTAs */}
          <div className="flex items-center gap-3">
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#18191E] hover:bg-[#202228] text-white text-xs font-medium border border-[#272830] transition-colors"
            >
              <GithubIcon className="w-3.5 h-3.5 text-[#D7FF70]" />
              <span>GitHub</span>
            </a>

            {reviewer ? (
              <Link
                href="/dashboard"
                id="landing-cta-dashboard"
                className="px-4 py-2 rounded-full bg-[#D7FF70] text-[#0E1400] text-xs font-bold hover:bg-[#c4f250] transition-colors flex items-center gap-1.5 btn-press shadow-[0_0_20px_rgba(215,255,112,0.25)] min-h-[36px]"
              >
                <span>Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <Link
                href="/scenarios"
                id="landing-cta-scenarios"
                className="px-4 py-2 rounded-full bg-[#D7FF70] text-[#0E1400] text-xs font-bold hover:bg-[#c4f250] transition-colors flex items-center gap-1.5 btn-press shadow-[0_0_20px_rgba(215,255,112,0.25)] min-h-[36px]"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Try Scenarios</span>
              </Link>
            )}

            {/* Mobile Menu Toggle Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle Mobile Navigation"
              className="lg:hidden p-2 rounded-xl bg-[#1C1E24] border border-white/[0.08] text-white"
            >
              {mobileMenuOpen ? <X className="w-4 h-4 text-[#D7FF70]" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Slide-Out Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden mt-3 p-4 rounded-2xl bg-[#171717] border border-white/[0.08] space-y-3 animate-in fade-in duration-150">
            <nav className="flex flex-col space-y-2 text-xs font-semibold text-[#8E929C]">
              <a
                href="#capabilities"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-white/[0.04] hover:text-white"
              >
                Capabilities
              </a>
              <Link
                href="/scenarios"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-white/[0.04] text-[#D7FF70]"
              >
                Interactive Scenarios (5 Demos) &rarr;
              </Link>
              <a
                href="#razorpay"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-white/[0.04] hover:text-white"
              >
                Razorpay Protection
              </a>
              <a
                href="#how-it-works"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-white/[0.04] hover:text-white"
              >
                How It Works
              </a>
              <a
                href="#self-hosting"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-white/[0.04] hover:text-white"
              >
                Self-Hosting
              </a>
              <Link
                href="/docs"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-white/[0.04] text-white"
              >
                Documentation
              </Link>
              <Link
                href="/pricing"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-white/[0.04] hover:text-white"
              >
                Open Source &amp; Licensing
              </Link>
            </nav>
            <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#8E929C] hover:text-white font-semibold flex items-center gap-1"
              >
                <GithubIcon className="w-3.5 h-3.5" />
                <span>GitHub</span>
              </a>
              <Link
                href="/scenarios"
                className="px-3.5 py-1.5 rounded-full bg-[#D7FF70] text-[#0E1400] text-xs font-bold"
              >
                Explore Demos
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* =========================================================================
          2. HERO SECTION
          ========================================================================= */}
      <section className="relative pt-12 pb-20 sm:pt-20 sm:pb-28 px-4 sm:px-8 overflow-hidden">
        {/* Subtle Background Glow Elements */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-[#8C7CFF]/15 via-[#D7FF70]/10 to-transparent blur-[120px] rounded-full pointer-events-none" />

        <div className="max-w-5xl mx-auto text-center space-y-6 relative z-10">
          {/* Release Tag */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs text-[#8E929C] shadow-inner">
            <span className="w-2 h-2 rounded-full bg-[#D7FF70] animate-pulse" />
            <span className="text-white font-medium">100% Free Open-Source Security Gateway</span>
            <span className="text-white/20">&bull;</span>
            <span className="font-mono text-[#D7FF70] text-[11px]">MIT / Apache-2.0</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white tracking-tight leading-[1.08] max-w-4xl mx-auto">
            Give Every AI Agent a <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-[#D7FF70]">Security Guard.</span>
          </h1>

          {/* Subheading */}
          <p className="text-base sm:text-xl text-[#8E929C] max-w-2xl mx-auto leading-relaxed font-normal">
            AgentGuard is a self-hosted AI agent security gateway. It deterministically enforces spending caps, detects
            adversarial prompt injection, restricts high-privilege tools, and protects commerce checkouts like Razorpay and
            PayPal before payment operations execute.
          </p>

          {/* Primary Action Buttons */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3.5">
            <Link
              href="/scenarios"
              id="hero-explore-scenarios"
              className="px-7 py-3.5 rounded-full bg-[#D7FF70] text-[#0E1400] text-sm font-bold hover:bg-[#c4f250] transition-all duration-150 flex items-center gap-2 btn-press shadow-[0_0_30px_rgba(215,255,112,0.3)] min-h-[46px]"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Explore Scenarios</span>
            </Link>

            <Link
              href="/docs"
              id="hero-read-docs"
              className="px-7 py-3.5 rounded-full bg-[#18191E] hover:bg-[#202228] border border-white/[0.08] hover:border-white/20 text-sm font-semibold text-white transition-colors btn-press min-h-[46px] flex items-center gap-2"
            >
              <BookOpen className="w-4 h-4 text-[#D7FF70]" />
              <span>Read Documentation</span>
            </Link>

            <a
              href="#razorpay"
              className="px-6 py-3.5 rounded-full bg-[#18191E] hover:bg-[#202228] border border-white/[0.08] hover:border-white/20 text-sm font-semibold text-white transition-colors btn-press min-h-[46px] flex items-center gap-2"
            >
              <CreditCard className="w-4 h-4 text-[#D7FF70]" />
              <span>Integrate Razorpay</span>
            </a>

            <a
              href="#self-hosting"
              className="px-6 py-3.5 rounded-full bg-[#18191E] hover:bg-[#202228] border border-white/[0.08] hover:border-white/20 text-sm font-semibold text-white transition-colors btn-press min-h-[46px] flex items-center gap-2"
            >
              <Server className="w-4 h-4 text-[#D7FF70]" />
              <span>Self-Host AgentGuard</span>
            </a>

            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3.5 rounded-full bg-[#18191E] hover:bg-[#202228] border border-white/[0.08] hover:border-white/20 text-sm font-semibold text-white transition-colors btn-press min-h-[46px] flex items-center gap-2"
            >
              <GithubIcon className="w-4 h-4" />
              <span>View on GitHub</span>
            </a>
          </div>

          {/* Terminal Quickstart Snippet */}
          <div className="pt-6 max-w-xl mx-auto">
            <div className="p-3.5 rounded-2xl bg-[#111215] border border-white/[0.08] text-left shadow-2xl">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/[0.06] text-xs text-[#8E929C]">
                <div className="flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-[#D7FF70]" />
                  <span className="font-mono text-[11px]">Terminal &bull; Quickstart</span>
                </div>
                <button
                  onClick={copyQuickStart}
                  className="flex items-center gap-1 hover:text-white transition-colors text-[11px]"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-[#D7FF70]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div className="font-mono text-xs text-[#8E929C] space-y-1">
                <div>
                  <span className="text-[#D7FF70] select-none">$ </span>git clone {GITHUB_REPO_URL}
                </div>
                <div>
                  <span className="text-[#D7FF70] select-none">$ </span>cd agentguard &amp;&amp; docker compose up -d
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          3. PRODUCT CAPABILITIES (REAL CODEBASE VERIFIED)
          ========================================================================= */}
      <section id="capabilities" className="py-20 px-4 sm:px-8 border-t border-white/[0.06] bg-[#111215]/50">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <span className="text-xs font-bold text-[#D7FF70] uppercase tracking-wider">
              Core Capabilities
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Security Built Specifically for Agentic Workflows
            </h2>
            <p className="text-xs sm:text-sm text-[#8E929C] leading-relaxed">
              Every capability is backed by real, deterministic implementation in Fastify, PostgreSQL, and TypeScript.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Card 1 */}
            <div className="p-6 sm:p-7 rounded-3xl bg-[#171717] border border-white/[0.08] hover:border-white/20 transition-all flex flex-col justify-between space-y-4 shadow-xl">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-2xl bg-[#D7FF70]/10 border border-[#D7FF70]/20 flex items-center justify-center text-[#D7FF70]">
                  <Sliders className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  Deterministic Spending Limits
                </h3>
                <p className="text-xs text-[#8E929C] leading-relaxed">
                  Apply deterministic limits to every agent action. Single-tx spending caps ($50 max), rolling daily budget caps ($200), currency allowlists (INR, USD, EUR, GBP), and recipient denylists.
                </p>
              </div>
              <div className="pt-2 text-[11px] text-[#D7FF70] font-mono flex items-center gap-1">
                <span>Deterministic Deny-by-Default</span>
              </div>
            </div>

            {/* Card 2 */}
            <div className="p-6 sm:p-7 rounded-3xl bg-[#171717] border border-white/[0.08] hover:border-white/20 transition-all flex flex-col justify-between space-y-4 shadow-xl">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-2xl bg-[#8C7CFF]/10 border border-[#8C7CFF]/20 flex items-center justify-center text-[#8C7CFF]">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  Prompt Injection Defense
                </h3>
                <p className="text-xs text-[#8E929C] leading-relaxed">
                  Inspect untrusted text for adversarial prompt injection, jailbreaks, delimiter hijacking, and system prompt leaks before agents call tools or downstream APIs.
                </p>
              </div>
              <div className="pt-2 text-[11px] text-[#8C7CFF] font-mono flex items-center gap-1">
                <span>Dual-Phase Heuristic Scanner</span>
              </div>
            </div>

            {/* Card 3 */}
            <div className="p-6 sm:p-7 rounded-3xl bg-[#171717] border border-white/[0.08] hover:border-white/20 transition-all flex flex-col justify-between space-y-4 shadow-xl">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-2xl bg-[#38BDF8]/10 border border-[#38BDF8]/20 flex items-center justify-center text-[#38BDF8]">
                  <Clock className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  Human-in-the-Loop Review
                </h3>
                <p className="text-xs text-[#8E929C] leading-relaxed">
                  High-value transactions trigger an authoritative HOLD state. Actions are locked with an immutable cryptographic digest until an operator issues a single-use token.
                </p>
              </div>
              <div className="pt-2 text-[11px] text-[#38BDF8] font-mono flex items-center gap-1">
                <span>Dual-Key Escrow Execution</span>
              </div>
            </div>

            {/* Card 4 */}
            <div className="p-6 sm:p-7 rounded-3xl bg-[#171717] border border-white/[0.08] hover:border-white/20 transition-all flex flex-col justify-between space-y-4 shadow-xl">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-2xl bg-[#F43F5E]/10 border border-[#F43F5E]/20 flex items-center justify-center text-[#F43F5E]">
                  <Lock className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  Least Privilege Tool Whitelisting
                </h3>
                <p className="text-xs text-[#8E929C] leading-relaxed">
                  Restrict agent execution to explicit tool namespaces. Any request invoking unapproved tools (shell_executor, raw SQL) is blocked at the gateway before reaching infrastructure.
                </p>
              </div>
              <div className="pt-2 text-[11px] text-[#F43F5E] font-mono flex items-center gap-1">
                <span>Tool Namespace Isolation</span>
              </div>
            </div>

            {/* Card 5 */}
            <div className="p-6 sm:p-7 rounded-3xl bg-[#171717] border border-white/[0.08] hover:border-white/20 transition-all flex flex-col justify-between space-y-4 shadow-xl">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-2xl bg-[#D7FF70]/10 border border-[#D7FF70]/20 flex items-center justify-center text-[#D7FF70]">
                  <CreditCard className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  Razorpay &amp; Commerce Gateway
                </h3>
                <p className="text-xs text-[#8E929C] leading-relaxed">
                  Pre-flight policy evaluation for Razorpay and PayPal checkouts. Enforce amount, currency, and customer parameters before calling payment APIs. Verify HMAC signatures.
                </p>
              </div>
              <div className="pt-2 text-[11px] text-[#D7FF70] font-mono flex items-center gap-1">
                <span>Pre-Flight Commerce Guard</span>
              </div>
            </div>

            {/* Card 6 */}
            <div className="p-6 sm:p-7 rounded-3xl bg-[#171717] border border-white/[0.08] hover:border-white/20 transition-all flex flex-col justify-between space-y-4 shadow-xl">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-2xl bg-[#A855F7]/10 border border-[#A855F7]/20 flex items-center justify-center text-[#A855F7]">
                  <FileSearch className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  Forensic Tamper-Evident Audit
                </h3>
                <p className="text-xs text-[#8E929C] leading-relaxed">
                  Every decision, scan, and order creation is logged to PostgreSQL with immutable requestId, sha256 digests, and policy versioning for complete auditability.
                </p>
              </div>
              <div className="pt-2 text-[11px] text-[#A855F7] font-mono flex items-center gap-1">
                <span>Append-Only Forensic Ledger</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. PROMINENT SCENARIOS SECTION (REQUIREMENT 2 & 3)
          ========================================================================= */}
      <section id="scenarios" className="py-20 px-4 sm:px-8 border-t border-white/[0.06] bg-[#0D0E11]">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#D7FF70]/10 border border-[#D7FF70]/30 text-[#D7FF70] text-xs font-semibold uppercase tracking-wider">
                <Terminal className="w-3.5 h-3.5" />
                <span>Interactive Public Demos</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                Real Security Scenarios, Tested Live
              </h2>
              <p className="text-xs sm:text-sm text-[#8E929C] leading-relaxed">
                These are not hardcoded frontend animations. Each scenario sends real evaluation requests to AgentGuard’s
                Fastify backend, executes policy rules, and returns genuine decisions.
              </p>
            </div>

            <div>
              <Link
                href="/scenarios"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#D7FF70] text-[#0D0E11] text-xs font-bold hover:bg-[#c4f250] transition-colors"
              >
                <span>Open Full Workbench</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {scenariosList.map((scenario) => {
              const Icon = scenario.icon;
              return (
                <div
                  key={scenario.id}
                  className="p-6 rounded-2xl bg-[#14151A] border border-[#22232A] hover:border-[#353744] transition-all flex flex-col justify-between space-y-5"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-[#D7FF70]/10 border border-[#D7FF70]/20 flex items-center justify-center text-[#D7FF70]">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-semibold text-[#52535E] uppercase tracking-wider">
                        {scenario.category}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-white tracking-tight">{scenario.title}</h3>

                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold text-[#FF6B6B] flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        <span>Security Problem</span>
                      </div>
                      <p className="text-xs text-[#9496A1] leading-relaxed">{scenario.problem}</p>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold text-[#D7FF70] flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Expected Behavior</span>
                      </div>
                      <p className="text-xs text-[#9496A1] leading-relaxed">{scenario.expected}</p>
                    </div>

                    <div className="p-3 rounded-lg bg-[#0D0E11] border border-[#22232A] text-[11px] text-[#8E929C] leading-relaxed">
                      <span className="text-white font-medium">Developer Takeaway: </span>
                      {scenario.takeaway}
                    </div>
                  </div>

                  <div className="pt-2">
                    <Link
                      href={`/scenarios`}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#1E2028] hover:bg-[#252833] text-white text-xs font-semibold border border-[#2B2D38] hover:border-[#D7FF70]/40 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 text-[#D7FF70] fill-current" />
                      <span>Run Demo in Workbench</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* =========================================================================
          5. RAZORPAY INTEGRATION SHOWCASE (REQUIREMENT 4 & 6)
          ========================================================================= */}
      <section id="razorpay" className="py-20 px-4 sm:px-8 border-t border-white/[0.06] bg-[#111215]/50">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <span className="text-xs font-bold text-[#D7FF70] uppercase tracking-wider">
              Commerce &amp; Payment Gateway Protection
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Pre-Flight Security for Razorpay Operations
            </h2>
            <p className="text-xs sm:text-sm text-[#8E929C] leading-relaxed">
              AgentGuard evaluates transactions before orders are created on Razorpay. Held or blocked actions never touch
              payment rails, and all completed payments are cryptographically verified using HMAC-SHA256 signatures.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            {/* Step-by-Step Flow */}
            <div className="space-y-4">
              <div className="p-5 rounded-xl bg-[#171717] border border-white/[0.08] flex items-start gap-4">
                <div className="w-8 h-8 rounded-lg bg-[#D7FF70]/10 border border-[#D7FF70]/20 flex items-center justify-center text-[#D7FF70] font-mono text-sm font-bold shrink-0">
                  1
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white">Customer Requests Payment</h4>
                  <p className="text-xs text-[#8E929C] leading-relaxed">
                    AI agent or customer initiates an order. The merchant backend validates currency, customer identity, and
                    amount.
                  </p>
                </div>
              </div>

              <div className="p-5 rounded-xl bg-[#171717] border border-white/[0.08] flex items-start gap-4">
                <div className="w-8 h-8 rounded-lg bg-[#D7FF70]/10 border border-[#D7FF70]/20 flex items-center justify-center text-[#D7FF70] font-mono text-sm font-bold shrink-0">
                  2
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white">AgentGuard Evaluates Action (Fail-Closed)</h4>
                  <p className="text-xs text-[#8E929C] leading-relaxed">
                    Merchant calls AgentGuard policy engine. If the gateway is down or times out, the client authoritatively
                    fails closed and blocks the transaction.
                  </p>
                </div>
              </div>

              <div className="p-5 rounded-xl bg-[#171717] border border-white/[0.08] flex items-start gap-4">
                <div className="w-8 h-8 rounded-lg bg-[#D7FF70]/10 border border-[#D7FF70]/20 flex items-center justify-center text-[#D7FF70] font-mono text-sm font-bold shrink-0">
                  3
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white">Conditional Razorpay Execution</h4>
                  <p className="text-xs text-[#8E929C] leading-relaxed">
                    Only <span className="text-[#D7FF70] font-semibold">ALLOW</span> triggers Razorpay order creation. <span className="text-[#FFD166] font-semibold">HOLD</span> triggers human reviewer review, and <span className="text-[#FF6B6B] font-semibold">BLOCK</span> immediately rejects the operation.
                  </p>
                </div>
              </div>

              <div className="p-5 rounded-xl bg-[#171717] border border-white/[0.08] flex items-start gap-4">
                <div className="w-8 h-8 rounded-lg bg-[#D7FF70]/10 border border-[#D7FF70]/20 flex items-center justify-center text-[#D7FF70] font-mono text-sm font-bold shrink-0">
                  4
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white">HMAC-SHA256 Signature Verification</h4>
                  <p className="text-xs text-[#8E929C] leading-relaxed">
                    Orders are only marked as PAID after verifying cryptographic payment and webhook signatures using
                    constant-time comparison.
                  </p>
                </div>
              </div>
            </div>

            {/* Code Sample Preview */}
            <div className="p-6 rounded-2xl bg-[#0A0B0D] border border-white/[0.08] space-y-4">
              <div className="flex items-center justify-between text-xs text-[#8E929C] pb-2 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-[#D7FF70]" />
                  <span className="font-mono text-white">merchant-backend.ts</span>
                </div>
                <span className="text-[10px] text-[#52535E]">TypeScript SDK</span>
              </div>

              <div className="font-mono text-xs text-[#8E929C] space-y-2 leading-relaxed overflow-x-auto">
                <div className="text-[#52535E]">{'// 1. Pre-flight evaluation before calling Razorpay'}</div>
                <div>
                  <span className="text-[#8C7CFF]">const</span> evaluation = <span className="text-[#8C7CFF]">await</span> agentGuard.<span className="text-[#D7FF70]">evaluatePayment</span>({'{'}
                </div>
                <div className="pl-4">agentId: <span className="text-[#A3E635]">&apos;travel-agent-01&apos;</span>,</div>
                <div className="pl-4">amount: <span className="text-[#38BDF8]">3500</span>,</div>
                <div className="pl-4">currency: <span className="text-[#A3E635]">&apos;INR&apos;</span>,</div>
                <div className="pl-4">tool: <span className="text-[#A3E635]">&apos;razorpay_payment&apos;</span></div>
                <div>{'}'});</div>
                <div className="pt-2 text-[#52535E]">{'// 2. Enforce decision: NEVER proceed on HOLD or BLOCK'}</div>
                <div>
                  <span className="text-[#8C7CFF]">if</span> (evaluation.decision !== <span className="text-[#D7FF70]">&apos;ALLOW&apos;</span>) {'{'}
                </div>
                <div className="pl-4 text-[#FF6B6B]">
                  <span className="text-[#8C7CFF]">throw new</span> Error(evaluation.reason);
                </div>
                <div>{'}'}</div>
                <div className="pt-2 text-[#52535E]">{'// 3. Safe to execute downstream Razorpay order'}</div>
                <div>
                  <span className="text-[#8C7CFF]">const</span> order = <span className="text-[#8C7CFF]">await</span> razorpay.orders.<span className="text-[#D7FF70]">create</span>({'{'} ... {'}'});
                </div>
              </div>

              <div className="pt-2 flex flex-wrap gap-3">
                <Link
                  href="/docs"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#D7FF70] text-[#0D0E11] text-xs font-bold hover:bg-[#c4f250] transition-colors"
                >
                  <span>Integrate Razorpay</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <Link
                  href="/scenarios"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#18191E] border border-[#272830] text-white text-xs font-medium hover:bg-[#202228] transition-colors"
                >
                  <Play className="w-3 h-3 text-[#D7FF70] fill-current" />
                  <span>Run Scenario D Demo</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          6. HOW IT WORKS ARCHITECTURE
          ========================================================================= */}
      <section id="how-it-works" className="py-20 px-4 sm:px-8 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <span className="text-xs font-bold text-[#D7FF70] uppercase tracking-wider">
              System Architecture
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Deterministic Dual-Phase Decision Engine
            </h2>
            <p className="text-xs sm:text-sm text-[#8E929C] leading-relaxed">
              Decisions are calculated through code rules and mathematical constraints, with complete isolation from
              untrusted client input.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-[#14151A] border border-[#22232A] space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#D7FF70]/10 border border-[#D7FF70]/20 flex items-center justify-center text-[#D7FF70] font-mono font-bold">
                P1
              </div>
              <h3 className="text-base font-bold text-white">Pre-Flight Interception</h3>
              <p className="text-xs text-[#8E929C] leading-relaxed">
                Agent actions hit the AgentGuard proxy. Payloads are checked for prompt injection, disallowed tool names,
                and malicious delimiters.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#14151A] border border-[#22232A] space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#D7FF70]/10 border border-[#D7FF70]/20 flex items-center justify-center text-[#D7FF70] font-mono font-bold">
                P2
              </div>
              <h3 className="text-base font-bold text-white">Deterministic Evaluation</h3>
              <p className="text-xs text-[#8E929C] leading-relaxed">
                The policy engine evaluates limits: max transaction amounts, cumulative daily spends, velocity windows, and
                human approval thresholds.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#14151A] border border-[#22232A] space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#D7FF70]/10 border border-[#D7FF70]/20 flex items-center justify-center text-[#D7FF70] font-mono font-bold">
                P3
              </div>
              <h3 className="text-base font-bold text-white">Guarded Execution &amp; Ledger</h3>
              <p className="text-xs text-[#8E929C] leading-relaxed">
                ALLOW issues a cryptographic authorization token. Execution is strictly tied to token validation, and every
                event is recorded in PostgreSQL.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          7. SELF-HOSTING & GETTING STARTED
          ========================================================================= */}
      <section id="self-hosting" className="py-20 px-4 sm:px-8 border-t border-white/[0.06] bg-[#111215]/50">
        <div className="max-w-5xl mx-auto space-y-10 text-center">
          <div className="space-y-3 max-w-2xl mx-auto">
            <span className="text-xs font-bold text-[#D7FF70] uppercase tracking-wider">
              Self-Host Anywhere
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Own Your Security Gateway. Free Forever.
            </h2>
            <p className="text-xs sm:text-sm text-[#8E929C] leading-relaxed">
              AgentGuard is 100% open-source software under the MIT/Apache-2.0 license. Run it on your laptop, an internal
              VPC, or a $5 VPS with Docker Compose.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#0A0B0D] border border-white/[0.08] text-left max-w-2xl mx-auto font-mono text-xs space-y-2 text-[#8E929C]">
            <div className="text-[#52535E]"># Clone and run in one command</div>
            <div className="text-white">git clone {GITHUB_REPO_URL}</div>
            <div className="text-white">cd agentguard &amp;&amp; docker compose up -d</div>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/scenarios"
              className="px-8 py-3.5 rounded-full bg-[#D7FF70] text-[#0E1400] text-sm font-bold hover:bg-[#c4f250] transition-colors btn-press shadow-[0_0_25px_rgba(215,255,112,0.25)] min-h-[46px] flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Explore Scenarios</span>
            </Link>
            <Link
              href="/docs"
              className="px-7 py-3.5 rounded-full bg-[#171717] hover:bg-[#222222] border border-white/[0.08] hover:border-white/20 text-sm font-semibold text-white transition-colors btn-press min-h-[46px]"
            >
              <span>Read Documentation</span>
            </Link>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-7 py-3.5 rounded-full bg-[#171717] hover:bg-[#222222] border border-white/[0.08] hover:border-white/20 text-sm font-semibold text-white transition-colors btn-press min-h-[46px] flex items-center gap-2"
            >
              <GithubIcon className="w-4 h-4" />
              <span>View on GitHub</span>
            </a>
          </div>
        </div>
      </section>

      {/* =========================================================================
          8. FOOTER
          ========================================================================= */}
      <footer className="border-t border-white/[0.08] bg-[#0D0E11] px-4 sm:px-8 py-12 text-xs text-[#8E929C]">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 pb-10 border-b border-white/[0.06]">
          {/* Col 1 */}
          <div className="space-y-3 col-span-2 md:col-span-1">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-[#D7FF70] flex items-center justify-center font-black text-[10px] text-[#0E1400]">
                AG
              </div>
              <span className="font-bold text-white text-sm">AgentGuard</span>
            </div>
            <p className="text-xs text-[#8E929C] leading-relaxed">
              Open-source deterministic security gateway for autonomous AI agents, payment protection, and compliance.
            </p>
            <div className="text-[11px] text-[#8E929C]">
              MIT / Apache-2.0 License &bull; Free &amp; Open Source
            </div>
          </div>

          {/* Col 2 */}
          <div className="space-y-2.5">
            <div className="font-bold text-white text-xs uppercase tracking-wider">Features</div>
            <ul className="space-y-1.5">
              <li>
                <Link href="/scenarios" className="text-[#D7FF70] hover:underline font-semibold">
                  Interactive Scenarios
                </Link>
              </li>
              <li>
                <a href="#razorpay" className="hover:text-white transition-colors">
                  Razorpay Protection
                </a>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-white transition-colors">
                  Operator Dashboard
                </Link>
              </li>
              <li>
                <Link href="/approvals" className="hover:text-white transition-colors">
                  Pending Approvals
                </Link>
              </li>
              <li>
                <Link href="/transactions" className="hover:text-white transition-colors">
                  Transactions Ledger
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3 */}
          <div className="space-y-2.5">
            <div className="font-bold text-white text-xs uppercase tracking-wider">Developers</div>
            <ul className="space-y-1.5">
              <li>
                <Link href="/docs" className="hover:text-white transition-colors">
                  Documentation &amp; API
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-white transition-colors">
                  Open Source &amp; Licensing
                </Link>
              </li>
              <li>
                <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors flex items-center gap-1">
                  <span>GitHub Repository</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>
                <Link href="/integrations" className="hover:text-white transition-colors">
                  Integrations &amp; Probes
                </Link>
              </li>
              <li>
                <Link href="/policies" className="hover:text-white transition-colors">
                  Policies &amp; Rules
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 4 */}
          <div className="space-y-2.5">
            <div className="font-bold text-white text-xs uppercase tracking-wider">Gateway</div>
            <ul className="space-y-1.5">
              <li>
                <span className="text-emerald-400 font-mono">Port 3001: Gateway API</span>
              </li>
              <li>
                <span className="text-white font-mono">Port 3000: Dashboard</span>
              </li>
              <li>
                <span className="text-[#8C7CFF] font-mono">Postgres 16</span>
              </li>
              <li>
                <span className="text-[#38BDF8] font-mono">Razorpay &amp; PayPal</span>
              </li>
              <li>
                <Link href="/settings" className="hover:text-white transition-colors">
                  Settings &amp; Audit
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px]">
          <div>
            &copy; {new Date().getFullYear()} AgentGuard Open Source Community. All code licensed under MIT / Apache-2.0.
          </div>
          <div className="flex items-center gap-4">
            <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
            <Link href="/scenarios" className="hover:text-white transition-colors">Scenarios</Link>
            <Link href="/pricing" className="hover:text-white transition-colors">Open Source</Link>
            <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
