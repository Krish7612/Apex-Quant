import type { StockAsset, StockBar } from './types';

function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function normalSample(rng: () => number): number {
  const u1 = Math.max(1e-7, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function generateTradingDates(count: number, endDateIso: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${endDateIso}T00:00:00Z`);
  while (dates.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return dates.reverse();
}

interface SyntheticProfile {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  seed: number;
  startPrice: number;
  baseDrift: number;
  baseVol: number;
  avgVolume: number;
  regimes: { length: number; driftShift: number; volMult: number }[];
}

function buildSyntheticBars(profile: SyntheticProfile, totalDays = 260): StockBar[] {
  const rng = createRng(profile.seed);
  const dates = generateTradingDates(totalDays, '2026-11-19');
  const bars: StockBar[] = [];

  let price = profile.startPrice;
  let volState = profile.baseVol;
  let momentum = 0;

  for (let i = 0; i < totalDays; i++) {
    let regimeDrift = 0;
    let regimeVol = 1;
    let offset = 0;
    for (const r of profile.regimes) {
      if (i >= offset && i < offset + r.length) {
        regimeDrift = r.driftShift;
        regimeVol = r.volMult;
        break;
      }
      offset += r.length;
    }

    const shock = normalSample(rng);
    // Subtle volatility clustering (GARCH-like) + cyclical mean reversion
    volState = 0.86 * volState + 0.14 * (profile.baseVol * regimeVol * (0.75 + Math.abs(shock) * 0.55));
    const seasonalCycle = Math.sin((i / 28) * Math.PI) * 0.0012;
    const dailyReturn = profile.baseDrift + regimeDrift + seasonalCycle + momentum * 0.12 + shock * volState;
    momentum = 0.65 * momentum + 0.35 * dailyReturn;

    const openGap = normalSample(rng) * volState * 0.25;
    const open = Math.max(1, price * (1 + openGap));
    const close = Math.max(1, price * Math.exp(dailyReturn));
    const intradaySpan = Math.abs(normalSample(rng)) * volState * 0.65 + Math.abs(close - open) / open * 0.35;
    const high = Math.max(open, close) * (1 + intradaySpan * 0.55);
    const low = Math.max(0.5, Math.min(open, close) * (1 - intradaySpan * 0.5));
    const volMultiplier = 0.72 + Math.abs(dailyReturn) / Math.max(0.005, profile.baseVol) * 0.45 + rng() * 0.35;
    const volume = Math.round(profile.avgVolume * volMultiplier);

    bars.push({
      date: dates[i],
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    });

    price = close;
  }

  return bars;
}

const ASSET_PROFILES: SyntheticProfile[] = [
  {
    ticker: 'NVDA',
    name: 'NVIDIA Corporation',
    exchange: 'NASDAQ',
    sector: 'Semiconductors',
    seed: 104729,
    startPrice: 108.4,
    baseDrift: 0.0011,
    baseVol: 0.022,
    avgVolume: 46_200_000,
    regimes: [
      { length: 65, driftShift: 0.0021, volMult: 1.05 },
      { length: 55, driftShift: -0.0014, volMult: 1.3 },
      { length: 75, driftShift: 0.0019, volMult: 0.95 },
      { length: 65, driftShift: 0.0016, volMult: 1.0 },
    ],
  },
  {
    ticker: 'AAPL',
    name: 'Apple Inc.',
    exchange: 'NASDAQ',
    sector: 'Consumer Hardware',
    seed: 22913,
    startPrice: 196.2,
    baseDrift: 0.0006,
    baseVol: 0.013,
    avgVolume: 51_400_000,
    regimes: [
      { length: 70, driftShift: 0.0009, volMult: 0.9 },
      { length: 60, driftShift: -0.0005, volMult: 1.15 },
      { length: 70, driftShift: 0.0011, volMult: 0.85 },
      { length: 60, driftShift: 0.0007, volMult: 0.95 },
    ],
  },
  {
    ticker: 'MSFT',
    name: 'Microsoft Corporation',
    exchange: 'NASDAQ',
    sector: 'Enterprise Software',
    seed: 39181,
    startPrice: 392.5,
    baseDrift: 0.0007,
    baseVol: 0.014,
    avgVolume: 23_800_000,
    regimes: [
      { length: 80, driftShift: 0.0012, volMult: 0.92 },
      { length: 50, driftShift: -0.0011, volMult: 1.2 },
      { length: 70, driftShift: 0.0008, volMult: 0.9 },
      { length: 60, driftShift: 0.0013, volMult: 0.88 },
    ],
  },
  {
    ticker: 'TSLA',
    name: 'Tesla, Inc.',
    exchange: 'NASDAQ',
    sector: 'Automotive & Energy',
    seed: 51977,
    startPrice: 248.0,
    baseDrift: 0.0004,
    baseVol: 0.031,
    avgVolume: 82_500_000,
    regimes: [
      { length: 60, driftShift: -0.0022, volMult: 1.25 },
      { length: 70, driftShift: 0.0031, volMult: 1.35 },
      { length: 65, driftShift: -0.0018, volMult: 1.15 },
      { length: 65, driftShift: -0.0015, volMult: 1.2 },
    ],
  },
  {
    ticker: 'AMZN',
    name: 'Amazon.com, Inc.',
    exchange: 'NASDAQ',
    sector: 'Cloud & Commerce',
    seed: 78123,
    startPrice: 174.8,
    baseDrift: 0.0008,
    baseVol: 0.017,
    avgVolume: 38_900_000,
    regimes: [
      { length: 65, driftShift: 0.0014, volMult: 1.0 },
      { length: 65, driftShift: 0.0001, volMult: 1.1 },
      { length: 65, driftShift: 0.0012, volMult: 0.92 },
      { length: 65, driftShift: 0.0009, volMult: 0.95 },
    ],
  },
  {
    ticker: 'SPY',
    name: 'SPDR S&P 500 ETF Trust',
    exchange: 'NYSE Arca',
    sector: 'Broad Market Index',
    seed: 91243,
    startPrice: 518.0,
    baseDrift: 0.00045,
    baseVol: 0.0085,
    avgVolume: 64_100_000,
    regimes: [
      { length: 75, driftShift: 0.0006, volMult: 0.85 },
      { length: 50, driftShift: -0.0008, volMult: 1.25 },
      { length: 70, driftShift: 0.0007, volMult: 0.9 },
      { length: 65, driftShift: 0.0005, volMult: 0.88 },
    ],
  },
];

export function getDefaultAssets(): StockAsset[] {
  return ASSET_PROFILES.map((profile) => ({
    ticker: profile.ticker,
    name: profile.name,
    exchange: profile.exchange,
    sector: profile.sector,
    bars: buildSyntheticBars(profile, 260),
  }));
}

export interface CsvParseResult {
  ok: true;
  bars: StockBar[];
}

export interface CsvParseError {
  ok: false;
  error: string;
}

export function parseStockCsv(rawText: string): CsvParseResult | CsvParseError {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { ok: false, error: 'CSV content is empty. Provide a header row and at least 80 daily rows.' };
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 81) {
    return {
      ok: false,
      error: `Found ${Math.max(0, lines.length - 1)} data rows. At least 80 daily observations are required for lookback windowing and train/test splitting.`,
    };
  }

  const headerCols = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const dateIdx = headerCols.findIndex((h) => h === 'date' || h === 'timestamp');
  const openIdx = headerCols.findIndex((h) => h === 'open');
  const highIdx = headerCols.findIndex((h) => h === 'high');
  const lowIdx = headerCols.findIndex((h) => h === 'low');
  const closeIdx = headerCols.findIndex((h) => h === 'close' || h === 'adj close');
  const volIdx = headerCols.findIndex((h) => h === 'volume');

  if (dateIdx === -1 || closeIdx === -1) {
    return {
      ok: false,
      error: 'CSV header must include at least "Date" and "Close" columns (recommended: Date,Open,High,Low,Close,Volume).',
    };
  }

  const bars: StockBar[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    const dateVal = cols[dateIdx];
    const closeVal = Number(cols[closeIdx]);

    if (!dateVal || !/^\d{4}-\d{2}-\d{2}/.test(dateVal)) {
      return {
        ok: false,
        error: `Row ${i + 1}: Invalid date "${dateVal ?? ''}". Expected YYYY-MM-DD format.`,
      };
    }

    if (!Number.isFinite(closeVal) || closeVal <= 0) {
      return {
        ok: false,
        error: `Row ${i + 1}: Close price must be a positive number.`,
      };
    }

    const openVal = openIdx !== -1 && Number.isFinite(Number(cols[openIdx])) ? Number(cols[openIdx]) : closeVal;
    const rawHigh = highIdx !== -1 && Number.isFinite(Number(cols[highIdx])) ? Number(cols[highIdx]) : Math.max(openVal, closeVal);
    const rawLow = lowIdx !== -1 && Number.isFinite(Number(cols[lowIdx])) ? Number(cols[lowIdx]) : Math.min(openVal, closeVal);
    const volVal = volIdx !== -1 && Number.isFinite(Number(cols[volIdx])) ? Math.max(0, Math.round(Number(cols[volIdx]))) : 1_000_000;

    bars.push({
      date: dateVal.slice(0, 10),
      open: Number(openVal.toFixed(2)),
      high: Number(Math.max(rawHigh, openVal, closeVal).toFixed(2)),
      low: Number(Math.min(rawLow, openVal, closeVal).toFixed(2)),
      close: Number(closeVal.toFixed(2)),
      volume: volVal,
    });
  }

  bars.sort((a, b) => a.date.localeCompare(b.date));
  return { ok: true, bars };
}

export function formatBarsToCsv(bars: StockBar[]): string {
  const header = 'Date,Open,High,Low,Close,Volume';
  const rows = bars.map(
    (b) => `${b.date},${b.open.toFixed(2)},${b.high.toFixed(2)},${b.low.toFixed(2)},${b.close.toFixed(2)},${b.volume}`,
  );
  return [header, ...rows].join('\n');
}
