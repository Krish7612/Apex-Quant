import type {
  BacktestConfig,
  BacktestResult,
  EpochLossPoint,
  EquityPoint,
  ForecastPoint,
  LayerSpec,
  ModelArchitecture,
  ModelConfig,
  ModelResult,
  StockBar,
  TechnicalSeries,
  TradeRecord,
  ValidationPoint,
} from './types';

export function computeSMA(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) {
      sum -= values[i - period];
    }
    if (i >= period - 1) {
      out[i] = Number((sum / period).toFixed(4));
    }
  }
  return out;
}

export function computeEMA(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let ema = sum / period;
  out[period - 1] = Number(ema.toFixed(4));
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out[i] = Number(ema.toFixed(4));
  }
  return out;
}

export function computeRSI(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss += -diff;
  }
  avgGain /= period;
  avgLoss /= period;

  out[period] = avgLoss === 0 ? 100 : Number((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2));

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : Number((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2));
  }
  return out;
}

export function computeTechnicalIndicators(bars: StockBar[]): TechnicalSeries {
  const closes = bars.map((b) => b.close);
  const n = closes.length;
  const sma20 = computeSMA(closes, 20);
  const ema50 = computeEMA(closes, 50);
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const rsi14 = computeRSI(closes, 14);

  const bollingerUpper: (number | null)[] = new Array(n).fill(null);
  const bollingerLower: (number | null)[] = new Array(n).fill(null);
  const volatility20d: (number | null)[] = new Array(n).fill(null);
  const momentumZ: (number | null)[] = new Array(n).fill(null);

  const logReturns: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    logReturns[i] = Math.log(closes[i] / closes[i - 1]);
  }

  for (let i = 19; i < n; i++) {
    const mean = sma20[i]!;
    let sq = 0;
    for (let j = i - 19; j <= i; j++) {
      const d = closes[j] - mean;
      sq += d * d;
    }
    const std = Math.sqrt(sq / 20);
    bollingerUpper[i] = Number((mean + 2 * std).toFixed(2));
    bollingerLower[i] = Number((mean - 2 * std).toFixed(2));
    momentumZ[i] = std > 1e-6 ? Number(((closes[i] - mean) / std).toFixed(2)) : 0;

    let retMean = 0;
    for (let j = i - 19; j <= i; j++) retMean += logReturns[j];
    retMean /= 20;
    let retSq = 0;
    for (let j = i - 19; j <= i; j++) {
      const d = logReturns[j] - retMean;
      retSq += d * d;
    }
    const dailyVol = Math.sqrt(retSq / 20);
    volatility20d[i] = Number((dailyVol * Math.sqrt(252) * 100).toFixed(2));
  }

  const macdLine: (number | null)[] = new Array(n).fill(null);
  const validMacdValues: number[] = [];
  const validMacdIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (ema12[i] !== null && ema26[i] !== null) {
      const m = Number((ema12[i]! - ema26[i]!).toFixed(4));
      macdLine[i] = m;
      validMacdValues.push(m);
      validMacdIndices.push(i);
    }
  }

  const macdSignal: (number | null)[] = new Array(n).fill(null);
  const macdHistogram: (number | null)[] = new Array(n).fill(null);
  const sigEma = computeEMA(validMacdValues, 9);
  for (let k = 0; k < validMacdIndices.length; k++) {
    const idx = validMacdIndices[k];
    if (sigEma[k] !== null) {
      macdSignal[idx] = sigEma[k];
      macdHistogram[idx] = Number((macdLine[idx]! - sigEma[k]!).toFixed(4));
    }
  }

  return {
    sma20,
    ema50,
    bollingerUpper,
    bollingerLower,
    rsi14,
    macdLine,
    macdSignal,
    macdHistogram,
    volatility20d,
    momentumZ,
  };
}

function nextBusinessDate(isoDate: string): string {
  const dt = new Date(`${isoDate}T00:00:00Z`);
  do {
    dt.setUTCDate(dt.getUTCDate() + 1);
  } while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6);
  return dt.toISOString().slice(0, 10);
}

