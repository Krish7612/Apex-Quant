import React, { useMemo, useState } from 'react';
import { Download, Play } from 'lucide-react';
import type { BacktestConfig, BacktestResult } from '../lib/types';

interface BacktestViewProps {
  ticker: string;
  draftConfig: BacktestConfig;
  onChangeDraft: (next: BacktestConfig) => void;
  onRunBacktest: () => void;
  backtestResult: BacktestResult;
}

export const BacktestView: React.FC<BacktestViewProps> = ({
  ticker,
  draftConfig,
  onChangeDraft,
  onRunBacktest,
  backtestResult,
}) => {
  const [tradeFilter, setTradeFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const curve = backtestResult.equityCurve;
  const filteredTrades = useMemo(() => {
    if (tradeFilter === 'ALL') return backtestResult.trades;
    return backtestResult.trades.filter((t) => t.action === tradeFilter);
  }, [backtestResult.trades, tradeFilter]);

  const svgW = 860;
  const svgH = 260;
  const pad = { top: 18, right: 68, bottom: 28, left: 16 };
  const plotW = svgW - pad.left - pad.right;
  const plotH = svgH - pad.top - pad.bottom;

  const { minEq, maxEq } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of curve) {
      lo = Math.min(lo, p.strategyEquity, p.benchmarkEquity);
      hi = Math.max(hi, p.strategyEquity, p.benchmarkEquity);
    }
    if (!Number.isFinite(lo) || hi <= lo) return { minEq: 90000, maxEq: 110000 };
    const m = (hi - lo) * 0.1;
    return { minEq: lo - m, maxEq: hi + m };
  }, [curve]);

  const xOf = (idx: number) =>
    pad.left + (curve.length > 1 ? (idx / (curve.length - 1)) * plotW : 0);
  const yOf = (val: number) =>
    pad.top + ((maxEq - val) / Math.max(1, maxEq - minEq)) * plotH;

  const strategyPath = curve
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p.strategyEquity).toFixed(1)}`)
    .join(' ');
  const benchmarkPath = curve
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p.benchmarkEquity).toFixed(1)}`)
    .join(' ');

  const activePoint = hoverIdx !== null ? curve[hoverIdx] : curve[curve.length - 1];

  const handleExportCsv = () => {
    const header = 'ID,Date,Action,Price,Shares,Value,Fee,PnL,PnL_Pct,Equity_After,Reason';
    const rows = backtestResult.trades.map((t) =>
      [
        t.id,
        t.date,
        t.action,
        t.price.toFixed(2),
        t.shares.toFixed(4),
        t.value.toFixed(2),
        t.fee.toFixed(2),
        t.pnl !== null ? t.pnl.toFixed(2) : '',
        t.pnlPct !== null ? t.pnlPct.toFixed(2) : '',
        t.equityAfter.toFixed(2),
        `"${t.reason}"`,
      ].join(','),
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ticker.toLowerCase()}_strategy_trades.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Performance Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Final Equity</p>
          <p className="text-lg font-semibold font-mono tabular-nums text-slate-900 mt-1">
            ${backtestResult.finalEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Strategy Return</p>
          <p
            className={`text-lg font-semibold font-mono tabular-nums mt-1 ${
              backtestResult.totalReturnPct >= 0 ? 'text-emerald-700' : 'text-red-700'
            }`}
          >
            {backtestResult.totalReturnPct >= 0 ? '+' : ''}
            {backtestResult.totalReturnPct.toFixed(2)}%
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Buy & Hold</p>
          <p className="text-lg font-semibold font-mono tabular-nums text-slate-900 mt-1">
            {backtestResult.benchmarkReturnPct >= 0 ? '+' : ''}
            {backtestResult.benchmarkReturnPct.toFixed(2)}%
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Excess Alpha</p>
          <p
            className={`text-lg font-semibold font-mono tabular-nums mt-1 ${
              backtestResult.excessAlphaPct >= 0 ? 'text-blue-700' : 'text-amber-700'
            }`}
          >
            {backtestResult.excessAlphaPct >= 0 ? '+' : ''}
            {backtestResult.excessAlphaPct.toFixed(2)}%
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Sharpe Ratio</p>
          <p className="text-lg font-semibold font-mono tabular-nums text-slate-900 mt-1">
            {backtestResult.sharpeRatio.toFixed(2)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Max Drawdown</p>
          <p className="text-lg font-semibold font-mono tabular-nums text-red-700 mt-1">
            {backtestResult.maxDrawdownPct.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Controls + Equity Curve */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section
          aria-label="Strategy backtest parameters"
          className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="pb-3 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">
                Trading Strategy Rules
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Walk-forward execution over holdout window
              </p>
            </div>

            <div>
              <label htmlFor="capital-input" className="block text-xs font-medium text-slate-700 mb-1">
                Initial Capital (USD)
              </label>
              <input
                id="capital-input"
                type="number"
                min={5000}
                max={10000000}
                step={5000}
                value={draftConfig.initialCapital}
                onChange={(e) =>
                  onChangeDraft({
                    ...draftConfig,
                    initialCapital: Math.max(5000, Number(e.target.value) || 100000),
                  })
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="buy-thresh-input" className="block text-xs font-medium text-slate-700 mb-1">
                  Buy Entry (%)
                </label>
                <input
                  id="buy-thresh-input"
                  type="number"
                  min={0.05}
                  max={5}
                  step={0.05}
                  value={draftConfig.buyThresholdPct}
                  onChange={(e) =>
                    onChangeDraft({
                      ...draftConfig,
                      buyThresholdPct: Math.max(0.05, Number(e.target.value) || 0.25),
                    })
                  }
                  className="w-full px-2.5 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label htmlFor="sell-thresh-input" className="block text-xs font-medium text-slate-700 mb-1">
                  Sell Exit (%)
                </label>
                <input
                  id="sell-thresh-input"
                  type="number"
                  min={0.05}
                  max={5}
                  step={0.05}
                  value={draftConfig.sellThresholdPct}
                  onChange={(e) =>
                    onChangeDraft({
                      ...draftConfig,
                      sellThresholdPct: Math.max(0.05, Number(e.target.value) || 0.25),
                    })
                  }
                  className="w-full px-2.5 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="stoploss-input" className="block text-xs font-medium text-slate-700 mb-1">
                  Stop-Loss (%)
                </label>
                <input
                  id="stoploss-input"
                  type="number"
                  min={1}
                  max={25}
                  step={0.5}
                  value={draftConfig.stopLossPct}
                  onChange={(e) =>
                    onChangeDraft({
                      ...draftConfig,
                      stopLossPct: Math.max(1, Number(e.target.value) || 5),
                    })
                  }
                  className="w-full px-2.5 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label htmlFor="fee-input" className="block text-xs font-medium text-slate-700 mb-1">
                  Slippage & Fee (bps)
                </label>
                <input
                  id="fee-input"
                  type="number"
                  min={0}
                  max={50}
                  step={1}
                  value={draftConfig.feeBps}
                  onChange={(e) =>
                    onChangeDraft({
                      ...draftConfig,
                      feeBps: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="w-full px-2.5 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md"
                />
              </div>
            </div>
          </div>

          <div className="pt-5 mt-5 border-t border-slate-100 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500 tabular-nums">
              Win rate: {backtestResult.winRatePct.toFixed(1)}% ({backtestResult.closedTrades} closed)
            </span>
            <button
              type="button"
              onClick={onRunBacktest}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              Run Backtest
            </button>
          </div>
        </section>

        <section
          aria-label="Strategy equity curve comparison"
          className="lg:col-span-8 bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between"
        >
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Portfolio Equity Curve vs. Buy & Hold
                </h2>
                {activePoint && (
                  <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                    {activePoint.date}
                    {' · '}AI Strategy <strong className="font-mono text-blue-700">${activePoint.strategyEquity.toLocaleString()}</strong>
                    {' · '}Benchmark <strong className="font-mono text-slate-700">${activePoint.benchmarkEquity.toLocaleString()}</strong>
                    {' · '}Position: {activePoint.position}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 h-0.5 bg-blue-700 inline-block" aria-hidden="true" />
                  AI Strategy
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 h-0 border-t-2 border-dashed border-slate-500 inline-block" aria-hidden="true" />
                  Buy & Hold
                </span>
              </div>
            </div>

            <div className="mt-4">
              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                className="w-full h-auto select-none cursor-crosshair"
                onMouseMove={(e) => {
                  if (curve.length < 2) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const relX = ((e.clientX - rect.left) / rect.width) * svgW;
                  const idx = Math.round(((relX - pad.left) / plotW) * (curve.length - 1));
                  setHoverIdx(Math.max(0, Math.min(curve.length - 1, idx)));
                }}
                onMouseLeave={() => setHoverIdx(null)}
                role="img"
                aria-label="Equity curve comparing AI strategy to buy and hold"
                data-testid="equity-curve-svg"
              >
                {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                  const val = minEq + (maxEq - minEq) * frac;
                  const y = yOf(val);
                  return (
                    <g key={frac}>
                      <line
                        x1={pad.left}
                        y1={y}
                        x2={pad.left + plotW}
                        y2={y}
                        stroke="#E2E8F0"
                        strokeWidth="1"
                      />
                      <text
                        x={pad.left + plotW + 8}
                        y={y + 4}
                        fontSize="10"
                        fill="#64748B"
                        fontFamily="IBM Plex Mono, monospace"
                      >
                        ${Math.round(val / 1000)}k
                      </text>
                    </g>
                  );
                })}

                <path d={benchmarkPath} fill="none" stroke="#64748B" strokeWidth="1.5" strokeDasharray="5 4" />
                <path d={strategyPath} fill="none" stroke="#1D4ED8" strokeWidth="2.25" />

                {hoverIdx !== null && curve[hoverIdx] && (
                  <g>
                    <line
                      x1={xOf(hoverIdx)}
                      y1={pad.top}
                      x2={xOf(hoverIdx)}
                      y2={pad.top + plotH}
                      stroke="#94A3B8"
                      strokeDasharray="2 2"
                    />
                    <circle
                      cx={xOf(hoverIdx)}
                      cy={yOf(curve[hoverIdx].strategyEquity)}
                      r="4"
                      fill="#1D4ED8"
                      stroke="#FFFFFF"
                      strokeWidth="2"
                    />
                  </g>
                )}

                {curve.length > 0 && (
                  <>
                    <text
                      x={pad.left}
                      y={svgH - 6}
                      fontSize="10"
                      fill="#64748B"
                      fontFamily="IBM Plex Mono, monospace"
                    >
                      {curve[0].date}
                    </text>
                    <text
                      x={pad.left + plotW}
                      y={svgH - 6}
                      textAnchor="end"
                      fontSize="10"
                      fill="#64748B"
                      fontFamily="IBM Plex Mono, monospace"
                    >
                      {curve[curve.length - 1].date}
                    </text>
                  </>
                )}
              </svg>
            </div>
          </div>
        </section>
      </div>

      {/* Executed Trade Ledger */}
      <section
        aria-label="Executed algorithmic trades ledger"
        className="bg-white border border-slate-200 rounded-lg overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Executed Trade Ledger ({filteredTrades.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Out-of-sample buy and sell orders triggered by model trend predictions
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md" role="group" aria-label="Filter trades by side">
              {(['ALL', 'BUY', 'SELL'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => setTradeFilter(side)}
                  className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap cursor-pointer transition-colors ${
                    tradeFilter === side
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {side === 'ALL' ? 'All Trades' : side}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={backtestResult.trades.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Export CSV
            </button>
          </div>
        </div>

        {filteredTrades.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No trades triggered under the current threshold settings. Lower the Buy Entry threshold and run the backtest again.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                  <th className="py-2.5 px-5">Date</th>
                  <th className="py-2.5 px-4">Side</th>
                  <th className="py-2.5 px-4 text-right">Fill Price</th>
                  <th className="py-2.5 px-4 text-right">Shares</th>
                  <th className="py-2.5 px-4 text-right">Realized P&L</th>
                  <th className="py-2.5 px-4 text-right">Equity After</th>
                  <th className="py-2.5 px-5">Trigger Rationale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredTrades.map((tr) => (
                  <tr key={tr.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-5 font-mono tabular-nums text-slate-700">{tr.date}</td>
                    <td className="py-2.5 px-4 font-semibold">
                      <span className={tr.action === 'BUY' ? 'text-emerald-700' : 'text-red-700'}>
                        {tr.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900">
                      ${tr.price.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {tr.shares.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      {tr.pnl !== null ? (
                        <span className={tr.pnl >= 0 ? 'text-emerald-700 font-medium' : 'text-red-700 font-medium'}>
                          {tr.pnl >= 0 ? '+' : ''}${tr.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({tr.pnlPct! >= 0 ? '+' : ''}{tr.pnlPct!.toFixed(2)}%)
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900">
                      ${tr.equityAfter.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-2.5 px-5 text-slate-600">{tr.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
