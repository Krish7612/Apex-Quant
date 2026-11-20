export interface StockBar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockAsset {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  bars: StockBar[];
  isCustom?: boolean;
}

export interface TechnicalSeries {
  sma20: (number | null)[];
  ema50: (number | null)[];
  bollingerUpper: (number | null)[];
  bollingerLower: (number | null)[];
  rsi14: (number | null)[];
  macdLine: (number | null)[];
  macdSignal: (number | null)[];
  macdHistogram: (number | null)[];
  volatility20d: (number | null)[];
  momentumZ: (number | null)[];
}

export type ModelArchitecture = 'LSTM' | 'GRU' | 'Dense';

export interface FeatureFlags {
  returns: boolean;
  movingAverages: boolean;
  rsi: boolean;
  volatility: boolean;
}

export interface ModelConfig {
  architecture: ModelArchitecture;
  lookbackWindow: number;
  forecastHorizon: number;
  epochs: number;
  learningRate: number;
  trainSplit: number; // 0.7 | 0.8 | 0.85
  features: FeatureFlags;
}

export interface EpochLossPoint {
  epoch: number;
  trainLoss: number;
  valLoss: number;
}

export interface ValidationPoint {
  index: number;
  date: string;
  actual: number;
  predicted: number;
  predictedReturnPct: number;
  signal: 'BUY' | 'HOLD' | 'SELL';
}

export interface ForecastPoint {
  step: number;
  date: string;
  predicted: number;
  lower95: number;
  upper95: number;
}

export interface LayerSpec {
  layerName: string;
  type: string;
  outputShape: string;
  params: number;
  activation: string;
}

export interface ModelMetrics {
  rmse: number;
  mae: number;
  mape: number;
  rSquared: number;
  directionalAccuracy: number;
  trainSamples: number;
  valSamples: number;
  featureCount: number;
}

export interface ModelResult {
  config: ModelConfig;
  lossHistory: EpochLossPoint[];
  validationPoints: ValidationPoint[];
  forecastPoints: ForecastPoint[];
  metrics: ModelMetrics;
  layers: LayerSpec[];
  totalParams: number;
  currentSignal: 'BUY' | 'HOLD' | 'SELL';
  projectedClose: number;
  projectedReturnPct: number;
  signalConfidencePct: number;
}

export interface BacktestConfig {
  initialCapital: number;
  buyThresholdPct: number;
  sellThresholdPct: number;
  stopLossPct: number;
  feeBps: number;
  allocationPct: number;
}

export interface TradeRecord {
  id: number;
  date: string;
  action: 'BUY' | 'SELL';
  price: number;
  shares: number;
  value: number;
  fee: number;
  pnl: number | null;
  pnlPct: number | null;
  equityAfter: number;
  reason: string;
}

export interface EquityPoint {
  date: string;
  strategyEquity: number;
  benchmarkEquity: number;
  drawdownPct: number;
  position: 'LONG' | 'CASH';
}

export interface BacktestResult {
  config: BacktestConfig;
  equityCurve: EquityPoint[];
  trades: TradeRecord[];
  finalEquity: number;
  totalReturnPct: number;
  benchmarkReturnPct: number;
  excessAlphaPct: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  winRatePct: number;
  closedTrades: number;
}

export interface QuantBriefing {
  headline: string;
  executiveSummary: string;
  keyDrivers: string[];
  riskFactors: string[];
  executionGuidance: string;
}

export type WorkspaceTab = 'forecast' | 'model' | 'backtest' | 'pipeline';