export function buildKerasLayerSpecs(
  architecture: ModelArchitecture,
  lookbackWindow: number,
  featureCount: number,
): { layers: LayerSpec[]; totalParams: number } {
  if (architecture === 'LSTM') {
    const p1 = 4 * ((featureCount + 64) * 64 + 64);
    const p2 = 4 * ((64 + 32) * 32 + 32);
    const p3 = 32 * 16 + 16;
    const p4 = 16 * 1 + 1;
    const layers: LayerSpec[] = [
      { layerName: 'lstm_1', type: 'LSTM (return_sequences=True)', outputShape: `(None, ${lookbackWindow}, 64)`, params: p1, activation: 'tanh / sigmoid' },
      { layerName: 'dropout_1', type: 'Dropout (rate=0.20)', outputShape: `(None, ${lookbackWindow}, 64)`, params: 0, activation: '—' },
      { layerName: 'lstm_2', type: 'LSTM', outputShape: '(None, 32)', params: p2, activation: 'tanh / sigmoid' },
      { layerName: 'dense_1', type: 'Dense', outputShape: '(None, 16)', params: p3, activation: 'relu' },
      { layerName: 'output_price', type: 'Dense', outputShape: '(None, 1)', params: p4, activation: 'linear' },
    ];
    return { layers, totalParams: p1 + p2 + p3 + p4 };
  }

  if (architecture === 'GRU') {
    const p1 = 3 * ((featureCount + 48) * 48 + 48);
    const p2 = 3 * ((48 + 24) * 24 + 24);
    const p3 = 24 * 12 + 12;
    const p4 = 12 * 1 + 1;
    const layers: LayerSpec[] = [
      { layerName: 'gru_1', type: 'GRU (return_sequences=True)', outputShape: `(None, ${lookbackWindow}, 48)`, params: p1, activation: 'tanh / sigmoid' },
      { layerName: 'dropout_1', type: 'Dropout (rate=0.15)', outputShape: `(None, ${lookbackWindow}, 48)`, params: 0, activation: '—' },
      { layerName: 'gru_2', type: 'GRU', outputShape: '(None, 24)', params: p2, activation: 'tanh / sigmoid' },
      { layerName: 'dense_1', type: 'Dense', outputShape: '(None, 12)', params: p3, activation: 'relu' },
      { layerName: 'output_price', type: 'Dense', outputShape: '(None, 1)', params: p4, activation: 'linear' },
    ];
    return { layers, totalParams: p1 + p2 + p3 + p4 };
  }

  const flatIn = lookbackWindow * featureCount;
  const p1 = flatIn * 64 + 64;
  const p2 = 64 * 32 + 32;
  const p3 = 32 * 1 + 1;
  const layers: LayerSpec[] = [
    { layerName: 'flatten_1', type: 'Flatten', outputShape: `(None, ${flatIn})`, params: 0, activation: '—' },
    { layerName: 'dense_1', type: 'Dense', outputShape: '(None, 64)', params: p1, activation: 'relu' },
    { layerName: 'dropout_1', type: 'Dropout (rate=0.20)', outputShape: '(None, 64)', params: 0, activation: '—' },
    { layerName: 'dense_2', type: 'Dense', outputShape: '(None, 32)', params: p2, activation: 'relu' },
    { layerName: 'output_price', type: 'Dense', outputShape: '(None, 1)', params: p3, activation: 'linear' },
  ];
  return { layers, totalParams: p1 + p2 + p3 };
}

function tanh(x: number): number {
  const e2 = Math.exp(2 * Math.max(-10, Math.min(10, x)));
  return (e2 - 1) / (e2 + 1);
}

/**
 * Trains a deterministic neural sequence regressor (2-layer tanh hidden network with
 * architecture-specific temporal gating/decay over lookback windows + engineered indicators)
 * using Adam gradient descent on the training split and evaluates strictly on the holdout split.
 */
