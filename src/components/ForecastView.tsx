import React from 'react';
import { ForecastChart } from './ForecastChart';
import { AiBriefingPanel } from './AiBriefingPanel';
import { classifyTrendRegime } from '../lib/quantEngine';
import type { ModelResult, QuantBriefing, StockAsset, TechnicalSeries } from '../lib/types';

interface ForecastViewProps {
  asset: StockAsset;
  indicators: TechnicalSeries;
  modelResult: ModelResult;
  briefing: QuantBriefing | null;
  briefingLoading: boolean;
  briefingError: string | null;
  onGenerateBriefing: () => void;
}

export const ForecastView: React.FC<ForecastViewProps> = ({
  asset,
  indicators,
  modelResult,
  briefing,
  briefingLoading,
  briefingError,
  onGenerateBriefing,
}) => {
  const n = asset.bars.length;
  const lastBar = asset.bars[n - 1];
  const prevBar = asset.bars[Math.max(0, n - 2)];
  const dailyChangePct = ((lastBar.close - prevBar.close) / prevBar.close) * 100;

  const rsi14 = indicators.rsi14[n - 1] ?? 50;
  const sma20 = indicators.sma20[n - 1] ?? lastBar.close;
  const ema50 = indicators.ema50[n - 1] ?? lastBar.close;
  const macdHist = indicators.macdHistogram[n - 1] ?? 0;
  const vol20d = indicators.volatility20d[n - 1] ?? 0;
  const momZ = indicators.momentumZ[n - 1] ?? 0;
  const regime = classifyTrendRegime(asset.bars, indicators);

  const signalColor =
    modelResult.currentSignal === 'BUY'
      ? 'text-emerald-700'
      : modelResult.currentSignal === 'SELL'
        ? 'text-red-700'
        : 'text-amber-700';

  const signalNote =
    modelResult.currentSignal === 'BUY'
      ? 'Exceeds +1.75% buy threshold'
      : modelResult.currentSignal === 'SELL'
        ? 'Below -1.75% sell threshold'
        : 'Within ±1.75% neutral band';

  return (
    <div className="space-y-6">
      {/* Asset Heading & Unboxed Metadata */}
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {asset.ticker} — {asset.name}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {asset.exchange}
            <span aria-hidden="true"> · </span>
            {asset.sector}
            <span aria-hidden="true"> · </span>
            <span className="tabular-nums">{asset.bars.length} daily bars</span>
            <span aria-hidden="true"> · </span>
            Regime: <span className="text-slate-700 font-medium">{regime}</span>
          </p>
        </div>
        <p className="text-xs text-slate-500 tabular-nums">
          Active Model: <strong className="text-slate-800">{modelResult.config.architecture}</strong> ({modelResult.config.lookbackWindow}d lookback · {modelResult.config.epochs} epochs)
        </p>
      </div>

      {/* 4-Column Flat KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Last Close ({lastBar.date})</p>
          <div className="flex items-baseline justify-between gap-2 mt-1">
            <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900" data-testid="kpi-last-close">
              ${lastBar.close.toFixed(2)}
            </p>
            <span
              className={`text-xs font-mono font-medium tabular-nums ${
                dailyChangePct >= 0 ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {dailyChangePct >= 0 ? '+' : ''}
              {dailyChangePct.toFixed(2)}% 1D
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1.5 font-mono tabular-nums">
            Vol {(lastBar.volume / 1_000_000).toFixed(1)}M · Range ${lastBar.low.toFixed(2)}–${lastBar.high.toFixed(2)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">
            {modelResult.config.forecastHorizon}D Forecast Target
          </p>
          <div className="flex items-baseline justify-between gap-2 mt-1">
            <p className="text-2xl font-semibold font-mono tabular-nums text-blue-700" data-testid="kpi-forecast-target">
              ${modelResult.projectedClose.toFixed(2)}
            </p>
            <span
              className={`text-xs font-mono font-medium tabular-nums ${
                modelResult.projectedReturnPct >= 0 ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {modelResult.projectedReturnPct >= 0 ? '+' : ''}
              {modelResult.projectedReturnPct.toFixed(2)}%
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1.5 font-mono tabular-nums">
            95% Band ${modelResult.forecastPoints[modelResult.forecastPoints.length - 1]?.lower95.toFixed(2)}–${modelResult.forecastPoints[modelResult.forecastPoints.length - 1]?.upper95.toFixed(2)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Algorithmic Signal</p>
          <div className="flex items-baseline justify-between gap-2 mt-1">
            <p className={`text-2xl font-bold tracking-tight ${signalColor}`} data-testid="kpi-signal">
              {modelResult.currentSignal}
            </p>
            <span className="text-xs font-mono tabular-nums text-slate-600">
              {modelResult.signalConfidencePct.toFixed(1)}% score
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1.5 truncate" title={signalNote}>
            {signalNote}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Holdout Validation Error</p>
          <div className="flex items-baseline justify-between gap-2 mt-1">
            <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900">
              ${modelResult.metrics.rmse.toFixed(2)}
            </p>
            <span className="text-xs font-mono tabular-nums text-slate-600">
              RMSE · {modelResult.metrics.mape.toFixed(2)}% MAPE
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1.5 tabular-nums">
            Directional accuracy <strong className="font-mono text-slate-800">{modelResult.metrics.directionalAccuracy.toFixed(1)}%</strong> ({modelResult.metrics.valSamples}d test)
          </p>
        </div>
      </div>

      {/* Focal Anchor: Interactive Price & Forecast Chart */}
      <ForecastChart
        ticker={asset.ticker}
        bars={asset.bars}
        indicators={indicators}
        modelResult={modelResult}
      />

      {/* Secondary Row: Technical Indicators Table + AI Quantitative Research Note */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section
          aria-label="Technical indicator diagnostics"
          className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5"
        >
          <div className="pb-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">
              Technical Indicator Snapshot
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Input feature signals computed on closing price history
            </p>
          </div>

          <dl className="divide-y divide-slate-100 mt-1 text-xs">
            <div className="py-2.5 flex items-center justify-between gap-4">
              <dt className="text-slate-600">RSI (14-Day)</dt>
              <dd className="font-mono tabular-nums text-right">
                <span className="font-semibold text-slate-900">{rsi14.toFixed(1)}</span>
                <span className="text-slate-500 ml-2">
                  {rsi14 > 70 ? 'Overbought' : rsi14 < 30 ? 'Oversold' : 'Neutral'}
                </span>
              </dd>
            </div>
            <div className="py-2.5 flex items-center justify-between gap-4">
              <dt className="text-slate-600">SMA 20 vs. EMA 50</dt>
              <dd className="font-mono tabular-nums text-right">
                <span className="font-semibold text-slate-900">
                  ${sma20.toFixed(2)} / ${ema50.toFixed(2)}
                </span>
                <span className={`ml-2 ${sma20 >= ema50 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {sma20 >= ema50 ? 'Bullish Cross' : 'Bearish Cross'}
                </span>
              </dd>
            </div>
            <div className="py-2.5 flex items-center justify-between gap-4">
              <dt className="text-slate-600">MACD Histogram (12, 26, 9)</dt>
              <dd className="font-mono tabular-nums text-right">
                <span className={`font-semibold ${macdHist >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {macdHist >= 0 ? '+' : ''}
                  {macdHist.toFixed(3)}
                </span>
              </dd>
            </div>
            <div className="py-2.5 flex items-center justify-between gap-4">
              <dt className="text-slate-600">20D Annualized Volatility</dt>
              <dd className="font-mono tabular-nums text-right font-semibold text-slate-900">
                {vol20d.toFixed(1)}%
              </dd>
            </div>
            <div className="py-2.5 flex items-center justify-between gap-4">
              <dt className="text-slate-600">Price Z-Score (vs. SMA 20)</dt>
              <dd className="font-mono tabular-nums text-right font-semibold text-slate-900">
                {momZ >= 0 ? '+' : ''}
                {momZ.toFixed(2)}σ
              </dd>
            </div>
          </dl>
        </section>

        <div className="lg:col-span-7 flex">
          <div className="w-full">
            <AiBriefingPanel
              ticker={asset.ticker}
              briefing={briefing}
              loading={briefingLoading}
              error={briefingError}
              onGenerate={onGenerateBriefing}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
