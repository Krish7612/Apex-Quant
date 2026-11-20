import React, { useMemo, useState } from 'react';
import type { ModelResult, StockBar, TechnicalSeries } from '../lib/types';

interface ForecastChartProps {
  ticker: string;
  bars: StockBar[];
  indicators: TechnicalSeries;
  modelResult: ModelResult;
}

type RangeKey = '3M' | '6M' | '1Y';

interface CombinedPoint {
  date: string;
  isForecast: boolean;
  actual: number | null;
  validationPred: number | null;
  forecastPred: number | null;
  lower95: number | null;
  upper95: number | null;
  sma20: number | null;
  ema50: number | null;
  bbUpper: number | null;
  bbLower: number | null;
  signal: 'BUY' | 'HOLD' | 'SELL' | null;
}

export const ForecastChart: React.FC<ForecastChartProps> = ({
  ticker,
  bars,
  indicators,
  modelResult,
}) => {
  const [range, setRange] = useState<RangeKey>('6M');
  const [showSma, setShowSma] = useState(true);
  const [showEma, setShowEma] = useState(true);
  const [showBands, setShowBands] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const points = useMemo<CombinedPoint[]>(() => {
    const windowDays = range === '3M' ? 65 : range === '6M' ? 130 : bars.length;
    const startIdx = Math.max(0, bars.length - windowDays);
    const valMap = new Map(modelResult.validationPoints.map((v) => [v.index, v]));

    const combined: CombinedPoint[] = [];
    for (let i = startIdx; i < bars.length; i++) {
      const valPt = valMap.get(i);
      combined.push({
        date: bars[i].date,
        isForecast: false,
        actual: bars[i].close,
        validationPred: valPt ? valPt.predicted : null,
        forecastPred: i === bars.length - 1 ? bars[i].close : null,
        lower95: i === bars.length - 1 ? bars[i].close : null,
        upper95: i === bars.length - 1 ? bars[i].close : null,
        sma20: indicators.sma20[i],
        ema50: indicators.ema50[i],
        bbUpper: indicators.bollingerUpper[i],
        bbLower: indicators.bollingerLower[i],
        signal: valPt && valPt.signal !== 'HOLD' ? valPt.signal : null,
      });
    }

    for (const fp of modelResult.forecastPoints) {
      combined.push({
        date: fp.date,
        isForecast: true,
        actual: null,
        validationPred: null,
        forecastPred: fp.predicted,
        lower95: fp.lower95,
        upper95: fp.upper95,
        sma20: null,
        ema50: null,
        bbUpper: null,
        bbLower: null,
        signal: null,
      });
    }
    return combined;
  }, [bars, indicators, modelResult, range]);

  const width = 920;
  const height = 370;
  const pad = { top: 20, right: 64, bottom: 34, left: 16 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const { minY, maxY, yTicks } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of points) {
      const vals = [
        p.actual,
        p.validationPred,
        p.forecastPred,
        p.lower95,
        p.upper95,
        showSma ? p.sma20 : null,
        showEma ? p.ema50 : null,
        showBands ? p.bbUpper : null,
        showBands ? p.bbLower : null,
      ];
      for (const v of vals) {
        if (v !== null && Number.isFinite(v)) {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) {
      lo = 0;
      hi = 100;
    }
    const margin = (hi - lo) * 0.08;
    const minVal = Math.max(0, lo - margin);
    const maxVal = hi + margin;
    const ticks = Array.from({ length: 5 }, (_, idx) => minVal + ((maxVal - minVal) * idx) / 4);
    return { minY: minVal, maxY: maxVal, yTicks: ticks };
  }, [points, showSma, showEma, showBands]);

  const xOf = (idx: number) =>
    pad.left + (points.length > 1 ? (idx / (points.length - 1)) * plotW : 0);
  const yOf = (val: number) => pad.top + ((maxY - val) / Math.max(1e-6, maxY - minY)) * plotH;

  const buildPath = (getter: (p: CombinedPoint) => number | null) => {
    let d = '';
    let open = false;
    points.forEach((p, idx) => {
      const v = getter(p);
      if (v === null) {
        open = false;
        return;
      }
      const cmd = open ? 'L' : 'M';
      d += `${cmd}${xOf(idx).toFixed(1)},${yOf(v).toFixed(1)} `;
      open = true;
    });
    return d.trim();
  };

  const buildAreaPath = (
    upperGetter: (p: CombinedPoint) => number | null,
    lowerGetter: (p: CombinedPoint) => number | null,
  ) => {
    const topPts: string[] = [];
    const botPts: string[] = [];
    points.forEach((p, idx) => {
      const u = upperGetter(p);
      const l = lowerGetter(p);
      if (u !== null && l !== null) {
        topPts.push(`${xOf(idx).toFixed(1)},${yOf(u).toFixed(1)}`);
        botPts.unshift(`${xOf(idx).toFixed(1)},${yOf(l).toFixed(1)}`);
      }
    });
    if (topPts.length < 2) return '';
    return `M${topPts.join(' L')} L${botPts.join(' L')} Z`;
  };

  const splitForecastIdx = points.findIndex((p) => p.isForecast);
  const lastHistoricalIdx = splitForecastIdx > 0 ? splitForecastIdx - 1 : points.length - 1;

  const xTickIndices = useMemo(() => {
    const count = 6;
    const step = Math.max(1, Math.floor((points.length - 1) / (count - 1)));
    const arr: number[] = [];
    for (let i = 0; i < points.length; i += step) arr.push(i);
    const lastIdx = points.length - 1;
    if (arr.length > 0 && arr[arr.length - 1] !== lastIdx) {
      if (lastIdx - arr[arr.length - 1] < step * 0.65) {
        arr[arr.length - 1] = lastIdx;
      } else {
        arr.push(lastIdx);
      }
    }
    return arr;
  }, [points.length]);

  const activePoint = hoverIdx !== null ? points[hoverIdx] : points[points.length - 1];

  const handlePointerMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    const clamped = Math.max(pad.left, Math.min(pad.left + plotW, relX));
    const idx = Math.round(((clamped - pad.left) / plotW) * (points.length - 1));
    setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)));
  };

  return (
    <section
      aria-label={`${ticker} historical price and neural forecast chart`}
      className="bg-white border border-slate-200 rounded-lg p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Historical Close & {modelResult.config.forecastHorizon}-Day {modelResult.config.architecture} Trend Forecast
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            {activePoint.date}
            {' · '}
            {activePoint.isForecast ? (
              <span>
                Forecast <strong className="font-mono text-blue-700">${activePoint.forecastPred?.toFixed(2)}</strong>
                {' '}
                (95% band ${activePoint.lower95?.toFixed(2)} – ${activePoint.upper95?.toFixed(2)})
              </span>
            ) : (
              <span>
                Close <strong className="font-mono text-slate-900">${activePoint.actual?.toFixed(2)}</strong>
                {activePoint.validationPred !== null && (
                  <>
                    {' · '}Model Fit <strong className="font-mono text-blue-700">${activePoint.validationPred.toFixed(2)}</strong>
                  </>
                )}
                {showSma && activePoint.sma20 !== null && (
                  <>
                    {' · '}SMA20 <span className="font-mono text-amber-700">${activePoint.sma20.toFixed(2)}</span>
                  </>
                )}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setShowSma((s) => !s)}
              aria-pressed={showSma}
              className={`px-2.5 py-1.5 rounded-md border text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                showSma
                  ? 'border-amber-300 bg-amber-50 text-amber-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              SMA 20
            </button>
            <button
              type="button"
              onClick={() => setShowEma((s) => !s)}
              aria-pressed={showEma}
              className={`px-2.5 py-1.5 rounded-md border text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                showEma
                  ? 'border-slate-300 bg-slate-100 text-slate-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              EMA 50
            </button>
            <button
              type="button"
              onClick={() => setShowBands((s) => !s)}
              aria-pressed={showBands}
              className={`px-2.5 py-1.5 rounded-md border text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                showBands
                  ? 'border-slate-300 bg-slate-100 text-slate-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Bollinger
            </button>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md" role="group" aria-label="Chart date range">
            {(['3M', '6M', '1Y'] as RangeKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setRange(key)}
                className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  range === key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none cursor-crosshair"
          onMouseMove={handlePointerMove}
          onMouseLeave={() => setHoverIdx(null)}
          role="img"
          aria-label={`Price and ${modelResult.config.forecastHorizon}-day forecast chart for ${ticker}`}
          data-testid="forecast-svg-chart"
        >
          {/* Forecast Region Shading */}
          {splitForecastIdx > 0 && (
            <rect
              x={xOf(lastHistoricalIdx)}
              y={pad.top}
              width={Math.max(0, pad.left + plotW - xOf(lastHistoricalIdx))}
              height={plotH}
              fill="#F8FAFC"
            />
          )}

          {/* Horizontal Grid Lines & Y-Axis Labels */}
          {yTicks.map((tick, idx) => {
            const y = yOf(tick);
            return (
              <g key={idx}>
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
                  fontSize="11"
                  fill="#64748B"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  ${tick.toFixed(0)}
                </text>
              </g>
            );
          })}

          {/* Vertical Divider at Forecast Start */}
          {splitForecastIdx > 0 && (
            <g>
              <line
                x1={xOf(lastHistoricalIdx)}
                y1={pad.top}
                x2={xOf(lastHistoricalIdx)}
                y2={pad.top + plotH}
                stroke="#94A3B8"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text
                x={pad.left + plotW - 6}
                y={pad.top + 13}
                textAnchor="end"
                fontSize="10"
                fill="#475569"
                fontFamily="IBM Plex Mono, monospace"
              >
                Forecast
              </text>
            </g>
          )}

          {/* Bollinger Band Envelope */}
          {showBands && (
            <path
              d={buildAreaPath(
                (p) => p.bbUpper,
                (p) => p.bbLower,
              )}
              fill="#94A3B8"
              fillOpacity="0.12"
            />
          )}

          {/* 95% Forecast Confidence Cone */}
          <path
            d={buildAreaPath(
              (p) => p.upper95,
              (p) => p.lower95,
            )}
            fill="#1D4ED8"
            fillOpacity="0.12"
          />

          {/* EMA 50 */}
          {showEma && (
            <path
              d={buildPath((p) => p.ema50)}
              fill="none"
              stroke="#64748B"
              strokeWidth="1.25"
              strokeDasharray="3 3"
            />
          )}

          {/* SMA 20 */}
          {showSma && (
            <path
              d={buildPath((p) => p.sma20)}
              fill="none"
              stroke="#D97706"
              strokeWidth="1.35"
            />
          )}

          {/* Historical Actual Close */}
          <path
            d={buildPath((p) => p.actual)}
            fill="none"
            stroke="#0F172A"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {/* Out-of-Sample Validation Fit */}
          <path
            d={buildPath((p) => p.validationPred)}
            fill="none"
            stroke="#1D4ED8"
            strokeWidth="1.5"
            strokeDasharray="5 3"
          />

          {/* Multi-Day Future Forecast Line */}
          <path
            d={buildPath((p) => p.forecastPred)}
            fill="none"
            stroke="#1D4ED8"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />

          {/* Validation Signal Markers (sampled cleanly so chart never crowds) */}
          {points.map((p, idx) => {
            if (!p.signal || p.actual === null || idx % 4 !== 0) return null;
            const cx = xOf(idx);
            const cy = yOf(p.actual);
            if (p.signal === 'BUY') {
              return (
                <polygon
                  key={`sig-${idx}`}
                  points={`${cx},${cy - 8} ${cx - 4.5},${cy - 1} ${cx + 4.5},${cy - 1}`}
                  fill="#15803D"
                />
              );
            }
            return (
              <polygon
                key={`sig-${idx}`}
                points={`${cx},${cy + 8} ${cx - 4.5},${cy + 1} ${cx + 4.5},${cy + 1}`}
                fill="#B91C1C"
              />
            );
          })}

          {/* Hover Crosshair */}
          {hoverIdx !== null && (
            <g>
              <line
                x1={xOf(hoverIdx)}
                y1={pad.top}
                x2={xOf(hoverIdx)}
                y2={pad.top + plotH}
                stroke="#475569"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              {(() => {
                const pt = points[hoverIdx];
                const yVal = pt.isForecast ? pt.forecastPred : pt.actual;
                if (yVal === null) return null;
                return (
                  <circle
                    cx={xOf(hoverIdx)}
                    cy={yOf(yVal)}
                    r="4"
                    fill={pt.isForecast ? '#1D4ED8' : '#0F172A'}
                    stroke="#FFFFFF"
                    strokeWidth="2"
                  />
                );
              })()}
            </g>
          )}

          {/* X-Axis Labels */}
          {xTickIndices.map((idx) => (
            <text
              key={`x-${idx}`}
              x={xOf(idx)}
              y={height - 10}
              textAnchor={idx === 0 ? 'start' : idx === points.length - 1 ? 'end' : 'middle'}
              fontSize="11"
              fill="#64748B"
              fontFamily="IBM Plex Mono, monospace"
            >
              {points[idx].date.slice(5)}
            </text>
          ))}
        </svg>
      </div>

      {/* Legend Bar (clean typography, zero pill badges) */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-slate-900 inline-block" aria-hidden="true" />
          Actual Close
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-blue-700 inline-block" aria-hidden="true" />
          Forecast Trajectory & 95% Band
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 h-0 border-t-2 border-dashed border-blue-700 inline-block" aria-hidden="true" />
          Out-of-Sample Validation
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="text-emerald-700 font-semibold" aria-hidden="true">▲</span>
          Buy Signal
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="text-red-700 font-semibold" aria-hidden="true">▼</span>
          Sell Signal
        </span>
      </div>
    </section>
  );
};
