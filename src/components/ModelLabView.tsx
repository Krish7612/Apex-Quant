import React, { useState } from 'react';
import { Play } from 'lucide-react';
import type { ModelArchitecture, ModelConfig, ModelResult } from '../lib/types';

interface ModelLabViewProps {
  ticker: string;
  draftConfig: ModelConfig;
  onChangeDraft: (next: ModelConfig) => void;
  onTrain: () => void;
  modelResult: ModelResult;
  trainingVersion: number;
}

export const ModelLabView: React.FC<ModelLabViewProps> = ({
  ticker,
  draftConfig,
  onChangeDraft,
  onTrain,
  modelResult,
  trainingVersion,
}) => {
  const [hoverEpochIdx, setHoverEpochIdx] = useState<number | null>(null);

  const lossHistory = modelResult.lossHistory;
  const maxLoss = Math.max(
    0.001,
    ...lossHistory.map((p) => Math.max(p.trainLoss, p.valLoss)),
  );
  const minLoss = Math.min(
    ...lossHistory.map((p) => Math.min(p.trainLoss, p.valLoss)),
  );
  const lossSpan = Math.max(0.0001, maxLoss - minLoss);

  const svgW = 620;
  const svgH = 240;
  const pad = { top: 18, right: 20, bottom: 30, left: 48 };
  const plotW = svgW - pad.left - pad.right;
  const plotH = svgH - pad.top - pad.bottom;

  const xOf = (idx: number) =>
    pad.left + (lossHistory.length > 1 ? (idx / (lossHistory.length - 1)) * plotW : 0);
  const yOf = (val: number) => pad.top + ((maxLoss - val) / lossSpan) * plotH;

  const trainPath = lossHistory
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p.trainLoss).toFixed(1)}`)
    .join(' ');
  const valPath = lossHistory
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p.valLoss).toFixed(1)}`)
    .join(' ');

  const activeEpoch =
    hoverEpochIdx !== null
      ? lossHistory[hoverEpochIdx]
      : lossHistory[lossHistory.length - 1];

  const isDirty = JSON.stringify(draftConfig) !== JSON.stringify(modelResult.config);

  const toggleFeature = (key: keyof ModelConfig['features']) => {
    const nextFeatures = { ...draftConfig.features, [key]: !draftConfig.features[key] };
    // Ensure at least one feature channel remains active
    if (!Object.values(nextFeatures).some(Boolean)) return;
    onChangeDraft({ ...draftConfig, features: nextFeatures });
  };

  return (
    <div className="space-y-6">
      {/* Top Row: Configuration + Training Loss Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Hyperparameter Controls */}
        <section
          aria-label="Neural model hyperparameters"
          className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="pb-3 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">
                Keras / TensorFlow Model Configuration
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure temporal architecture and feature inputs for {ticker}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Sequence Architecture
              </label>
              <div
                className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-md"
                role="group"
                aria-label="Model architecture selector"
              >
                {(['LSTM', 'GRU', 'Dense'] as ModelArchitecture[]).map((arch) => (
                  <button
                    key={arch}
                    type="button"
                    onClick={() => onChangeDraft({ ...draftConfig, architecture: arch })}
                    className={`py-2 text-xs font-medium rounded whitespace-nowrap transition-colors cursor-pointer ${
                      draftConfig.architecture === arch
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {arch}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="lookback-select" className="block text-xs font-medium text-slate-700 mb-1">
                  Lookback Window
                </label>
                <select
                  id="lookback-select"
                  value={draftConfig.lookbackWindow}
                  onChange={(e) =>
                    onChangeDraft({ ...draftConfig, lookbackWindow: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md text-slate-900"
                >
                  <option value={10}>10 trading days</option>
                  <option value={20}>20 trading days</option>
                  <option value={30}>30 trading days</option>
                  <option value={60}>60 trading days</option>
                </select>
              </div>

              <div>
                <label htmlFor="horizon-select" className="block text-xs font-medium text-slate-700 mb-1">
                  Forecast Horizon
                </label>
                <select
                  id="horizon-select"
                  value={draftConfig.forecastHorizon}
                  onChange={(e) =>
                    onChangeDraft({ ...draftConfig, forecastHorizon: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md text-slate-900"
                >
                  <option value={7}>7 trading days</option>
                  <option value={14}>14 trading days</option>
                  <option value={21}>21 trading days</option>
                  <option value={30}>30 trading days</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="epochs-input" className="block text-xs font-medium text-slate-700 mb-1">
                  Epochs
                </label>
                <input
                  id="epochs-input"
                  type="number"
                  min={10}
                  max={80}
                  step={5}
                  value={draftConfig.epochs}
                  onChange={(e) =>
                    onChangeDraft({
                      ...draftConfig,
                      epochs: Math.max(10, Math.min(80, Number(e.target.value) || 20)),
                    })
                  }
                  className="w-full px-2.5 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md text-slate-900"
                />
              </div>

              <div>
                <label htmlFor="lr-select" className="block text-xs font-medium text-slate-700 mb-1">
                  Learning Rate
                </label>
                <select
                  id="lr-select"
                  value={draftConfig.learningRate}
                  onChange={(e) =>
                    onChangeDraft({ ...draftConfig, learningRate: Number(e.target.value) })
                  }
                  className="w-full px-2 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md text-slate-900"
                >
                  <option value={0.002}>0.002</option>
                  <option value={0.005}>0.005</option>
                  <option value={0.008}>0.008</option>
                  <option value={0.015}>0.015</option>
                </select>
              </div>

              <div>
                <label htmlFor="split-select" className="block text-xs font-medium text-slate-700 mb-1">
                  Train Split
                </label>
                <select
                  id="split-select"
                  value={draftConfig.trainSplit}
                  onChange={(e) =>
                    onChangeDraft({ ...draftConfig, trainSplit: Number(e.target.value) })
                  }
                  className="w-full px-2.5 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md text-slate-900"
                >
                  <option value={0.7}>70 / 30</option>
                  <option value={0.8}>80 / 20</option>
                  <option value={0.85}>85 / 15</option>
                </select>
              </div>
            </div>

            <fieldset>
              <legend className="text-xs font-medium text-slate-700 mb-2">
                Engineered Feature Channels
              </legend>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftConfig.features.returns}
                    onChange={() => toggleFeature('returns')}
                    className="rounded border-slate-300 text-blue-700"
                  />
                  Log Returns & Range
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftConfig.features.movingAverages}
                    onChange={() => toggleFeature('movingAverages')}
                    className="rounded border-slate-300 text-blue-700"
                  />
                  SMA 20 / EMA 50 Spread
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftConfig.features.rsi}
                    onChange={() => toggleFeature('rsi')}
                    className="rounded border-slate-300 text-blue-700"
                  />
                  RSI-14 Momentum
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftConfig.features.volatility}
                    onChange={() => toggleFeature('volatility')}
                    className="rounded border-slate-300 text-blue-700"
                  />
                  20D Realized Volatility
                </label>
              </div>
            </fieldset>
          </div>

          <div className="pt-5 mt-5 border-t border-slate-100 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500 tabular-nums">
              Run #{trainingVersion} · {isDirty ? 'Unsaved parameter changes' : 'Synced with active forecast'}
            </span>
            <button
              type="button"
              onClick={onTrain}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              Train Model
            </button>
          </div>
        </section>

        {/* Epoch Convergence Chart & Out-of-Sample Diagnostics */}
        <section
          aria-label="Training and validation loss convergence"
          className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between"
        >
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Adam Optimization Loss Curve (MSE)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                  Epoch {activeEpoch.epoch} / {lossHistory.length}
                  {' · '}Train Loss <strong className="font-mono text-blue-700">{activeEpoch.trainLoss.toFixed(4)}</strong>
                  {' · '}Val Loss <strong className="font-mono text-amber-700">{activeEpoch.valLoss.toFixed(4)}</strong>
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3.5 h-0.5 bg-blue-700 inline-block" aria-hidden="true" />
                  Training MSE
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3.5 h-0.5 bg-amber-600 inline-block" aria-hidden="true" />
                  Validation MSE
                </span>
              </div>
            </div>

            <div className="mt-3">
              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                className="w-full h-auto select-none cursor-crosshair"
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const relX = ((e.clientX - rect.left) / rect.width) * svgW;
                  const idx = Math.round(((relX - pad.left) / plotW) * (lossHistory.length - 1));
                  setHoverEpochIdx(Math.max(0, Math.min(lossHistory.length - 1, idx)));
                }}
                onMouseLeave={() => setHoverEpochIdx(null)}
                role="img"
                aria-label="Training and validation MSE loss across epochs"
                data-testid="loss-curve-svg"
              >
                {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                  const val = minLoss + lossSpan * frac;
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
                        x={pad.left - 8}
                        y={y + 4}
                        textAnchor="end"
                        fontSize="10"
                        fill="#64748B"
                        fontFamily="IBM Plex Mono, monospace"
                      >
                        {val.toFixed(2)}
                      </text>
                    </g>
                  );
                })}

                <path d={trainPath} fill="none" stroke="#1D4ED8" strokeWidth="2" />
                <path d={valPath} fill="none" stroke="#D97706" strokeWidth="1.75" strokeDasharray="4 3" />

                {hoverEpochIdx !== null && (
                  <g>
                    <line
                      x1={xOf(hoverEpochIdx)}
                      y1={pad.top}
                      x2={xOf(hoverEpochIdx)}
                      y2={pad.top + plotH}
                      stroke="#94A3B8"
                      strokeDasharray="2 2"
                    />
                    <circle
                      cx={xOf(hoverEpochIdx)}
                      cy={yOf(lossHistory[hoverEpochIdx].trainLoss)}
                      r="3.5"
                      fill="#1D4ED8"
                    />
                    <circle
                      cx={xOf(hoverEpochIdx)}
                      cy={yOf(lossHistory[hoverEpochIdx].valLoss)}
                      r="3.5"
                      fill="#D97706"
                    />
                  </g>
                )}

                <text
                  x={pad.left}
                  y={svgH - 8}
                  fontSize="10"
                  fill="#64748B"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  Epoch 1
                </text>
                <text
                  x={pad.left + plotW}
                  y={svgH - 8}
                  textAnchor="end"
                  fontSize="10"
                  fill="#64748B"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  Epoch {lossHistory.length}
                </text>
              </svg>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-4 mt-2 border-t border-slate-100">
            <div>
              <p className="text-xs text-slate-500">Test RMSE</p>
              <p className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                ${modelResult.metrics.rmse.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Test MAE</p>
              <p className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                ${modelResult.metrics.mae.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">MAPE</p>
              <p className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                {modelResult.metrics.mape.toFixed(2)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">R-Squared</p>
              <p className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                {modelResult.metrics.rSquared.toFixed(3)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Dir. Accuracy</p>
              <p className="text-base font-semibold font-mono tabular-nums text-emerald-700 mt-0.5">
                {modelResult.metrics.directionalAccuracy.toFixed(1)}%
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Keras Layer Topology Table */}
      <section
        aria-label="Keras Sequential layer topology summary"
        className="bg-white border border-slate-200 rounded-lg overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Sequential Network Topology ({modelResult.config.architecture})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              {modelResult.metrics.trainSamples} training windows · {modelResult.metrics.valSamples} holdout test windows · {modelResult.metrics.featureCount} input channels
            </p>
          </div>
          <p className="text-xs font-mono tabular-nums text-slate-700">
            Total trainable params: <strong>{modelResult.totalParams.toLocaleString()}</strong>
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                <th className="py-2.5 px-5">Layer Name</th>
                <th className="py-2.5 px-4">Keras Layer Type</th>
                <th className="py-2.5 px-4">Output Shape</th>
                <th className="py-2.5 px-4">Activation</th>
                <th className="py-2.5 px-5 text-right">Parameters</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {modelResult.layers.map((layer) => (
                <tr key={layer.layerName} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-5 font-mono text-xs text-slate-900">{layer.layerName}</td>
                  <td className="py-2.5 px-4 text-slate-700">{layer.type}</td>
                  <td className="py-2.5 px-4 font-mono text-xs text-slate-600">{layer.outputShape}</td>
                  <td className="py-2.5 px-4 text-xs text-slate-600">{layer.activation}</td>
                  <td className="py-2.5 px-5 text-right font-mono tabular-nums text-xs text-slate-900">
                    {layer.params.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
