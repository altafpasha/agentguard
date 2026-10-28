'use client';

import React from 'react';
import Link from 'next/link';
import {
  Plug,
  BookOpen,
  ArrowRight,
  Activity,
  FileCode,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';

interface DocsAndIntegrationsCardsProps {
  gatewayVersion?: string;
  isGatewayOnline?: boolean;
}

export function DocsAndIntegrationsCards({
  gatewayVersion = '1.0.0',
  isGatewayOnline = true,
}: DocsAndIntegrationsCardsProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#D7FF70]" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#8E929C]">
            System Resources &amp; Probes
          </h2>
        </div>
        <span className="text-[11px] text-[#8E929C]">
          v{gatewayVersion} &bull; Self-Hosted
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
        {/* 1. Integrations Card */}
        <div
          id="dashboard-integrations-card"
          className="bg-[#222222] border border-white/[0.08] hover:border-white/20 rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-xl transition-all h-full min-w-0"
        >
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-[#D7FF70]/10 border border-[#D7FF70]/20 flex items-center justify-center text-[#D7FF70] shrink-0">
                  <Plug className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white tracking-tight truncate">
                    Integrations &amp; Probes
                  </h3>
                  <p className="text-[11px] text-[#8E929C] truncate mt-0.5">
                    Live probes for Core Gateway, DB, PayPal &amp; AI
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-semibold shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>4 Active Probes</span>
              </span>
            </div>

            {/* Description */}
            <p className="text-xs text-[#8E929C] leading-relaxed">
              Verify runtime subsystem health, inspect round-trip API latencies, and dynamically test custom credentials for PayPal Sandbox, OpenRouter AI, and PostgreSQL durable storage.
            </p>

            {/* 4 Feature Chips in 2x2 Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div className="p-2.5 rounded-xl bg-[#171717] border border-white/[0.05] flex items-center justify-between min-w-0">
                <span className="text-[#8E929C] text-[11px] truncate">Core Gateway:</span>
                <span className="font-mono text-white text-[11px] font-semibold shrink-0">Port 3001</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#171717] border border-white/[0.05] flex items-center justify-between min-w-0">
                <span className="text-[#8E929C] text-[11px] truncate">Audit DB:</span>
                <span className="font-mono text-[#D7FF70] text-[11px] font-semibold shrink-0">Postgres 16</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#171717] border border-white/[0.05] flex items-center justify-between min-w-0">
                <span className="text-[#8E929C] text-[11px] truncate">Sandbox:</span>
                <span className="font-mono text-[#38BDF8] text-[11px] font-semibold shrink-0">PayPal v2</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#171717] border border-white/[0.05] flex items-center justify-between min-w-0">
                <span className="text-[#8E929C] text-[11px] truncate">AI Scanner:</span>
                <span className="font-mono text-[#A78BFA] text-[11px] font-semibold shrink-0">OpenRouter</span>
              </div>
            </div>
          </div>

          {/* Footer - Pinned to Bottom */}
          <div className="mt-auto pt-5 border-t border-white/[0.06] flex items-center justify-between gap-3">
            <div className="text-[11px] text-[#8E929C] flex items-center gap-1.5 min-w-0">
              <Activity className="w-3.5 h-3.5 text-[#D7FF70] shrink-0" />
              <span className="truncate">Automated periodic polling</span>
            </div>
            <Link
              href="/integrations"
              id="btn-goto-integrations"
              className="px-4 py-2 rounded-full bg-[#171717] hover:bg-[#282828] border border-white/[0.08] hover:border-[#D7FF70]/40 text-xs font-semibold text-white hover:text-[#D7FF70] transition-all flex items-center gap-1.5 btn-press min-h-[36px] shrink-0"
            >
              <span>Manage Integrations</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* 2. Docs Card */}
        <div
          id="dashboard-docs-card"
          className="bg-[#222222] border border-white/[0.08] hover:border-white/20 rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-xl transition-all h-full min-w-0"
        >
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-[#8C7CFF]/10 border border-[#8C7CFF]/20 flex items-center justify-center text-[#8C7CFF] shrink-0">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white tracking-tight truncate">
                    Documentation &amp; Guides
                  </h3>
                  <p className="text-[11px] text-[#8E929C] truncate mt-0.5">
                    Architecture, self-hosting &amp; API developer specs
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.1] text-white/80 text-[11px] font-mono shrink-0">
                v{gatewayVersion} Specs
              </span>
            </div>

            {/* Description */}
            <p className="text-xs text-[#8E929C] leading-relaxed">
              Explore technical guides covering 4-layer defense architecture, deterministic policy rules, human approval workflows, self-hosted Docker deployment, and Fastify REST API schemas.
            </p>

            {/* 4 Feature Chips in 2x2 Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div className="p-2.5 rounded-xl bg-[#171717] border border-white/[0.05] flex items-center justify-between min-w-0">
                <span className="text-[#8E929C] text-[11px] truncate">Architecture:</span>
                <span className="text-white text-[11px] font-medium shrink-0">4-Layer Defense</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#171717] border border-white/[0.05] flex items-center justify-between min-w-0">
                <span className="text-[#8E929C] text-[11px] truncate">Deployment:</span>
                <span className="text-white text-[11px] font-medium shrink-0">Docker Compose</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#171717] border border-white/[0.05] flex items-center justify-between min-w-0">
                <span className="text-[#8E929C] text-[11px] truncate">API Reference:</span>
                <span className="text-white text-[11px] font-medium shrink-0">Fastify REST</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#171717] border border-white/[0.05] flex items-center justify-between min-w-0">
                <span className="text-[#8E929C] text-[11px] truncate">Audit Ledger:</span>
                <span className="text-white text-[11px] font-medium shrink-0">Tamper-Evident</span>
              </div>
            </div>
          </div>

          {/* Footer - Pinned to Bottom */}
          <div className="mt-auto pt-5 border-t border-white/[0.06] flex items-center justify-between gap-3">
            <div className="text-[11px] text-[#8E929C] flex items-center gap-1.5 min-w-0">
              <FileCode className="w-3.5 h-3.5 text-[#8C7CFF] shrink-0" />
              <span className="truncate">12 Technical Chapters</span>
            </div>
            <Link
              href="/docs"
              id="btn-goto-docs"
              className="px-4 py-2 rounded-full bg-[#171717] hover:bg-[#282828] border border-white/[0.08] hover:border-[#D7FF70]/40 text-xs font-semibold text-white hover:text-[#D7FF70] transition-all flex items-center gap-1.5 btn-press min-h-[36px] shrink-0"
            >
              <span>Explore Documentation</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
