'use client';

import React from 'react';
import Link from 'next/link';
import { LucideIcon, ArrowUpRight } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: LucideIcon;
  href?: string;
  isLimeHighlight?: boolean;
}

export function MetricCard({
  title,
  value,
  change,
  changeType = 'positive',
  icon: Icon,
  href,
  isLimeHighlight = false,
}: MetricCardProps) {
  const CardContent = (
    <div
      className={`relative w-full h-full p-5 lg:p-6 rounded-3xl transition-all duration-200 group flex flex-col justify-between min-h-[145px] sm:min-h-[155px] ${
        isLimeHighlight
          ? 'bg-[#D7FF70] text-[#0E1400] shadow-[0_10px_30px_rgba(215,255,112,0.22)] border border-[#E3FFA8] hover:-translate-y-1'
          : 'bg-[#222222] text-white border border-white/[0.08] hover:border-white/[0.18] hover:bg-[#282828] hover:-translate-y-1 shadow-lg'
      }`}
    >
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div
            className={`w-7 h-7 rounded-xl flex-shrink-0 flex items-center justify-center ${
              isLimeHighlight
                ? 'bg-black/10 text-[#0E1400]'
                : 'bg-white/[0.08] text-[#8E929C] group-hover:text-white transition-colors'
            }`}
          >
            <Icon className="w-4 h-4" />
          </div>
          <span
            title={title}
            className={`text-xs font-semibold tracking-tight truncate ${
              isLimeHighlight ? 'text-[#0E1400]/85 font-bold' : 'text-[#8E929C] group-hover:text-white transition-colors'
            }`}
          >
            {title}
          </span>
        </div>

        {/* Circular Arrow Button (Matches reference screenshot: crisp solid circle) */}
        <div
          className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-200 group-hover:scale-105 shadow-md ${
            isLimeHighlight
              ? 'bg-[#0E1400] text-[#D7FF70] group-hover:bg-black group-hover:text-[#E3FFA8]'
              : 'bg-white text-[#121316] group-hover:bg-[#D7FF70] group-hover:text-[#0E1400]'
          }`}
        >
          <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </div>
      </div>

      {/* Metric Value & Subtitle Row */}
      <div className="mt-4">
        <div
          className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
            isLimeHighlight ? 'text-[#0E1400]' : 'text-white'
          }`}
        >
          {value}
        </div>

        {change && (
          <div
            className={`text-[11px] font-semibold mt-1.5 flex items-center gap-1.5 ${
              isLimeHighlight
                ? 'text-[#0E1400]/80'
                : changeType === 'positive'
                ? 'text-[#D7FF70]'
                : changeType === 'negative'
                ? 'text-[#FF7070]'
                : 'text-[#8E929C]'
            }`}
          >
            <span>{change}</span>
          </div>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full focus:outline-none focus:ring-2 focus:ring-[#D7FF70] rounded-[22px]">
        {CardContent}
      </Link>
    );
  }

  return CardContent;
}
