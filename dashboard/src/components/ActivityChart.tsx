'use client';

import React, { useState } from 'react';
import { Activity, MoreHorizontal, TrendingUp } from 'lucide-react';

interface ActivityChartProps {
  data?: Array<{
    month: string;
    allowed: number;
    held: number;
    blocked: number;
    active?: boolean;
    value?: string;
    change?: string;
  }>;
}

export function ActivityChart({ data }: ActivityChartProps) {
  const [timeframe, setTimeframe] = useState<'Monthly' | 'Annually'>('Annually');
  const [selectedMonth, setSelectedMonth] = useState<string>('Apr');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [showGrid, setShowGrid] = useState(true);

  const annualData = [
    { month: 'Jan', allowed: 15, held: 1, blocked: 2, height: 42, value: '142,390', change: '+5.4%' },
    { month: 'Feb', allowed: 22, held: 2, blocked: 3, height: 60, value: '210,800', change: '+8.1%' },
    { month: 'Mar', allowed: 28, held: 3, blocked: 4, height: 75, value: '284,120', change: '+10.2%' },
    { month: 'Apr', allowed: 48, held: 4, blocked: 8, height: 95, value: '379,502', change: '+12.8%', active: true },
    { month: 'Mei', allowed: 19, held: 2, blocked: 3, height: 52, value: '185,400', change: '-4.2%' },
    { month: 'Jun', allowed: 32, held: 3, blocked: 5, height: 82, value: '312,950', change: '+9.6%' },
  ];

  const monthlyData = [
    { month: 'W1', allowed: 8, held: 1, blocked: 1, height: 35, value: '45,210', change: '+3.1%' },
    { month: 'W2', allowed: 14, held: 2, blocked: 2, height: 58, value: '88,400', change: '+7.4%' },
    { month: 'W3', allowed: 18, held: 1, blocked: 3, height: 70, value: '112,850', change: '+11.2%' },
    { month: 'W4', allowed: 24, held: 2, blocked: 4, height: 92, value: '154,600', change: '+14.6%', active: true },
    { month: 'W5', allowed: 10, held: 1, blocked: 1, height: 44, value: '62,100', change: '+2.8%' },
    { month: 'W6', allowed: 16, held: 1, blocked: 2, height: 64, value: '98,340', change: '+8.9%' },
  ];

  const rawData = timeframe === 'Monthly' ? monthlyData : annualData;

  const chartData = data && data.length > 0 ? data.map((d, idx) => ({
    month: d.month,
    allowed: d.allowed,
    held: d.held,
    blocked: d.blocked,
    height: [42, 60, 75, 95, 52, 82][idx % 6],
    value: d.value || `${(d.allowed * 8200).toLocaleString()}`,
    change: d.change || '+12.8%',
    active: d.month === selectedMonth,
  })) : rawData;

  const currentSelection = chartData.find((d) => d.month === selectedMonth) || chartData[3];

  return (
    <div className="bg-[#1C1E24] border border-white/[0.08] rounded-[22px] p-5 sm:p-6 flex flex-col justify-between relative shadow-[0_4px_24px_rgba(0,0,0,0.35)] min-h-[400px]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-white/[0.06] flex items-center justify-center text-[#8E929C]">
            <Activity className="w-4 h-4 text-[#D7FF70]" />
          </div>
          <span className="text-sm font-semibold text-white tracking-tight">
            Transaction Activity
          </span>
        </div>

        {/* Toggle Pills & Options */}
        <div className="flex items-center gap-2 relative">
          <div className="flex items-center p-1 rounded-full bg-[#121316] border border-white/[0.06]">
            <button
              onClick={() => {
                setTimeframe('Monthly');
                setSelectedMonth('W4');
              }}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all btn-press ${
                timeframe === 'Monthly'
                  ? 'bg-[#D7FF70] text-[#0E1400] shadow-sm'
                  : 'text-[#8E929C] hover:text-white'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => {
                setTimeframe('Annually');
                setSelectedMonth('Apr');
              }}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all btn-press ${
                timeframe === 'Annually'
                  ? 'bg-[#D7FF70] text-[#0E1400] shadow-sm'
                  : 'text-[#8E929C] hover:text-white'
              }`}
            >
              Annually
            </button>
          </div>

          <div className="relative">
            <button
              onClick={() => setOptionsOpen(!optionsOpen)}
              aria-label="Chart Options"
              className="w-8 h-8 rounded-full bg-white text-[#121316] hover:bg-[#D7FF70] hover:text-[#0E1400] transition-colors flex items-center justify-center shadow-md font-bold btn-press"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {optionsOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-xl bg-[#181A1F] border border-white/[0.1] shadow-xl p-2 z-30 animate-in fade-in zoom-in-95 duration-100">
                <button
                  onClick={() => {
                    setShowGrid(!showGrid);
                    setOptionsOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-white/90 hover:bg-white/[0.08] transition-colors"
                >
                  {showGrid ? 'Hide Grid Lines' : 'Show Grid Lines'}
                </button>
                <button
                  onClick={() => {
                    setSelectedMonth(timeframe === 'Monthly' ? 'W4' : 'Apr');
                    setOptionsOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-white/90 hover:bg-white/[0.08] transition-colors"
                >
                  Reset Peak Month
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Chart Area */}
      <div className="relative h-[250px] w-full flex items-end justify-between pt-16 pb-2">
        {/* Y-Axis Horizontal Grid Lines */}
        {showGrid && (
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-7 text-[10px] text-[#6E7380] font-medium">
            <div className="flex items-center justify-between w-full border-b border-white/[0.04] pb-1">
              <span>12.5%</span>
            </div>
            <div className="flex items-center justify-between w-full border-b border-white/[0.04] pb-1">
              <span>10%</span>
            </div>
            <div className="flex items-center justify-between w-full border-b border-white/[0.04] pb-1">
              <span>7.5%</span>
            </div>
            <div className="flex items-center justify-between w-full border-b border-white/[0.04] pb-1">
              <span>5%</span>
            </div>
            <div className="flex items-center justify-between w-full border-b border-white/[0.04] pb-1">
              <span>2.5%</span>
            </div>
            <div className="flex items-center justify-between w-full border-b border-white/[0.04] pb-1">
              <span>0%</span>
            </div>
          </div>
        )}

        {/* Vertical Pill Bars (Explicit height track ensures percentage heights render properly) */}
        <div className="relative z-10 w-full flex items-end justify-between px-1.5 sm:px-4 md:px-6 h-[175px] pb-6">
          {chartData.map((item) => {
            const isSelected = item.month === selectedMonth;

            return (
              <div
                key={item.month}
                onClick={() => setSelectedMonth(item.month)}
                className="flex flex-col items-center justify-end h-full gap-2 group cursor-pointer relative flex-1 max-w-[48px]"
              >
                {/* Floating Tooltip Popover for Selected Month */}
                {isSelected && (
                  <div className="absolute -top-14 z-20 flex flex-col items-center animate-in fade-in zoom-in-95 duration-150 pointer-events-none">
                    {/* Badge */}
                    <div className="px-2 py-0.5 mb-1 rounded-full bg-[#D7FF70] text-[#0E1400] text-[10px] font-bold shadow-sm flex items-center gap-1">
                      <TrendingUp className="w-2.5 h-2.5" />
                      <span>{item.change}</span>
                    </div>

                    {/* Value Popover Pill */}
                    <div className="px-3 py-1.5 rounded-2xl bg-[#121316]/95 border border-white/10 backdrop-blur-md shadow-xl text-center min-w-[85px]">
                      <span className="text-[9px] text-[#8E929C] uppercase tracking-wider block">
                        {item.month}, 2026
                      </span>
                      <span className="text-xs font-bold text-white block">
                        {item.value}
                      </span>
                    </div>

                    {/* Popover Pointer Dot */}
                    <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_white] mt-1" />
                  </div>
                )}

                {/* Pill Column Bar */}
                <div
                  className={`w-6 sm:w-8 md:w-9 lg:w-7 xl:w-9 rounded-full transition-all duration-300 relative overflow-hidden flex flex-col justify-end ${
                    isSelected
                      ? 'bg-gradient-to-t from-[#6E56CF] to-[#9E86FF] shadow-[0_0_20px_rgba(140,124,255,0.4)] ring-2 ring-[#D7FF70]/50'
                      : 'bg-[#22252C] hover:bg-[#2C303A]'
                  }`}
                  style={{ height: `${Math.max(item.height, 22)}%` }}
                >
                  {/* Diagonal Hatching Pattern for Inactive Bars (Matches Screenshot) */}
                  {!isSelected && (
                    <div className="absolute inset-0 hatch-subtle opacity-90 rounded-full" />
                  )}

                  {/* Top indicator dot on inactive bar (Matches reference screenshot) */}
                  {!isSelected && (
                    <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#8C7CFF]/70" />
                  )}

                  {/* Top indicator dot on selected bar */}
                  {isSelected && (
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white/95 shadow-[0_0_6px_white]" />
                  )}
                </div>

                {/* Month Label */}
                <span
                  className={`text-[11px] font-medium transition-colors ${
                    isSelected ? 'text-[#D7FF70] font-bold' : 'text-[#8E929C] group-hover:text-white'
                  }`}
                >
                  {item.month}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-white/[0.04] text-[11px] text-[#8E929C]">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#D7FF70]" />
            <span>Allowed ({currentSelection.allowed})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#8C7CFF]" />
            <span>Held ({currentSelection.held})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF6B6B]" />
            <span>Blocked ({currentSelection.blocked})</span>
          </div>
        </div>
        <span className="text-white/60 font-medium">Selected: {selectedMonth} 2026</span>
      </div>
    </div>
  );
}
