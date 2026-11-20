import type { BacktestConfig, ModelConfig } from './types';

export function generatePythonPipeline(
  ticker: string,
  modelConfig: ModelConfig,
  backtestConfig: BacktestConfig,
): string {
  const selectedFeatures: string[] = ['Close'];
  if (modelConfig.features.returns) selectedFeatures.push('Log_Return');
  if (modelConfig.features.movingAverages) selectedFeatures.push('SMA_20', 'EMA_50');
  if (modelConfig.features.rsi) selectedFeatures.push('RSI_14');
  if (modelConfig.features.volatility) selectedFeatures.push('Volatility_20D');

  const modelLayersBlock =
    modelConfig.architecture === 'LSTM'
      ? `    model = Sequential([
        LSTM(64, return_sequences=True, input_shape=(lookback, n_features)),
        Dropout(0.20),
        LSTM(32, return_sequences=False),
        Dense(16, activation="relu"),
        Dense(1),
    ])`
      : modelConfig.architecture === 'GRU'
        ? `    model = Sequential([
        GRU(48, return_sequences=True, input_shape=(lookback, n_features)),
        Dropout(0.15),
        GRU(24, return_sequences=False),
        Dense(12, activation="relu"),
        Dense(1),
    ])`
        : `    model = Sequential([
        Flatten(input_shape=(lookback, n_features)),
        Dense(64, activation="relu"),
        Dropout(0.20),
        Dense(32, activation="relu"),
        Dense(1),
    ])`;

  const kerasLayerImports =
    modelConfig.architecture === 'LSTM'
      ? 'LSTM, Dense, Dropout'
      : modelConfig.architecture === 'GRU'
        ? 'GRU, Dense, Dropout'
        : 'Flatten, Dense, Dropout';

  return `"""
Apex Quant Solutions — AI-Powered Stock Trend Predictor
Synced Pipeline: ${ticker} | Architecture: ${modelConfig.architecture} | Lookback: ${modelConfig.lookbackWindow}d | Horizon: ${modelConfig.forecastHorizon}d
Stack: Python, NumPy, Pandas, Matplotlib, TensorFlow / Keras
"""

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_squared_error, mean_absolute_error
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import ${kerasLayerImports}
from tensorflow.keras.optimizers import Adam

# 1. Configuration (Synced with Workbench)
TICKER = "${ticker}"
CSV_PATH = f"{TICKER.lower()}_historical.csv"
LOOKBACK = ${modelConfig.lookbackWindow}
HORIZON = ${modelConfig.forecastHorizon}
TRAIN_SPLIT = ${modelConfig.trainSplit}
EPOCHS = ${modelConfig.epochs}
LEARNING_RATE = ${modelConfig.learningRate}
BUY_THRESHOLD_PCT = ${backtestConfig.buyThresholdPct}
SELL_THRESHOLD_PCT = ${backtestConfig.sellThresholdPct}
STOP_LOSS_PCT = ${backtestConfig.stopLossPct}
INITIAL_CAPITAL = ${backtestConfig.initialCapital}


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values("Date").copy()
    df["Log_Return"] = np.log(df["Close"] / df["Close"].shift(1))
    df["SMA_20"] = df["Close"].rolling(20).mean()
    df["EMA_50"] = df["Close"].ewm(span=50, adjust=False).mean()

    delta = df["Close"].diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / loss.replace(0, np.nan)
    df["RSI_14"] = 100.0 - (100.0 / (1.0 + rs))
    df["Volatility_20D"] = df["Log_Return"].rolling(20).std() * np.sqrt(252) * 100.0
    return df.dropna().reset_index(drop=True)


def create_windows(scaled_data: np.ndarray, lookback: int):
    X, y = [], []
    for i in range(lookback, len(scaled_data)):
        X.append(scaled_data[i - lookback : i])
        y.append(scaled_data[i, 0])  # Predict next-day scaled Close
    return np.array(X), np.array(y)


def build_model(lookback: int, n_features: int) -> Sequential:
${modelLayersBlock}
    model.compile(optimizer=Adam(learning_rate=LEARNING_RATE), loss="mse")
    return model


def run_strategy_backtest(dates, actual_prices, predicted_prices):
    cash = float(INITIAL_CAPITAL)
    shares = 0.0
    entry_price = 0.0
    equity_curve = []

    for i in range(1, len(actual_prices)):
        prev_price = actual_prices[i - 1]
        price = actual_prices[i]
        pred_ret_pct = ((predicted_prices[i] / prev_price) - 1.0) * 100.0

        if shares > 0:
            unrealized_pct = ((price - entry_price) / entry_price) * 100.0
            if unrealized_pct <= -STOP_LOSS_PCT or pred_ret_pct <= -SELL_THRESHOLD_PCT:
                cash += shares * price * (1.0 - ${backtestConfig.feeBps} / 10000.0)
                shares = 0.0
        elif pred_ret_pct >= BUY_THRESHOLD_PCT:
            deploy = cash * (${backtestConfig.allocationPct} / 100.0)
            shares = (deploy * (1.0 - ${backtestConfig.feeBps} / 10000.0)) / price
            cash -= deploy
            entry_price = price

        equity_curve.append((dates[i], cash + shares * price))

    return pd.DataFrame(equity_curve, columns=["Date", "Strategy_Equity"])


def main():
    raw_df = pd.read_csv(CSV_PATH, parse_dates=["Date"])
    df = engineer_features(raw_df)
    feature_cols = ${JSON.stringify(selectedFeatures)}

    split_row = int(len(df) * TRAIN_SPLIT)
    scaler = MinMaxScaler()
    train_scaled = scaler.fit_transform(df[feature_cols].iloc[:split_row])
    full_scaled = scaler.transform(df[feature_cols])

    X, y = create_windows(full_scaled, LOOKBACK)
    split_win = split_row - LOOKBACK
    X_train, y_train = X[:split_win], y[:split_win]
    X_test, y_test = X[split_win:], y[split_win:]

    model = build_model(LOOKBACK, len(feature_cols))
    history = model.fit(
        X_train,
        y_train,
        validation_data=(X_test, y_test),
        epochs=EPOCHS,
        batch_size=16,
        verbose=1,
    )

    preds_scaled = model.predict(X_test).flatten()
    pad = np.zeros((len(preds_scaled), len(feature_cols)))
    pad[:, 0] = preds_scaled
    predicted_prices = scaler.inverse_transform(pad)[:, 0]

    actual_prices = df["Close"].iloc[split_row:].values
    test_dates = df["Date"].iloc[split_row:].values

    rmse = np.sqrt(mean_squared_error(actual_prices, predicted_prices))
    mae = mean_absolute_error(actual_prices, predicted_prices)
    print(f"[{TICKER}] Test RMSE: \${rmse:.2f} | MAE: \${mae:.2f}")

    bt_df = run_strategy_backtest(test_dates, actual_prices, predicted_prices)

    fig, axes = plt.subplots(2, 1, figsize=(12, 8), dpi=120)
    axes[0].plot(test_dates, actual_prices, label="Actual Close", color="#0F172A", linewidth=1.8)
    axes[0].plot(test_dates, predicted_prices, label="${modelConfig.architecture} Predicted", color="#1D4ED8", linestyle="--")
    axes[0].set_title(f"{TICKER} — Out-of-Sample Price Forecast ({modelConfig.architecture})")
    axes[0].legend()
    axes[0].grid(alpha=0.25)

    axes[1].plot(bt_df["Date"], bt_df["Strategy_Equity"], label="AI Strategy Equity", color="#15803D")
    axes[1].set_title(f"{TICKER} — Algorithmic Strategy Equity Curve")
    axes[1].legend()
    axes[1].grid(alpha=0.25)
    plt.tight_layout()
    plt.show()


if __name__ == "__main__":
    main()
`;
}
