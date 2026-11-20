import React, { useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, Upload, AlertCircle } from 'lucide-react';
import { formatBarsToCsv, parseStockCsv } from '../lib/marketData';
import { generatePythonPipeline } from '../lib/pythonGenerator';
import type { BacktestConfig, ModelConfig, StockAsset, TechnicalSeries } from '../lib/types';

interface PipelineViewProps {
  asset: StockAsset;
  indicators: TechnicalSeries;
  modelConfig: ModelConfig;
  backtestConfig: BacktestConfig;
  onImportCustomAsset: (ticker: string, bars: StockAsset['bars']) => void;
}

export const PipelineView: React.FC<PipelineViewProps> = ({
  asset,
  indicators,
  modelConfig,
  backtestConfig,
  onImportCustomAsset,
}) => {
  const [copied, setCopied] = useState(false);
  const [dateSearch, setDateSearch] = useState('');
  const [customTicker, setCustomTicker] = useState('');
  const [csvText, setCsvText] = useState('');
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvSuccess, setCsvSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const pythonCode = useMemo(
    () => generatePythonPipeline(asset.ticker, modelConfig, backtestConfig),
    [asset.ticker, modelConfig, backtestConfig],
  );

  const tableRows = useMemo(() => {
    const query = dateSearch.trim().toLowerCase();
    const list = asset.bars
      .map((bar, idx) => ({
        bar,
        sma20: indicators.sma20[idx],
        rsi14: indicators.rsi14[idx],
        vol20d: indicators.volatility20d[idx],
      }))
      .reverse();

    if (!query) return list.slice(0, 25);
    return list.filter((row) => row.bar.date.toLowerCase().includes(query)).slice(0, 50);
  }, [asset.bars, indicators, dateSearch]);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(pythonCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleDownloadPy = () => {
    const blob = new Blob([pythonCode], { type: 'text/x-python;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${asset.ticker.toLowerCase()}_trend_predictor.py`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSampleCsv = () => {
    const csv = formatBarsToCsv(asset.bars);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${asset.ticker.toLowerCase()}_historical.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const inferredTicker = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase();
    if (!customTicker && inferredTicker) {
      setCustomTicker(inferredTicker);
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      setCsvText(content);
      setCsvError(null);
      setCsvSuccess(null);
    };
    reader.readAsText(file);
  };

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCsvError(null);
    setCsvSuccess(null);

    const cleanedTicker = customTicker.trim().toUpperCase();
    if (!cleanedTicker || !/^[A-Z0-9.-]{1,8}$/.test(cleanedTicker)) {
      setCsvError('Enter a valid ticker symbol (1–8 alphanumeric characters, e.g., GOOGL or BTC-USD).');
      return;
    }

    const parsed = parseStockCsv(csvText);
    if (!parsed.ok) {
      setCsvError(parsed.error);
      return;
    }

    onImportCustomAsset(cleanedTicker, parsed.bars);
    setCsvSuccess(`Imported ${parsed.bars.length} daily bars for ${cleanedTicker} and retrained the active model.`);
    setCsvText('');
    setCustomTicker('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Synced Python / TensorFlow / Keras Code Pipeline */}
      <section
        aria-label="Synced Python and Keras TensorFlow script"
        className="bg-white border border-slate-200 rounded-lg overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Python · NumPy · Pandas · Matplotlib · Keras/TensorFlow Pipeline
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              Synced to {asset.ticker} · {modelConfig.architecture} · Lookback {modelConfig.lookbackWindow}d · Horizon {modelConfig.forecastHorizon}d · {modelConfig.epochs} epochs
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyCode}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy Code'}
            </button>
            <button
              type="button"
              onClick={handleDownloadPy}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Download .py
            </button>
          </div>
        </div>

        <div className="bg-slate-950 text-slate-100 p-5 overflow-x-auto max-h-96 overflow-y-auto">
          <pre className="text-xs font-mono leading-relaxed" data-testid="python-code-block">
            <code>{pythonCode}</code>
          </pre>
        </div>
      </section>

      {/* Bottom Split: Custom CSV Importer + Historical Feature Dataset Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section
          aria-label="Import custom historical CSV dataset"
          className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5"
        >
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Import Historical CSV</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Load your own OHLCV dataset (min. 80 trading days)
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadSampleCsv}
              className="text-xs font-medium text-blue-700 hover:text-blue-800 underline underline-offset-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Export {asset.ticker} CSV
            </button>
          </div>

          <form onSubmit={handleImportSubmit} className="mt-4 space-y-4" noValidate>
            <div>
              <label htmlFor="custom-ticker-input" className="block text-xs font-medium text-slate-700 mb-1">
                Ticker Symbol
              </label>
              <input
                id="custom-ticker-input"
                type="text"
                placeholder="e.g. GOOGL"
                value={customTicker}
                onChange={(e) => setCustomTicker(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono uppercase bg-white border border-slate-300 rounded-md text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="csv-file-input" className="block text-xs font-medium text-slate-700 mb-1">
                Upload CSV File
              </label>
              <input
                ref={fileInputRef}
                id="csv-file-input"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="block w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-300 file:text-xs file:font-medium file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100"
              />
            </div>

            <div>
              <label htmlFor="csv-paste-input" className="block text-xs font-medium text-slate-700 mb-1">
                Or Paste CSV Rows (Date,Open,High,Low,Close,Volume)
              </label>
              <textarea
                id="csv-paste-input"
                rows={4}
                placeholder={'Date,Open,High,Low,Close,Volume\n2026-01-02,150.20,152.10,149.80,151.45,32100000'}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-md text-slate-900"
              />
            </div>

            {csvError && (
              <div
                role="alert"
                className="p-3 rounded-md border border-red-200 bg-red-50 text-red-800 text-xs flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-700" aria-hidden="true" />
                <span>{csvError}</span>
              </div>
            )}

            {csvSuccess && (
              <div
                role="status"
                className="p-3 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs"
              >
                {csvSuccess}
              </div>
            )}

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              Validate & Load Dataset
            </button>
          </form>
        </section>

        <section
          aria-label="Historical OHLCV and computed features table"
          className="lg:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Engineered Feature Matrix ({asset.ticker})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                Showing latest {tableRows.length} of {asset.bars.length} trading sessions
              </p>
            </div>
            <div>
              <label htmlFor="date-search-input" className="sr-only">
                Filter rows by date
              </label>
              <input
                id="date-search-input"
                type="search"
                placeholder="Filter YYYY-MM…"
                value={dateSearch}
                onChange={(e) => setDateSearch(e.target.value)}
                className="px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md text-slate-900 w-44"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-3 text-right">Open</th>
                  <th className="py-2.5 px-3 text-right">Close</th>
                  <th className="py-2.5 px-3 text-right">SMA 20</th>
                  <th className="py-2.5 px-3 text-right">RSI 14</th>
                  <th className="py-2.5 px-4 text-right">Vol 20D</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
                {tableRows.map(({ bar, sma20, rsi14, vol20d }) => (
                  <tr key={bar.date} className="hover:bg-slate-50/70">
                    <td className="py-2 px-4 text-slate-700">{bar.date}</td>
                    <td className="py-2 px-3 text-right text-slate-600">${bar.open.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right font-medium text-slate-900">${bar.close.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right text-slate-600">
                      {sma20 !== null ? `$${sma20.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-700">
                      {rsi14 !== null ? rsi14.toFixed(1) : '—'}
                    </td>
                    <td className="py-2 px-4 text-right text-slate-600">
                      {vol20d !== null ? `${vol20d.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};