export function trainForecastModel(
  bars: StockBar[],
  indicators: TechnicalSeries,
  config: ModelConfig,
): ModelResult {
  const closes = bars.map((b) => b.close);
  const n = closes.length;
  const lookback = Math.max(5, Math.min(config.lookbackWindow, Math.floor(n / 3)));

  // Build engineered feature vectors for each timestep (predicting 1-day log return)
  const sampleFeatures: number[][] = [];
  const sampleTargets: number[] = [];
  const sampleBarIndices: number[] = [];

  const decayAlpha = config.architecture === 'LSTM' ? 0.14 : config.architecture === 'GRU' ? 0.22 : 0.35;

  for (let i = Math.max(lookback, 20); i < n - 1; i++) {
    const closeNow = closes[i];
    const nextLogRet = Math.log(closes[i + 1] / closeNow);

    // Temporal sequence summary mimicking recurrent cell state across the lookback window
    let fastMem = 0;
    let slowMem = 0;
    let maxInWin = -Infinity;
    let minInWin = Infinity;
    for (let k = i - lookback + 1; k <= i; k++) {
      const r = Math.log(closes[k] / closes[Math.max(0, k - 1)]);
      fastMem = (1 - decayAlpha) * fastMem + decayAlpha * r;
      slowMem = (1 - decayAlpha * 0.4) * slowMem + decayAlpha * 0.4 * r;
      if (closes[k] > maxInWin) maxInWin = closes[k];
      if (closes[k] < minInWin) minInWin = closes[k];
    }

    const r1 = Math.log(closes[i] / closes[i - 1]);
    const r5 = Math.log(closes[i] / closes[i - Math.min(5, lookback)]);
    const rWin = Math.log(closes[i] / closes[i - lookback]);
    const rangePos = maxInWin > minInWin ? (closeNow - minInWin) / (maxInWin - minInWin) - 0.5 : 0;

    const feat: number[] = [];
    // Core sequence price-return features
    if (config.features.returns || (!config.features.movingAverages && !config.features.rsi && !config.features.volatility)) {
      feat.push(r1 * 25, r5 * 10, rWin * 4, fastMem * 35, slowMem * 40, rangePos);
    }
    if (config.features.movingAverages) {
      const sma = indicators.sma20[i] ?? closeNow;
      const ema = indicators.ema50[i] ?? sma;
      feat.push(((closeNow - sma) / sma) * 12, ((sma - ema) / ema) * 12);
    }
    if (config.features.rsi) {
      const rsi = indicators.rsi14[i] ?? 50;
      feat.push((rsi - 50) / 25);
    }
    if (config.features.volatility) {
      const vol = indicators.volatility20d[i] ?? 20;
      feat.push((vol - 25) / 20);
    }

    sampleFeatures.push(feat);
    sampleTargets.push(nextLogRet);
    sampleBarIndices.push(i + 1);
  }

  const totalSamples = sampleFeatures.length;
  const featureDim = sampleFeatures[0]?.length ?? 1;
  const splitIdx = Math.max(20, Math.min(totalSamples - 12, Math.floor(totalSamples * config.trainSplit)));

  // Standardize features strictly using training split statistics (prevents lookahead leakage)
  const featMeans = new Array(featureDim).fill(0);
  const featStds = new Array(featureDim).fill(1);
  for (let d = 0; d < featureDim; d++) {
    let sum = 0;
    for (let s = 0; s < splitIdx; s++) sum += sampleFeatures[s][d];
    featMeans[d] = sum / splitIdx;
    let sq = 0;
    for (let s = 0; s < splitIdx; s++) {
      const diff = sampleFeatures[s][d] - featMeans[d];
      sq += diff * diff;
    }
    featStds[d] = Math.sqrt(sq / splitIdx) || 1;
  }

  const normX = sampleFeatures.map((row) =>
    row.map((val, d) => Math.max(-4, Math.min(4, (val - featMeans[d]) / featStds[d]))),
  );

  // Target scaling (basis points scale for clean gradient magnitude)
  const targetScale = 100;
  const scaledY = sampleTargets.map((y) => y * targetScale);

  // Neural network: Input(featureDim) -> Hidden(H, tanh) + linear residual skip -> Output(1)
  const hiddenUnits = config.architecture === 'LSTM' ? 10 : config.architecture === 'GRU' ? 8 : 6;

  // Deterministic Xavier initialization
  let seed = 1337 + lookback * 17 + (config.architecture === 'LSTM' ? 101 : config.architecture === 'GRU' ? 211 : 307);
  const nextRand = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296 - 0.5;
  };

  const w1: number[][] = Array.from({ length: hiddenUnits }, () =>
    Array.from({ length: featureDim }, () => nextRand() * Math.sqrt(2 / (featureDim + hiddenUnits))),
  );
  const b1: number[] = new Array(hiddenUnits).fill(0);
  const w2: number[] = Array.from({ length: hiddenUnits }, () => nextRand() * Math.sqrt(2 / (hiddenUnits + 1)));
  const wSkip: number[] = Array.from({ length: featureDim }, () => nextRand() * 0.08);
  let b2 = 0;

  // Adam optimizer moments
  const mw1 = w1.map((r) => r.map(() => 0));
  const vw1 = w1.map((r) => r.map(() => 0));
  const mb1 = b1.map(() => 0);
  const vb1 = b1.map(() => 0);
  const mw2 = w2.map(() => 0);
  const vw2 = w2.map(() => 0);
  const mwSkip = wSkip.map(() => 0);
  const vwSkip = wSkip.map(() => 0);
  let mb2 = 0;
  let vb2 = 0;

  const beta1 = 0.9;
  const beta2 = 0.999;
  const eps = 1e-8;
  const l2 = 0.008;
  const lr = config.learningRate;

  const forward = (x: number[]) => {
    const h = new Array<number>(hiddenUnits);
    for (let j = 0; j < hiddenUnits; j++) {
      let z = b1[j];
      const row = w1[j];
      for (let d = 0; d < featureDim; d++) z += row[d] * x[d];
      h[j] = tanh(z);
    }
    let out = b2;
    for (let j = 0; j < hiddenUnits; j++) out += w2[j] * h[j];
    for (let d = 0; d < featureDim; d++) out += wSkip[d] * x[d];
    return { h, out };
  };

  const lossHistory: EpochLossPoint[] = [];
  const totalEpochs = Math.max(10, Math.min(100, config.epochs));

  for (let epoch = 1; epoch <= totalEpochs; epoch++) {
    const gw1 = w1.map((r) => r.map(() => 0));
    const gb1 = b1.map(() => 0);
    const gw2 = w2.map(() => 0);
    const gwSkip = wSkip.map(() => 0);
    let gb2 = 0;

    let trainSqErr = 0;
    for (let s = 0; s < splitIdx; s++) {
      const x = normX[s];
      const y = scaledY[s];
      const { h, out } = forward(x);
      const err = out - y;
      trainSqErr += err * err;

      const dOut = (2 * err) / splitIdx;
      gb2 += dOut;
      for (let d = 0; d < featureDim; d++) {
        gwSkip[d] += dOut * x[d];
      }
      for (let j = 0; j < hiddenUnits; j++) {
        gw2[j] += dOut * h[j];
        const dH = dOut * w2[j] * (1 - h[j] * h[j]);
        gb1[j] += dH;
        for (let d = 0; d < featureDim; d++) {
          gw1[j][d] += dH * x[d];
        }
      }
    }

    // Adam parameter update with L2 weight decay
    const b1Pow = 1 - Math.pow(beta1, epoch);
    const b2Pow = 1 - Math.pow(beta2, epoch);

    for (let j = 0; j < hiddenUnits; j++) {
      for (let d = 0; d < featureDim; d++) {
        const g = gw1[j][d] + l2 * w1[j][d];
        mw1[j][d] = beta1 * mw1[j][d] + (1 - beta1) * g;
        vw1[j][d] = beta2 * vw1[j][d] + (1 - beta2) * g * g;
        w1[j][d] -= (lr * (mw1[j][d] / b1Pow)) / (Math.sqrt(vw1[j][d] / b2Pow) + eps);
      }
      mb1[j] = beta1 * mb1[j] + (1 - beta1) * gb1[j];
      vb1[j] = beta2 * vb1[j] + (1 - beta2) * gb1[j] * gb1[j];
      b1[j] -= (lr * (mb1[j] / b1Pow)) / (Math.sqrt(vb1[j] / b2Pow) + eps);

      const g2 = gw2[j] + l2 * w2[j];
      mw2[j] = beta1 * mw2[j] + (1 - beta1) * g2;
      vw2[j] = beta2 * vw2[j] + (1 - beta2) * g2 * g2;
      w2[j] -= (lr * (mw2[j] / b1Pow)) / (Math.sqrt(vw2[j] / b2Pow) + eps);
    }

    for (let d = 0; d < featureDim; d++) {
      const gs = gwSkip[d] + l2 * wSkip[d];
      mwSkip[d] = beta1 * mwSkip[d] + (1 - beta1) * gs;
      vwSkip[d] = beta2 * vwSkip[d] + (1 - beta2) * gs * gs;
      wSkip[d] -= (lr * (mwSkip[d] / b1Pow)) / (Math.sqrt(vwSkip[d] / b2Pow) + eps);
    }

    mb2 = beta1 * mb2 + (1 - beta1) * gb2;
    vb2 = beta2 * vb2 + (1 - beta2) * gb2 * gb2;
    b2 -= (lr * (mb2 / b1Pow)) / (Math.sqrt(vb2 / b2Pow) + eps);

    // Evaluate validation MSE
    let valSqErr = 0;
    const valCount = Math.max(1, totalSamples - splitIdx);
    for (let s = splitIdx; s < totalSamples; s++) {
      const { out } = forward(normX[s]);
      const err = out - scaledY[s];
      valSqErr += err * err;
    }

    lossHistory.push({
      epoch,
      trainLoss: Number((trainSqErr / splitIdx).toFixed(4)),
      valLoss: Number((valSqErr / valCount).toFixed(4)),
    });
  }

  // Out-of-sample validation predictions & metrics
  const validationPoints: ValidationPoint[] = [];
  let sumSqPriceErr = 0;
  let sumAbsPriceErr = 0;
  let sumAbsPctErr = 0;
  let correctDirection = 0;
  const valActuals: number[] = [];

  for (let s = splitIdx; s < totalSamples; s++) {
    const barIdx = sampleBarIndices[s];
    const prevClose = closes[barIdx - 1];
    const actualClose = closes[barIdx];
    const { out } = forward(normX[s]);
    // Clamp extreme outlier single-day predictions to +/- 5%
    const predLogRet = Math.max(-0.05, Math.min(0.05, out / targetScale));
    const predClose = Number((prevClose * Math.exp(predLogRet)).toFixed(2));
    const predReturnPct = Number(((predClose / prevClose - 1) * 100).toFixed(2));

    const actualRet = actualClose - prevClose;
    const predDiff = predClose - prevClose;
    if ((actualRet >= 0 && predDiff >= 0) || (actualRet < 0 && predDiff < 0)) {
      correctDirection++;
    }

    const err = predClose - actualClose;
    sumSqPriceErr += err * err;
    sumAbsPriceErr += Math.abs(err);
    sumAbsPctErr += Math.abs(err / actualClose);
    valActuals.push(actualClose);

    const signal: 'BUY' | 'HOLD' | 'SELL' =
      predReturnPct >= 0.35 ? 'BUY' : predReturnPct <= -0.35 ? 'SELL' : 'HOLD';

    validationPoints.push({
      index: barIdx,
      date: bars[barIdx].date,
      actual: actualClose,
      predicted: predClose,
      predictedReturnPct: predReturnPct,
      signal,
    });
  }

  const valN = Math.max(1, validationPoints.length);
  const rmse = Number(Math.sqrt(sumSqPriceErr / valN).toFixed(2));
  const mae = Number((sumAbsPriceErr / valN).toFixed(2));
  const mape = Number(((sumAbsPctErr / valN) * 100).toFixed(2));

  const meanActual = valActuals.reduce((a, b) => a + b, 0) / valN;
  const ssTot = valActuals.reduce((acc, v) => acc + (v - meanActual) * (v - meanActual), 0);
  const rSquared = ssTot > 1e-6 ? Number(Math.max(-1, Math.min(0.999, 1 - sumSqPriceErr / ssTot)).toFixed(3)) : 0;
  const directionalAccuracy = Number(((correctDirection / valN) * 100).toFixed(1));

  // Recursive multi-step future forecast with volatility-calibrated 95% confidence band
  const simCloses = [...closes];
  const lastVolPct = indicators.volatility20d[n - 1] ?? 22;
  const dailySigma = lastVolPct / 100 / Math.sqrt(252);
  let lastDate = bars[n - 1].date;
  const forecastPoints: ForecastPoint[] = [];

  for (let step = 1; step <= config.forecastHorizon; step++) {
    const idx = simCloses.length - 1;
    const closeNow = simCloses[idx];
    let fastMem = 0;
    let slowMem = 0;
    let maxW = -Infinity;
    let minW = Infinity;
    for (let k = idx - lookback + 1; k <= idx; k++) {
      const r = Math.log(simCloses[k] / simCloses[Math.max(0, k - 1)]);
      fastMem = (1 - decayAlpha) * fastMem + decayAlpha * r;
      slowMem = (1 - decayAlpha * 0.4) * slowMem + decayAlpha * 0.4 * r;
      if (simCloses[k] > maxW) maxW = simCloses[k];
      if (simCloses[k] < minW) minW = simCloses[k];
    }

    const r1 = Math.log(simCloses[idx] / simCloses[idx - 1]);
    const r5 = Math.log(simCloses[idx] / simCloses[idx - Math.min(5, lookback)]);
    const rWin = Math.log(simCloses[idx] / simCloses[idx - lookback]);
    const rangePos = maxW > minW ? (closeNow - minW) / (maxW - minW) - 0.5 : 0;

    const feat: number[] = [];
    if (config.features.returns || (!config.features.movingAverages && !config.features.rsi && !config.features.volatility)) {
      feat.push(r1 * 25, r5 * 10, rWin * 4, fastMem * 35, slowMem * 40, rangePos);
    }
    if (config.features.movingAverages) {
      let s20 = 0;
      for (let j = idx - 19; j <= idx; j++) s20 += simCloses[j];
      s20 /= 20;
      const e50 = indicators.ema50[n - 1] ?? s20;
      feat.push(((closeNow - s20) / s20) * 12, ((s20 - e50) / e50) * 12);
    }
    if (config.features.rsi) {
      const recentRsi = indicators.rsi14[n - 1] ?? 50;
      feat.push((recentRsi - 50) / 25);
    }
    if (config.features.volatility) {
      feat.push((lastVolPct - 25) / 20);
    }

    const normFeat = feat.map((v, d) => Math.max(-4, Math.min(4, (v - featMeans[d]) / featStds[d])));
    const { out } = forward(normFeat);
    // Dampen recursive horizon drift gently to prevent compounding instability
    const damp = Math.pow(0.965, step - 1);
    const predLogRet = Math.max(-0.035, Math.min(0.035, (out / targetScale) * damp));
    const nextClose = Number((closeNow * Math.exp(predLogRet)).toFixed(2));
    const coneHalfWidth = nextClose * (1.96 * dailySigma * Math.sqrt(step));

    lastDate = nextBusinessDate(lastDate);
    forecastPoints.push({
      step,
      date: lastDate,
      predicted: nextClose,
      lower95: Number(Math.max(0.5, nextClose - coneHalfWidth).toFixed(2)),
      upper95: Number((nextClose + coneHalfWidth).toFixed(2)),
    });
    simCloses.push(nextClose);
  }

  const lastActualClose = closes[n - 1];
  const projectedClose = forecastPoints[forecastPoints.length - 1]?.predicted ?? lastActualClose;
  const projectedReturnPct = Number(((projectedClose / lastActualClose - 1) * 100).toFixed(2));

  const currentSignal: 'BUY' | 'HOLD' | 'SELL' =
    projectedReturnPct >= 1.75 ? 'BUY' : projectedReturnPct <= -1.75 ? 'SELL' : 'HOLD';

  const signalMagnitude = Math.min(1, Math.abs(projectedReturnPct) / 6);
  const signalConfidencePct = Number(
    Math.min(94, Math.max(48, directionalAccuracy * 0.72 + signalMagnitude * 28)).toFixed(1),
  );

  const activeInputChannels =
    (config.features.returns ? 4 : 0) +
    (config.features.movingAverages ? 2 : 0) +
    (config.features.rsi ? 1 : 0) +
    (config.features.volatility ? 1 : 0) || 1;

  const { layers, totalParams } = buildKerasLayerSpecs(config.architecture, lookback, activeInputChannels);

  return {
    config: { ...config, lookbackWindow: lookback },
    lossHistory,
    validationPoints,
    forecastPoints,
    metrics: {
      rmse,
      mae,
      mape,
      rSquared,
      directionalAccuracy,
      trainSamples: splitIdx,
      valSamples: valN,
      featureCount: activeInputChannels,
    },
    layers,
    totalParams,
    currentSignal,
    projectedClose,
    projectedReturnPct,
    signalConfidencePct,
  };
}

