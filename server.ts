import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

interface AnalyzeRequestBody {
  ticker: string;
  companyName: string;
  sector: string;
  lastClose: number;
  dailyChangePct: number;
  forecastHorizon: number;
  projectedClose: number;
  projectedReturnPct: number;
  signal: 'BUY' | 'HOLD' | 'SELL';
  architecture: string;
  lookbackWindow: number;
  rmse: number;
  mape: number;
  directionalAccuracy: number;
  rsi14: number;
  macdHistogram: number;
  volatility20d: number;
  trendRegime: string;
  backtestReturnPct: number;
  benchmarkReturnPct: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
}

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/analyze', async (req, res) => {
    const body = req.body as Partial<AnalyzeRequestBody>;

    if (!body || typeof body.ticker !== 'string' || typeof body.lastClose !== 'number') {
      res.status(400).json({ error: 'Missing required ticker or model summary fields.' });
      return;
    }

    try {
      const ai = createGeminiClient();
      const prompt = [
        `Prepare an institutional quantitative research briefing for ${body.ticker} (${body.companyName ?? body.ticker}, Sector: ${body.sector ?? 'Equities'}).`,
        `Current market snapshot: Last Close $${body.lastClose.toFixed(2)}, 1D Change ${(body.dailyChangePct ?? 0).toFixed(2)}%, Trend Regime: ${body.trendRegime ?? 'Neutral'}.`,
        `Neural Forecast (${body.architecture ?? 'LSTM'}, ${body.lookbackWindow ?? 20}-day lookback, ${body.forecastHorizon ?? 14}-day horizon):`,
        `- Projected Target: $${(body.projectedClose ?? body.lastClose).toFixed(2)} (${(body.projectedReturnPct ?? 0).toFixed(2)}%)`,
        `- Algorithmic Signal: ${body.signal ?? 'HOLD'}`,
        `- Out-of-sample RMSE: $${(body.rmse ?? 0).toFixed(2)}, MAPE: ${(body.mape ?? 0).toFixed(2)}%, Directional Accuracy: ${(body.directionalAccuracy ?? 50).toFixed(1)}%`,
        `Technical Indicators: RSI(14) = ${(body.rsi14 ?? 50).toFixed(1)}, MACD Histogram = ${(body.macdHistogram ?? 0).toFixed(3)}, 20D Annualized Volatility = ${(body.volatility20d ?? 0).toFixed(1)}%.`,
        `Walk-forward Strategy Backtest: Strategy Return ${(body.backtestReturnPct ?? 0).toFixed(2)}% vs Buy-and-Hold ${(body.benchmarkReturnPct ?? 0).toFixed(2)}%, Sharpe Ratio ${(body.sharpeRatio ?? 0).toFixed(2)}, Max Drawdown ${(body.maxDrawdownPct ?? 0).toFixed(2)}%.`,
        `Be concise, objective, and grounded strictly in the provided quantitative figures. Include educational risk caveats appropriate for an algorithmic trading model.`,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are a senior quantitative researcher at Apex Quant Solutions. Write disciplined, concise institutional research commentary without hype or financial advice guarantees. Keep every field crisp and concrete.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: {
                type: Type.STRING,
                description: 'One concise sentence summarizing the model stance and risk-reward profile.',
              },
              executiveSummary: {
                type: Type.STRING,
                description: 'Two to three sentences synthesizing forecast trajectory, indicator confirmation, and out-of-sample error.',
              },
              keyDrivers: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Three concise quantitative observations supporting the current signal.',
              },
              riskFactors: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Two to three concrete model or market risks (volatility, overfitting, drawdown, regime shift).',
              },
              executionGuidance: {
                type: Type.STRING,
                description: 'One concise sentence on position sizing, stop-loss discipline, or threshold confirmation.',
              },
            },
            required: ['headline', 'executiveSummary', 'keyDrivers', 'riskFactors', 'executionGuidance'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'Model returned an empty analysis payload.' });
        return;
      }

      const parsed = JSON.parse(rawText);
      res.json({ briefing: parsed });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to generate AI quantitative briefing.';
      const status = message.includes('GEMINI_API_KEY') ? 503 : 500;
      res.status(status).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Apex Quant server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Apex Quant server:', err);
  process.exit(1);
});
