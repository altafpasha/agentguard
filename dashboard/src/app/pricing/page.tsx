'use client';

import React from 'react';
import Link from 'next/link';
import {
  Shield,
  Server,
  Terminal,
  CheckCircle2,
  FileCode,
  DollarSign,
  Cpu,
  Database,
  CreditCard,
  ExternalLink,
  BookOpen,
  ArrowRight,
  Heart,
  Lock,
} from 'lucide-react';
import { Navigation } from '../../components/Navigation';
import { GithubIcon } from '../../components/GithubIcon';

export default function PricingPage() {
  const GITHUB_REPO_URL = 'https://github.com/altafpasha/agentguard';

  return (
    <div className="min-h-screen bg-[#0D0E11] text-[#F4F4F5]">
      <Navigation />

      <main className="max-w-[1300px] mx-auto px-4 lg:px-8 py-12 space-y-16">
        {/* Hero Section */}
        <div className="text-center space-y-5 max-w-3xl mx-auto pt-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#D7FF70]/10 border border-[#D7FF70]/30 text-[#D7FF70] text-xs font-semibold uppercase tracking-wider">
            <Shield className="w-3.5 h-3.5" />
            <span>100% Free & Open-Source Security Gateway</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Free Forever. Self-Hosted. <br />
            <span className="text-[#D7FF70]">Zero SaaS Lock-in.</span>
          </h1>

          <p className="text-base sm:text-lg text-[#9496A1] leading-relaxed max-w-2xl mx-auto">
            AgentGuard is not a paid closed-source SaaS. It is an open-source, deterministic security gateway you can
            inspect, modify, and self-host on your own infrastructure with complete sovereignty.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#D7FF70] hover:bg-[#cbf560] text-[#0D0E11] text-sm font-semibold transition-colors shadow-lg shadow-[#D7FF70]/10"
            >
              <GithubIcon className="w-4 h-4" />
              <span>View on GitHub</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>

            <Link
              href="/docs"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#18191E] hover:bg-[#202228] text-white text-sm font-medium border border-[#272830] transition-colors"
            >
              <BookOpen className="w-4 h-4 text-[#D7FF70]" />
              <span>Read Documentation</span>
            </Link>

            <Link
              href="/scenarios"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#18191E] hover:bg-[#202228] text-white text-sm font-medium border border-[#272830] transition-colors"
            >
              <Terminal className="w-4 h-4 text-[#D7FF70]" />
              <span>Explore Scenarios</span>
            </Link>
          </div>
        </div>

        {/* Core Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-xl bg-[#131418] border border-[#22232A] space-y-3">
            <div className="w-10 h-10 rounded-lg bg-[#D7FF70]/10 border border-[#D7FF70]/20 flex items-center justify-center text-[#D7FF70]">
              <DollarSign className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-white">$0 Software License</h3>
            <p className="text-sm text-[#9496A1] leading-relaxed">
              No artificial per-agent limits, no tier paywalls, no monthly subscription fees. The core gateway, policy
              engine, scanner, and audit log are completely free.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-[#131418] border border-[#22232A] space-y-3">
            <div className="w-10 h-10 rounded-lg bg-[#D7FF70]/10 border border-[#D7FF70]/20 flex items-center justify-center text-[#D7FF70]">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-white">Full Data Sovereignty</h3>
            <p className="text-sm text-[#9496A1] leading-relaxed">
              Your API credentials, payment tokens, prompt payloads, and audit logs never leave your servers or VPC. Zero
              telemetry or secret harvesting.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-[#131418] border border-[#22232A] space-y-3">
            <div className="w-10 h-10 rounded-lg bg-[#D7FF70]/10 border border-[#D7FF70]/20 flex items-center justify-center text-[#D7FF70]">
              <FileCode className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-white">Auditable & Extensible</h3>
            <p className="text-sm text-[#9496A1] leading-relaxed">
              Inspect the exact logic enforcing spending limits, tool authorization, and prompt scanning. Fork and tailor
              custom policy rules to your security compliance needs.
            </p>
          </div>
        </div>

        {/* Honest Infrastructure & Hosting Cost Breakdown */}
        <div className="p-8 rounded-xl bg-[#131418] border border-[#22232A] space-y-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#D7FF70] uppercase tracking-wider">
              <Server className="w-3.5 h-3.5" />
              <span>Transparent Cost Breakdown</span>
            </div>
            <h2 className="text-2xl font-bold text-white">What Does It Cost to Run AgentGuard?</h2>
            <p className="text-sm text-[#9496A1] max-w-3xl">
              While AgentGuard itself is 100% free software, production deployments involve standard infrastructure and
              payment gateway fees. Here is an honest breakdown of real costs:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-lg bg-[#18191E] border border-[#272830] space-y-2">
              <div className="text-xs text-[#9496A1] uppercase font-semibold">AgentGuard Core</div>
              <div className="text-2xl font-bold text-[#D7FF70]">$0 / month</div>
              <div className="text-xs text-[#9496A1] leading-relaxed">
                Open-source repository. Free for personal, academic, and commercial production use.
              </div>
            </div>

            <div className="p-5 rounded-lg bg-[#18191E] border border-[#272830] space-y-2">
              <div className="text-xs text-[#9496A1] uppercase font-semibold">VPS / Compute Host</div>
              <div className="text-2xl font-bold text-white">$5 – $20 / mo</div>
              <div className="text-xs text-[#9496A1] leading-relaxed">
                Lightweight footprint. Runs comfortably on a 1 vCPU / 2GB RAM VPS (Hetzner, DigitalOcean, AWS, Linode).
              </div>
            </div>

            <div className="p-5 rounded-lg bg-[#18191E] border border-[#272830] space-y-2">
              <div className="text-xs text-[#9496A1] uppercase font-semibold">PostgreSQL Database</div>
              <div className="text-2xl font-bold text-white">$0 – $15 / mo</div>
              <div className="text-xs text-[#9496A1] leading-relaxed">
                Use the bundled Docker PostgreSQL instance ($0) or managed cloud Postgres (Supabase, Neon, AWS RDS).
              </div>
            </div>

            <div className="p-5 rounded-lg bg-[#18191E] border border-[#272830] space-y-2">
              <div className="text-xs text-[#9496A1] uppercase font-semibold">Payment Gateway (Razorpay/PayPal)</div>
              <div className="text-2xl font-bold text-white">Standard % Fee</div>
              <div className="text-xs text-[#9496A1] leading-relaxed">
                Standard payment processing fees charged directly by Razorpay or PayPal. AgentGuard takes 0% commission.
              </div>
            </div>
          </div>
        </div>

        {/* Deployment & Quickstart Guide */}
        <div className="p-8 rounded-xl bg-[#131418] border border-[#22232A] space-y-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#D7FF70] uppercase tracking-wider">
              <Terminal className="w-3.5 h-3.5" />
              <span>Self-Hosting Guide</span>
            </div>
            <h2 className="text-2xl font-bold text-white">How to Get Started in 60 Seconds</h2>
            <p className="text-sm text-[#9496A1]">
              Clone the repository, configure your environment variables, and launch using Docker Compose.
            </p>
          </div>

          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-[#0A0B0D] border border-[#22232A] font-mono text-sm space-y-2 text-[#9496A1]">
              <div className="text-xs text-[#52535E] select-none"># 1. Clone the verified open-source repository</div>
              <div className="text-white">git clone https://github.com/altafpasha/agentguard.git</div>
              <div className="text-white">cd agentguard</div>
              <div className="text-xs text-[#52535E] select-none pt-2"># 2. Configure environment variables</div>
              <div className="text-white">cp .env.example .env</div>
              <div className="text-xs text-[#52535E] select-none pt-2"># 3. Spin up Gateway, Postgres, and Dashboard</div>
              <div className="text-[#D7FF70]">docker compose up -d</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-lg bg-[#18191E] border border-[#272830] space-y-1">
                <div className="text-xs text-[#9496A1]">Security Gateway API</div>
                <div className="text-sm font-semibold text-white font-mono">http://localhost:3001</div>
                <div className="text-xs text-[#52535E]">Fastify Policy & Scanner Engine</div>
              </div>

              <div className="p-4 rounded-lg bg-[#18191E] border border-[#272830] space-y-1">
                <div className="text-xs text-[#9496A1]">Management Dashboard</div>
                <div className="text-sm font-semibold text-white font-mono">http://localhost:3000</div>
                <div className="text-xs text-[#52535E]">Next.js Reviewer & Audit Workbench</div>
              </div>

              <div className="p-4 rounded-lg bg-[#18191E] border border-[#272830] space-y-1">
                <div className="text-xs text-[#9496A1]">Interactive Scenarios</div>
                <div className="text-sm font-semibold text-white font-mono">http://localhost:3000/scenarios</div>
                <div className="text-xs text-[#52535E]">Live Attack & Payment Demos</div>
              </div>
            </div>
          </div>
        </div>

        {/* Comparison: Open Source vs Closed SaaS */}
        <div className="p-8 rounded-xl bg-[#131418] border border-[#22232A] space-y-6">
          <h2 className="text-2xl font-bold text-white">Why Self-Hosted Open Source Wins for AI Security</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#272830] text-[#9496A1]">
                  <th className="py-3 px-4 font-medium">Capability</th>
                  <th className="py-3 px-4 font-semibold text-[#D7FF70]">AgentGuard (Open Source)</th>
                  <th className="py-3 px-4 font-medium text-[#71717A]">Typical Closed SaaS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#22232A] text-[#9496A1]">
                <tr>
                  <td className="py-3.5 px-4 text-white font-medium">Pricing Model</td>
                  <td className="py-3.5 px-4 text-[#D7FF70] font-semibold">100% Free, Apache/MIT licensed</td>
                  <td className="py-3.5 px-4 text-[#71717A]">$99 - $500+/mo per agent</td>
                </tr>
                <tr>
                  <td className="py-3.5 px-4 text-white font-medium">Data Privacy & Prompts</td>
                  <td className="py-3.5 px-4 text-[#D7FF70] font-semibold">Stays entirely inside your infrastructure</td>
                  <td className="py-3.5 px-4 text-[#71717A]">Sent to 3rd party SaaS servers</td>
                </tr>
                <tr>
                  <td className="py-3.5 px-4 text-white font-medium">Payment API Credentials</td>
                  <td className="py-3.5 px-4 text-[#D7FF70] font-semibold">Only your backend holds Razorpay/PayPal keys</td>
                  <td className="py-3.5 px-4 text-[#71717A]">Requires delegating API keys</td>
                </tr>
                <tr>
                  <td className="py-3.5 px-4 text-white font-medium">Deterministic Rule Audit</td>
                  <td className="py-3.5 px-4 text-[#D7FF70] font-semibold">Full source code inspection & custom rules</td>
                  <td className="py-3.5 px-4 text-[#71717A]">Black box heuristics</td>
                </tr>
                <tr>
                  <td className="py-3.5 px-4 text-white font-medium">Network Latency</td>
                  <td className="py-3.5 px-4 text-[#D7FF70] font-semibold">Sub-millisecond local network loop</td>
                  <td className="py-3.5 px-4 text-[#71717A]">100ms+ roundtrip SaaS overhead</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Community & Contributing */}
        <div className="text-center p-8 rounded-xl bg-gradient-to-b from-[#18191E] to-[#111215] border border-[#272830] space-y-4">
          <Heart className="w-8 h-8 text-[#D7FF70] mx-auto" />
          <h2 className="text-2xl font-bold text-white">Built by Developers, for Developers</h2>
          <p className="text-sm text-[#9496A1] max-w-xl mx-auto">
            AgentGuard is actively maintained and welcomes community contributions, security disclosures, and feedback.
          </p>
          <div className="pt-2 flex items-center justify-center gap-4">
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#D7FF70] hover:bg-[#cbf560] text-[#0D0E11] text-sm font-semibold transition-colors"
            >
              <GithubIcon className="w-4 h-4" />
              <span>Contribute on GitHub</span>
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