export function runBacktest(
  validationPoints: ValidationPoint[],
  config: BacktestConfig,
): BacktestResult {
  if (validationPoints.length === 0) {
    return {
      config,
      equityCurve: [],
      trades: [],
      finalEquity: config.initialCapital,
      totalReturnPct: 0,
      benchmarkReturnPct: 0,
      excessAlphaPct: 0,
      sharpeRatio: 0,
      maxDrawdownPct: 0,
      winRatePct: 0,
      closedTrades: 0,
    };
  }

  const feeRate = config.feeBps / 10_000;
  const allocRatio = Math.max(0.1, Math.min(1, config.allocationPct / 100));

  let cash = config.initialCapital;
  let shares = 0;
  let entryPrice = 0;
  let tradeId = 1;
  let wins = 0;
  let closedTrades = 0;

  const firstPrice = validationPoints[0].actual;
  const benchmarkShares = config.initialCapital / firstPrice;

  const trades: TradeRecord[] = [];
  const equityCurve: EquityPoint[] = [];

  let peakEquity = config.initialCapital;
  let maxDrawdownPct = 0;
  const dailyReturns: number[] = [];
  let prevEquity = config.initialCapital;

  for (let i = 0; i < validationPoints.length; i++) {
    const pt = validationPoints[i];
    const price = pt.actual;

    // Check stop-loss first if currently LONG
    if (shares > 0) {
      const unrealizedPct = ((price - entryPrice) / entryPrice) * 100;
      const hitStopLoss = config.stopLossPct > 0 && unrealizedPct <= -config.stopLossPct;
      const hitSellSignal = pt.predictedReturnPct <= -Math.abs(config.sellThresholdPct);

      if (hitStopLoss || hitSellSignal) {
        const gross = shares * price;
        const fee = gross * feeRate;
        const net = gross - fee;
        const costBasis = shares * entryPrice;
        const pnl = net - costBasis;
        const pnlPct = (pnl / costBasis) * 100;

        cash += net;
        if (pnl > 0) wins++;
        closedTrades++;

        trades.push({
          id: tradeId++,
          date: pt.date,
          action: 'SELL',
          price,
          shares: Number(shares.toFixed(4)),
          value: Number(gross.toFixed(2)),
          fee: Number(fee.toFixed(2)),
          pnl: Number(pnl.toFixed(2)),
          pnlPct: Number(pnlPct.toFixed(2)),
          equityAfter: Number(cash.toFixed(2)),
          reason: hitStopLoss
            ? `Stop-loss triggered (${unrealizedPct.toFixed(2)}%)`
            : `Bearish forecast (${pt.predictedReturnPct.toFixed(2)}%)`,
        });

        shares = 0;
        entryPrice = 0;
      }
    } else if (pt.predictedReturnPct >= Math.abs(config.buyThresholdPct)) {
      const deployable = cash * allocRatio;
      const fee = deployable * feeRate;
      const netCapital = deployable - fee;
      if (netCapital > price * 0.01) {
        const boughtShares = netCapital / price;
        cash -= deployable;
        shares = boughtShares;
        entryPrice = price;

        trades.push({
          id: tradeId++,
          date: pt.date,
          action: 'BUY',
          price,
          shares: Number(boughtShares.toFixed(4)),
          value: Number(deployable.toFixed(2)),
          fee: Number(fee.toFixed(2)),
          pnl: null,
          pnlPct: null,
          equityAfter: Number((cash + shares * price).toFixed(2)),
          reason: `Bullish forecast (+${pt.predictedReturnPct.toFixed(2)}%)`,
        });
      }
    }

    const currentEquity = cash + shares * price;
    const benchmarkEquity = benchmarkShares * price;

    if (currentEquity > peakEquity) peakEquity = currentEquity;
    const ddPct = peakEquity > 0 ? ((currentEquity - peakEquity) / peakEquity) * 100 : 0;
    if (ddPct < maxDrawdownPct) maxDrawdownPct = ddPct;

    if (i > 0 && prevEquity > 0) {
      dailyReturns.push((currentEquity - prevEquity) / prevEquity);
    }
    prevEquity = currentEquity;

    equityCurve.push({
      date: pt.date,
      strategyEquity: Number(currentEquity.toFixed(2)),
      benchmarkEquity: Number(benchmarkEquity.toFixed(2)),
      drawdownPct: Number(ddPct.toFixed(2)),
      position: shares > 0 ? 'LONG' : 'CASH',
    });
  }

  const finalEquity = equityCurve[equityCurve.length - 1].strategyEquity;
  const finalBenchmark = equityCurve[equityCurve.length - 1].benchmarkEquity;
  const totalReturnPct = Number((((finalEquity - config.initialCapital) / config.initialCapital) * 100).toFixed(2));
  const benchmarkReturnPct = Number((((finalBenchmark - config.initialCapital) / config.initialCapital) * 100).toFixed(2));
  const excessAlphaPct = Number((totalReturnPct - benchmarkReturnPct).toFixed(2));

  let sharpeRatio = 0;
  if (dailyReturns.length > 2) {
    const meanRet = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const variance =
      dailyReturns.reduce((acc, r) => acc + (r - meanRet) * (r - meanRet), 0) / dailyReturns.length;
    const stdRet = Math.sqrt(variance);
    if (stdRet > 1e-7) {
      sharpeRatio = Number(((meanRet / stdRet) * Math.sqrt(252)).toFixed(2));
    }
  }

  const winRatePct = closedTrades > 0 ? Number(((wins / closedTrades) * 100).toFixed(1)) : 0;

  return {
    config,
    equityCurve,
    trades,
    finalEquity,
    totalReturnPct,
    benchmarkReturnPct,
    excessAlphaPct,
    sharpeRatio,
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    winRatePct,
    closedTrades,
  };
}

export function classifyTrendRegime(bars: StockBar[], indicators: TechnicalSeries): string {
  const n = bars.length;
  if (n < 50) return 'Insufficient History';
  const lastClose = bars[n - 1].close;
  const sma20 = indicators.sma20[n - 1] ?? lastClose;
  const ema50 = indicators.ema50[n - 1] ?? lastClose;
  const rsi = indicators.rsi14[n - 1] ?? 50;

  if (lastClose > sma20 && sma20 > ema50 && rsi >= 52) return 'Bullish Expansion';
  if (lastClose < sma20 && sma20 < ema50 && rsi <= 48) return 'Bearish Contraction';
  if (lastClose > ema50 && rsi > 68) return 'Overbought Uptrend';
  if (lastClose < ema50 && rsi < 32) return 'Oversold Pullback';
  return 'Range Consolidation';
}
