'use client';

import React, { useState } from 'react';
import { Clock, ChevronDown } from 'lucide-react';

export function ThreatHeatmap() {
  const [severityFilter, setSeverityFilter] = useState('All Severities');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ day: string; hour: string; count: number } | null>({
    day: 'Wed',
    hour: '11am',
    count: 3840,
  });

  const hours = ['2pm', '1pm', '12pm', '11am', '10am', '9am', '8am'];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Matrix values designed to recreate the exact visual pattern seen in the reference screenshot
  // 0: >500 (subtle hatch), 1: >1,000 (olive hatch), 2: >2,000 (lime tint), 3: >3,000 (solid bright lime)
  const heatmapGrid: number[][] = [
    // 2pm
    [0, 0, 0, 0, 1, 0, 0],
    // 1pm
    [0, 1, 1, 3, 2, 0, 0],
    // 12pm
    [0, 2, 3, 2, 3, 1, 0],
    // 11am
    [0, 3, 3, 1, 2, 3, 0],
    // 10am
    [0, 1, 2, 1, 2, 1, 0],
    // 9am
    [0, 0, 1, 1, 1, 0, 0],
    // 8am
    [0, 0, 0, 1, 0, 0, 0],
  ];

  const getCellClass = (level: number) => {
    switch (level) {
      case 3:
        // Peak intensity: Solid vibrant lime green
        return 'bg-[#D7FF70] text-[#0E1400] shadow-[0_0_12px_rgba(215,255,112,0.4)] ring-1 ring-[#D7FF70]';
      case 2:
        // High intensity: Medium lime tint
        return 'bg-[#B0DF45] text-[#0E1400]';
      case 1:
        // Moderate intensity: Olive diagonal hatching
        return 'bg-[#556920] hatch-lime';
      case 0:
      default:
        // Low/Baseline: Dark diagonal hatching
        return 'bg-[#22252C] hatch-subtle border border-white/[0.04]';
    }
  };

  const getCountForLevel = (level: number) => {
    switch (level) {
      case 3: return 3480;
      case 2: return 2420;
      case 1: return 1250;
      default: return 640;
    }
  };

  return (
    <div className="bg-[#1C1E24] border border-white/[0.08] rounded-[22px] p-5 sm:p-6 flex flex-col justify-between relative shadow-[0_4px_24px_rgba(0,0,0,0.35)] min-h-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-white/[0.06] flex items-center justify-center text-[#8E929C]">
            <Clock className="w-4 h-4 text-[#D7FF70]" />
          </div>
          <span className="text-sm font-semibold text-white tracking-tight">
            Threat Activity Matrix
          </span>
        </div>

        {/* Dropdown Filter (Matches reference screenshot: solid white pill) */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white text-[#121316] hover:bg-[#D7FF70] text-xs font-bold transition-all shadow-md btn-press"
          >
            <span>{severityFilter}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#121316]" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-2xl bg-[#1C1E24] border border-white/[0.1] shadow-2xl p-2 z-30 animate-in fade-in zoom-in-95 duration-100">
              <div className="text-[10px] font-bold text-[#8E929C] uppercase tracking-wider px-2 py-1">
                Filter Severity Matrix
              </div>
              {['All Severities', 'Critical (>3,000)', 'High (>2,000)', 'Medium (>1,000)', 'Baseline (>500)'].map((opt) => (
                <button
                  key={opt}
                  onClick={() => {
                    setSeverityFilter(opt);
                    setDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                    severityFilter === opt ? 'bg-[#D7FF70] text-[#0E1400] font-bold' : 'text-white/80 hover:bg-white/[0.08]'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Legend Row (Matches reference screenshot: >500, >1,000, >2,000, >3,000) */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-3.5 text-[10px] text-[#8E929C] font-medium">
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded bg-[#22252C] hatch-subtle border border-white/[0.06]" />
          <span>&gt;500</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded bg-[#556920] hatch-lime" />
          <span>&gt;1,000</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded bg-[#B0DF45]" />
          <span>&gt;2,000</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded bg-[#D7FF70]" />
          <span className="text-white font-bold">&gt;3,000</span>
        </div>
      </div>

      {/* Matrix Grid */}
      <div className="relative flex-1 flex flex-col justify-center">
        <div className="grid grid-cols-[38px_repeat(7,1fr)] gap-1.5 sm:gap-2">
          {hours.map((hour, rowIdx) => (
            <React.Fragment key={hour}>
              {/* Hour Label */}
              <div className="text-[10px] text-[#6E7380] font-medium flex items-center justify-end pr-1.5">
                {hour}
              </div>

              {/* 7 Days in row */}
              {days.map((day, colIdx) => {
                const level = heatmapGrid[rowIdx][colIdx];
                const cellClass = getCellClass(level);

                return (
                  <div
                    key={`${hour}-${day}`}
                    onMouseEnter={() =>
                      setHoveredCell({ day, hour, count: getCountForLevel(level) })
                    }
                    onMouseLeave={() => setHoveredCell(null)}
                    className={`h-6 sm:h-7 rounded-[7px] transition-all duration-150 cursor-pointer hover:scale-105 hover:ring-2 hover:ring-white/40 ${cellClass}`}
                  />
                );
              })}
            </React.Fragment>
          ))}

          {/* Bottom Day Labels */}
          <div className="col-start-2 col-span-7 grid grid-cols-7 gap-1.5 sm:gap-2 pt-2">
            {days.map((day) => (
              <div
                key={day}
                className="text-[10px] text-[#8E929C] font-medium text-center"
              >
                {day}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hover Info / Footer */}
      <div className="mt-3 pt-2.5 border-t border-white/[0.04] text-[11px] flex items-center justify-between text-[#8E929C]">
        <span>Hourly attack frequency</span>
        {hoveredCell ? (
          <span className="text-[#D7FF70] font-semibold">
            {hoveredCell.day} {hoveredCell.hour}: {hoveredCell.count.toLocaleString()} actions evaluated
          </span>
        ) : (
          <span className="text-white/50">Hover cell to inspect volume</span>
        )}
      </div>
    </div>
  );
}
