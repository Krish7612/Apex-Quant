import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBarsToCsv, getDefaultAssets, parseStockCsv } from './marketData';
import {
  classifyTrendRegime,
  computeEMA,
  computeRSI,
  computeSMA,
  computeTechnicalIndicators,
  runBacktest,
  trainForecastModel,
} from './quantEngine';
import { generatePythonPipeline } from './pythonGenerator';
import type { BacktestConfig, ModelConfig } from './types';

const DEFAULT_MODEL_CONFIG: ModelConfig = {
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

const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  initialCapital: 100000,
  buyThresholdPct: 0.25,
  sellThresholdPct: 0.25,
  stopLossPct: 5,
  feeBps: 5,
  allocationPct: 100,
};

test('default market datasets have valid chronological OHLCV bars', () => {
  const assets = getDefaultAssets();
  assert.ok(assets.length >= 5);
  for (const asset of assets) {
    assert.equal(asset.bars.length, 260);
    for (let i = 0; i < asset.bars.length; i++) {
      const b = asset.bars[i];
      assert.ok(b.high >= Math.max(b.open, b.close), `${asset.ticker} high >= max(open,close)`);
      assert.ok(b.low <= Math.min(b.open, b.close), `${asset.ticker} low <= min(open,close)`);
      assert.ok(b.volume > 0);
      if (i > 0) {
        assert.ok(b.date > asset.bars[i - 1].date, 'dates strictly chronological');
      }
    }
  }
});

test('technical indicators compute accurate SMA, EMA, and RSI values', () => {
  const simple = [10, 12, 14, 16, 18, 20];
  const sma3 = computeSMA(simple, 3);
  assert.deepEqual(sma3, [null, null, 12, 14, 16, 18]);

  const ema3 = computeEMA(simple, 3);
  assert.equal(ema3[2], 12);
  assert.equal(ema3[3], 14);

  const monotonicUp = Array.from({ length: 20 }, (_, i) => 100 + i * 2);
  const rsiUp = computeRSI(monotonicUp, 14);
  assert.equal(rsiUp[14], 100);
  assert.equal(rsiUp[19], 100);
});

test('neural forecast model reduces training MSE and outputs valid horizon cone', () => {
  const nvda = getDefaultAssets()[0];
  const indicators = computeTechnicalIndicators(nvda.bars);
  const result = trainForecastModel(nvda.bars, indicators, DEFAULT_MODEL_CONFIG);

  assert.equal(result.lossHistory.length, DEFAULT_MODEL_CONFIG.epochs);
  const firstLoss = result.lossHistory[0].trainLoss;
  const lastLoss = result.lossHistory[result.lossHistory.length - 1].trainLoss;
  assert.ok(lastLoss < firstLoss, `Expected training loss to decrease (${firstLoss} -> ${lastLoss})`);

  assert.equal(result.forecastPoints.length, DEFAULT_MODEL_CONFIG.forecastHorizon);
  for (const fp of result.forecastPoints) {
    assert.ok(Number.isFinite(fp.predicted) && fp.predicted > 0);
    assert.ok(fp.lower95 <= fp.predicted && fp.predicted <= fp.upper95);
  }

  assert.ok(result.metrics.rmse > 0 && Number.isFinite(result.metrics.rmse));
  assert.ok(result.metrics.directionalAccuracy >= 0 && result.metrics.directionalAccuracy <= 100);
  assert.ok(['BUY', 'HOLD', 'SELL'].includes(result.currentSignal));
  assert.ok(result.totalParams > 1000);
  assert.ok(classifyTrendRegime(nvda.bars, indicators).length > 0);
});

test('strategy backtester computes consistent equity curve, alpha, and drawdown', () => {
  const nvda = getDefaultAssets()[0];
  const indicators = computeTechnicalIndicators(nvda.bars);
  const model = trainForecastModel(nvda.bars, indicators, DEFAULT_MODEL_CONFIG);
  const bt = runBacktest(model.validationPoints, DEFAULT_BACKTEST_CONFIG);

  assert.equal(bt.equityCurve.length, model.validationPoints.length);
  assert.ok(bt.finalEquity > 0);
  assert.ok(bt.maxDrawdownPct <= 0);
  assert.equal(
    Number((bt.totalReturnPct - bt.benchmarkReturnPct).toFixed(2)),
    bt.excessAlphaPct,
  );
  for (const tr of bt.trades) {
    assert.ok(tr.shares > 0 && tr.price > 0 && tr.equityAfter > 0);
  }
});

test('CSV parser handles valid round-trip CSV and rejects malformed or short inputs', () => {
  const aapl = getDefaultAssets()[1];
  const csv = formatBarsToCsv(aapl.bars);
  const parsed = parseStockCsv(csv);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.bars.length, aapl.bars.length);
    assert.equal(parsed.bars[0].close, aapl.bars[0].close);
  }

  const emptyErr = parseStockCsv('');
  assert.equal(emptyErr.ok, false);

  const shortErr = parseStockCsv('Date,Close\n2026-01-01,100\n2026-01-02,101');
  assert.equal(shortErr.ok, false);

  const badHeaderErr = parseStockCsv('Foo,Bar\n' + 'a,b\n'.repeat(85));
  assert.equal(badHeaderErr.ok, false);
});

test('Python pipeline generator syncs ticker, architecture, and hyperparameters', () => {
  const gruConfig: ModelConfig = {
    ...DEFAULT_MODEL_CONFIG,
    architecture: 'GRU',
    lookbackWindow: 30,
    forecastHorizon: 21,
    epochs: 45,
  };
  const code = generatePythonPipeline('MSFT', gruConfig, DEFAULT_BACKTEST_CONFIG);
  assert.ok(code.includes('TICKER = "MSFT"'));
  assert.ok(code.includes('LOOKBACK = 30'));
  assert.ok(code.includes('HORIZON = 21'));
  assert.ok(code.includes('EPOCHS = 45'));
  assert.ok(code.includes('from tensorflow.keras.layers import GRU, Dense, Dropout'));
  assert.ok(code.includes('import matplotlib.pyplot as plt'));
});
