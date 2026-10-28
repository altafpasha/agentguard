'use client';

import React, { useState } from 'react';
import { Activity, BarChart2 } from 'lucide-react';

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
  className?: string;
}

export function ActivityChart({ data = [], className = '' }: ActivityChartProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>(data[0]?.month || '');

  const hasData = data && data.length > 0;

  const maxVal = hasData
    ? Math.max(...data.map((d) => d.allowed + d.held + d.blocked), 1)
    : 1;

  return (
    <div className={`bg-[#222222] border border-white/[0.08] rounded-3xl p-5 sm:p-6 flex flex-col h-full relative shadow-xl min-h-[440px] sm:min-h-[460px] w-full ${className}`}>
      {/* Standardized Card Header */}
      <div className="flex items-center justify-between gap-3 mb-4 shrink-0 min-h-[36px]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-white/[0.06] flex items-center justify-center text-[#8E929C] shrink-0">
            <Activity className="w-4 h-4 text-[#D7FF70]" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white tracking-tight truncate">
              Evaluation Activity
            </h3>
            <span className="text-[11px] text-[#8E929C] block truncate">Real evaluation counts</span>
          </div>
        </div>

        {hasData ? (
          <div className="flex items-center gap-2.5 text-[11px] shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#D7FF70]" />
              <span className="text-white/80">Allowed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-white/80">Held</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              <span className="text-white/80">Blocked</span>
            </div>
          </div>
        ) : (
          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-[#8E929C] font-mono shrink-0">
            Real-time
          </span>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 flex flex-col justify-center">
        {!hasData ? (
          <div className="h-full min-h-[220px] flex flex-col items-center justify-center p-6 text-center space-y-3 rounded-2xl bg-[#171717] border border-white/[0.04]">
            <div className="w-10 h-10 rounded-2xl bg-white/[0.04] flex items-center justify-center text-[#8E929C]">
              <BarChart2 className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-white">No evaluation data yet</h4>
              <p className="text-[11px] text-[#8E929C] max-w-xs leading-relaxed">
                Real-time activity volume will populate here once transactions or agents connect to the gateway.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col justify-center h-full space-y-4 py-2">
            <div className="grid grid-flow-col auto-cols-fr gap-3 items-end h-44 px-2">
              {data.map((item) => {
                const total = item.allowed + item.held + item.blocked;
                const heightPercent = Math.max(Math.round((total / maxVal) * 100), 12);
                const isSelected = selectedMonth === item.month;

                return (
                  <div
                    key={item.month}
                    onClick={() => setSelectedMonth(item.month)}
                    className="flex flex-col items-center gap-2 cursor-pointer group"
                  >
                    <div className="w-full max-w-[48px] h-36 flex flex-col justify-end">
                      <div
                        style={{ height: `${heightPercent}%` }}
                        className={`w-full rounded-xl flex flex-col justify-end overflow-hidden transition-all duration-200 ${
                          isSelected
                            ? 'ring-2 ring-[#D7FF70] ring-offset-2 ring-offset-[#222222]'
                            : 'opacity-80 group-hover:opacity-100'
                        }`}
                      >
                        {item.blocked > 0 && (
                          <div
                            style={{ height: `${(item.blocked / total) * 100}%` }}
                            className="bg-rose-500 w-full"
                            title={`Blocked: ${item.blocked}`}
                          />
                        )}
                        {item.held > 0 && (
                          <div
                            style={{ height: `${(item.held / total) * 100}%` }}
                            className="bg-amber-400 w-full"
                            title={`Held: ${item.held}`}
                          />
                        )}
                        {item.allowed > 0 && (
                          <div
                            style={{ height: `${(item.allowed / total) * 100}%` }}
                            className="bg-[#D7FF70] w-full"
                            title={`Allowed: ${item.allowed}`}
                          />
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] font-mono font-medium text-[#8E929C] group-hover:text-white transition-colors">
                      {item.month}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Standardized Card Footer */}
      <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-[#8E929C] shrink-0 mt-4">
        {hasData ? (
          <>
            <span>Selected Period: <strong className="text-white">{selectedMonth || data[0]?.month}</strong></span>
            <div className="flex items-center gap-3">
              <span>Allowed: <strong className="text-[#D7FF70]">{data.find((d) => d.month === selectedMonth)?.allowed ?? data[0]?.allowed ?? 0}</strong></span>
              <span>Blocked: <strong className="text-rose-400">{data.find((d) => d.month === selectedMonth)?.blocked ?? data[0]?.blocked ?? 0}</strong></span>
            </div>
          </>
        ) : (
          <>
            <span>Evaluation Window</span>
            <span className="text-emerald-400 font-medium">Listening for traffic</span>
          </>
        )}
      </div>
    </div>
  );
}
