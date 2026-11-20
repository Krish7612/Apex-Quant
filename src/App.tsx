import { useMemo, useState } from 'react';
import { Menu } from 'lucide-react';
import { getDefaultAssets } from './lib/marketData';
import {
  classifyTrendRegime,
  computeTechnicalIndicators,
  runBacktest,
  trainForecastModel,
} from './lib/quantEngine';
import type {
  BacktestConfig,
  ModelConfig,
  QuantBriefing,
  StockAsset,
  WorkspaceTab,
} from './lib/types';
import { Sidebar } from './components/Sidebar';
import { ForecastView } from './components/ForecastView';
import { ModelLabView } from './components/ModelLabView';
import { BacktestView } from './components/BacktestView';
import { PipelineView } from './components/PipelineView';

const INITIAL_MODEL_CONFIG: ModelConfig = {
  architecture: 'LSTM',
  lookbackWindow: 20,
  forecastHorizon: 14,
  epochs: 30,
  learningRate: 0.008,
  trainSplit: 0.8,
  features: {
    returns: true,
    movingAverages: true,
    rsi: true,
    volatility: true,
  },
};

const INITIAL_BACKTEST_CONFIG: BacktestConfig = {
  initialCapital: 100000,
  buyThresholdPct: 0.25,
  sellThresholdPct: 0.25,
  stopLossPct: 5,
  feeBps: 5,
  allocationPct: 100,
};

const TAB_LABELS: Record<WorkspaceTab, string> = {
  forecast: 'Forecast & Signals',
  model: 'Model Lab',
  backtest: 'Strategy Backtester',
  pipeline: 'Data & Python Code',
};

