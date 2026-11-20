import React from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import type { QuantBriefing } from '../lib/types';

interface AiBriefingPanelProps {
  ticker: string;
  briefing: QuantBriefing | null;
  loading: boolean;
  error: string | null;
  onGenerate: () => void;
}

export const AiBriefingPanel: React.FC<AiBriefingPanelProps> = ({
  ticker,
  briefing,
  loading,
  error,
  onGenerate,
}) => {
  return (
    <section
      aria-label="AI quantitative research briefing"
      className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between"
    >
      <div>
        <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              AI Quantitative Research Note
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Synthesizes forecast trajectory, technical momentum, and walk-forward risk metrics for {ticker}
            </p>
          </div>
          <button
            type="button"
            onClick={onGenerate}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            {loading ? 'Analyzing…' : briefing ? 'Refresh Note' : 'Generate Briefing'}
          </button>
        </div>

        {loading && (
          <div className="py-5 space-y-3" role="status" aria-label="Generating AI quantitative briefing">
            <div className="h-4 bg-slate-100 rounded w-3/4 animate-pulse" />
            <div className="h-3 bg-slate-100 rounded w-full animate-pulse" />
            <div className="h-3 bg-slate-100 rounded w-5/6 animate-pulse" />
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="h-16 bg-slate-100 rounded animate-pulse" />
              <div className="h-16 bg-slate-100 rounded animate-pulse" />
            </div>
          </div>
        )}

        {!loading && error && (
          <div
            role="alert"
            className="mt-4 p-3.5 rounded-md border border-red-200 bg-red-50 text-red-800 text-xs flex items-start gap-2.5"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-700" aria-hidden="true" />
            <div>
              <p className="font-semibold">Unable to generate AI briefing</p>
              <p className="mt-0.5 text-red-700">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && !briefing && (
          <div className="py-6 text-sm text-slate-600 leading-relaxed">
            <p>
              Generate a structured desk note grounded in {ticker}&apos;s latest neural forecast,
              out-of-sample RMSE, RSI/MACD momentum, and backtested drawdown metrics.
            </p>
            <p className="text-xs text-slate-500 mt-2">
              All numerical projections remain computed deterministically by the neural sequence engine;
              AI commentary provides institutional signal synthesis and risk framing.
            </p>
          </div>
        )}

        {!loading && !error && briefing && (
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-900 leading-snug">
                {briefing.headline}
              </p>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                {briefing.executiveSummary}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
              <div>
                <h4 className="text-xs font-semibold text-slate-900 mb-1.5">
                  Signal Drivers
                </h4>
                <ul className="space-y-1.5 text-xs text-slate-600 list-disc pl-4">
                  {briefing.keyDrivers.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-900 mb-1.5">
                  Model & Market Risks
                </h4>
                <ul className="space-y-1.5 text-xs text-slate-600 list-disc pl-4">
                  {briefing.riskFactors.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 text-xs text-slate-700">
              <span className="font-semibold text-slate-900">Execution Discipline: </span>
              {briefing.executionGuidance}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
