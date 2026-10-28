'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Terminal, ArrowRight } from 'lucide-react';
import { Navigation } from '../../components/Navigation';

export default function AttackLabRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/scenarios');
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0D0E11] text-[#F4F4F5]">
      <Navigation />
      <div className="max-w-[800px] mx-auto px-4 py-20 text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-[#D7FF70]/10 border border-[#D7FF70]/20 flex items-center justify-center mx-auto text-[#D7FF70]">
          <Terminal className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-white">Redirecting to Interactive Scenarios...</h1>
        <p className="text-sm text-[#9496A1]">
          Attack Lab and live security demonstrations have been moved to the dedicated public Scenarios workbench.
        </p>
        <div className="pt-2">
          <Link
            href="/scenarios"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#D7FF70] text-[#0D0E11] text-xs font-semibold hover:bg-[#cbf560] transition-colors"
          >
            <span>Go to /scenarios</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