export default function App() {
  const [assets, setAssets] = useState<StockAsset[]>(() => getDefaultAssets());
  const [activeTicker, setActiveTicker] = useState<string>('NVDA');
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('forecast');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [modelConfig, setModelConfig] = useState<ModelConfig>(INITIAL_MODEL_CONFIG);
  const [draftModelConfig, setDraftModelConfig] = useState<ModelConfig>(INITIAL_MODEL_CONFIG);
  const [trainingVersion, setTrainingVersion] = useState(1);

  const [backtestConfig, setBacktestConfig] = useState<BacktestConfig>(INITIAL_BACKTEST_CONFIG);
  const [draftBacktestConfig, setDraftBacktestConfig] = useState<BacktestConfig>(INITIAL_BACKTEST_CONFIG);

  const [briefingsByTicker, setBriefingsByTicker] = useState<Record<string, QuantBriefing>>({});
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);

  const activeAsset = useMemo(
    () => assets.find((a) => a.ticker === activeTicker) ?? assets[0],
    [assets, activeTicker],
  );

  const activeIndicators = useMemo(
    () => computeTechnicalIndicators(activeAsset.bars),
    [activeAsset],
  );

  const activeModelResult = useMemo(
    () => trainForecastModel(activeAsset.bars, activeIndicators, modelConfig),
    [activeAsset, activeIndicators, modelConfig],
  );

  const activeBacktestResult = useMemo(
    () => runBacktest(activeModelResult.validationPoints, backtestConfig),
    [activeModelResult.validationPoints, backtestConfig],
  );

  // Lightweight watchlist signals for sidebar
  const watchlist = useMemo(() => {
    return assets.map((asset) => {
      const n = asset.bars.length;
      const last = asset.bars[n - 1].close;
      const prev = asset.bars[Math.max(0, n - 2)].close;
      const dailyChangePct = ((last - prev) / prev) * 100;
      const ind = computeTechnicalIndicators(asset.bars);
      const res =
        asset.ticker === activeAsset.ticker
          ? activeModelResult
          : trainForecastModel(asset.bars, ind, { ...modelConfig, epochs: 20 });

      return {
        ticker: asset.ticker,
        name: asset.name,
        lastClose: last,
        dailyChangePct,
        signal: res.currentSignal,
      };
    });
  }, [assets, activeAsset.ticker, activeModelResult, modelConfig]);

  const handleSelectTicker = (ticker: string) => {
    setActiveTicker(ticker);
    setBriefingError(null);
  };

  const handleTrainModel = () => {
    setModelConfig({ ...draftModelConfig });
    setTrainingVersion((v) => v + 1);
    setBriefingError(null);
  };

  const handleRunBacktest = () => {
    setBacktestConfig({ ...draftBacktestConfig });
  };

  const handleImportCustomAsset = (ticker: string, bars: StockAsset['bars']) => {
    const newAsset: StockAsset = {
      ticker,
      name: `${ticker} (Imported CSV)`,
      exchange: 'CUSTOM',
      sector: 'User Dataset',
      bars,
      isCustom: true,
    };
    setAssets((prev) => {
      const filtered = prev.filter((a) => a.ticker !== ticker);
      return [newAsset, ...filtered];
    });
    setActiveTicker(ticker);
    setTrainingVersion((v) => v + 1);
  };

  const handleGenerateBriefing = async () => {
    setBriefingLoading(true);
    setBriefingError(null);

    const n = activeAsset.bars.length;
    const lastClose = activeAsset.bars[n - 1].close;
    const prevClose = activeAsset.bars[Math.max(0, n - 2)].close;
    const dailyChangePct = ((lastClose - prevClose) / prevClose) * 100;

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: activeAsset.ticker,
          companyName: activeAsset.name,
          sector: activeAsset.sector,
          lastClose,
          dailyChangePct,
          forecastHorizon: activeModelResult.config.forecastHorizon,
          projectedClose: activeModelResult.projectedClose,
          projectedReturnPct: activeModelResult.projectedReturnPct,
          signal: activeModelResult.currentSignal,
          architecture: activeModelResult.config.architecture,
          lookbackWindow: activeModelResult.config.lookbackWindow,
          rmse: activeModelResult.metrics.rmse,
          mape: activeModelResult.metrics.mape,
          directionalAccuracy: activeModelResult.metrics.directionalAccuracy,
          rsi14: activeIndicators.rsi14[n - 1] ?? 50,
          macdHistogram: activeIndicators.macdHistogram[n - 1] ?? 0,
          volatility20d: activeIndicators.volatility20d[n - 1] ?? 0,
          trendRegime: classifyTrendRegime(activeAsset.bars, activeIndicators),
          backtestReturnPct: activeBacktestResult.totalReturnPct,
          benchmarkReturnPct: activeBacktestResult.benchmarkReturnPct,
          sharpeRatio: activeBacktestResult.sharpeRatio,
          maxDrawdownPct: activeBacktestResult.maxDrawdownPct,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || `Request failed with status ${response.status}`);
      }

      if (payload?.briefing) {
        setBriefingsByTicker((prev) => ({
          ...prev,
          [activeAsset.ticker]: payload.briefing as QuantBriefing,
        }));
      }
    } catch (err) {
      setBriefingError(err instanceof Error ? err.message : 'Network error requesting AI analysis.');
    } finally {
      setBriefingLoading(false);
    }
  };

  const handleSelectTab = (tab: WorkspaceTab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        assets={assets}
        watchlist={watchlist}
        activeTicker={activeAsset.ticker}
        onSelectTicker={handleSelectTicker}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb trail left, single primary action right */}
        <header className="h-14 bg-white border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-md cursor-pointer"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm truncate">
              <span className="text-slate-500 whitespace-nowrap hidden sm:inline">
                Stock Trend Predictor
              </span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 whitespace-nowrap">
                {TAB_LABELS[activeTab]}
              </span>
              <span className="text-slate-300" aria-hidden="true">
                /
              </span>
              <span className="font-mono font-medium text-blue-700 whitespace-nowrap">
                {activeAsset.ticker}
              </span>
            </nav>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => handleSelectTab(activeTab === 'model' ? 'pipeline' : 'model')}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              {activeTab === 'model' ? 'Python Pipeline' : 'Configure Model'}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'forecast' && (
            <ForecastView
              asset={activeAsset}
              indicators={activeIndicators}
              modelResult={activeModelResult}
              briefing={briefingsByTicker[activeAsset.ticker] ?? null}
              briefingLoading={briefingLoading}
              briefingError={briefingError}
              onGenerateBriefing={handleGenerateBriefing}
            />
          )}

          {activeTab === 'model' && (
            <ModelLabView
              ticker={activeAsset.ticker}
              draftConfig={draftModelConfig}
              onChangeDraft={setDraftModelConfig}
              onTrain={handleTrainModel}
              modelResult={activeModelResult}
              trainingVersion={trainingVersion}
            />
          )}

          {activeTab === 'backtest' && (
            <BacktestView
              ticker={activeAsset.ticker}
              draftConfig={draftBacktestConfig}
              onChangeDraft={setDraftBacktestConfig}
              onRunBacktest={handleRunBacktest}
              backtestResult={activeBacktestResult}
            />
          )}

          {activeTab === 'pipeline' && (
            <PipelineView
              asset={activeAsset}
              indicators={activeIndicators}
              modelConfig={modelConfig}
              backtestConfig={backtestConfig}
              onImportCustomAsset={handleImportCustomAsset}
            />
          )}
        </main>
      </div>
    </div>
  );
}
