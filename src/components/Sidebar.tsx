import React from 'react';
import { LineChart, SlidersHorizontal, Briefcase, Code2, X } from 'lucide-react';
import type { StockAsset, WorkspaceTab } from '../lib/types';

interface WatchlistSummary {
  ticker: string;
  name: string;
  lastClose: number;
  dailyChangePct: number;
  signal: 'BUY' | 'HOLD' | 'SELL';
}

interface SidebarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  assets: StockAsset[];
  watchlist: WatchlistSummary[];
  activeTicker: string;
  onSelectTicker: (ticker: string) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: { id: WorkspaceTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'forecast', label: 'Forecast & Signals', icon: LineChart },
  { id: 'model', label: 'Model Lab', icon: SlidersHorizontal },
  { id: 'backtest', label: 'Strategy Backtester', icon: Briefcase },
  { id: 'pipeline', label: 'Data & Python Code', icon: Code2 },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  watchlist,
  activeTicker,
  onSelectTicker,
  mobileOpen,
  onCloseMobile,
}) => {
  const sidebarBody = (
    <div className="h-full flex flex-col bg-white border-r border-slate-200 w-64">
      <div className="h-14 px-5 flex items-center justify-between border-b border-slate-200 shrink-0">
        <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
          Apex Quant Solutions
        </span>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-md cursor-pointer"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <nav aria-label="Workspace sections" className="p-3 space-y-1 border-b border-slate-200">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                onSelectTab(id);
                onCloseMobile();
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-blue-50 text-blue-800'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="px-2 pb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-500">Tracked Equities</h2>
          <span className="text-xs font-mono text-slate-400 tabular-nums">{watchlist.length}</span>
        </div>

        <ul className="space-y-1" role="listbox" aria-label="Select equity ticker">
          {watchlist.map((item) => {
            const isSelected = item.ticker === activeTicker;
            const sigColor =
              item.signal === 'BUY'
                ? 'text-emerald-700'
                : item.signal === 'SELL'
                  ? 'text-red-700'
                  : 'text-amber-700';

            return (
              <li key={item.ticker}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onSelectTicker(item.ticker);
                    onCloseMobile();
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-md border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-900 border-transparent hover:bg-slate-50 hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold font-mono">{item.ticker}</span>
                    <span className="text-sm font-mono tabular-nums">
                      ${item.lastClose.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5 text-xs">
                    <span className={`truncate ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                      {item.name}
                    </span>
                    <span className="font-mono tabular-nums shrink-0 flex items-center gap-1.5">
                      <span
                        className={
                          isSelected
                            ? item.dailyChangePct >= 0
                              ? 'text-emerald-300'
                              : 'text-red-300'
                            : item.dailyChangePct >= 0
                              ? 'text-emerald-700'
                              : 'text-red-700'
                        }
                      >
                        {item.dailyChangePct >= 0 ? '+' : ''}
                        {item.dailyChangePct.toFixed(2)}%
                      </span>
                      <span className={isSelected ? 'text-slate-400' : 'text-slate-300'} aria-hidden="true">
                        ·
                      </span>
                      <span className={isSelected ? 'text-blue-200 font-semibold' : `${sigColor} font-semibold`}>
                        {item.signal}
                      </span>
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="px-4 py-3 border-t border-slate-200 text-xs text-slate-500">
        Educational quantitative research workbench. Not investment advice.
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0 sticky top-0 h-screen">{sidebarBody}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-50 h-full">{sidebarBody}</div>
        </div>
      )}
    </>
  );
};
