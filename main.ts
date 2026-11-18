// Hourly-momentum cbBTC bot for make.fun's "Race a BTC trading bot live for 24 hours"
// (agent-fun/bars-replay/v1, Node 22, standard library only + the vendored shim).
//
// Strategy (long only, one position, full size)
// ---------------------------------------------
// Bitcoin's 1-minute bars are mostly noise: on the 24-hour dev window their
// standard deviation is ~7 bps while a full-size round trip costs ~26 bps in
// fees, slippage and price impact, so trading every wiggle is guaranteed to
// lose. The moves that pay are the multi-hour ones (the 60-minute return's
// standard deviation is ~46 bps, and the dev window's hourly ranges average
// ~66 bps). This bot therefore trades rarely, only on hourly momentum:
//
//   - Entry: the close is at least +30 bps above the close 60 minutes
//     earlier. The whole cash balance is spent (one order, at most the
//     weight cap).
//   - Exit: the whole position is sold as soon as the close falls 80 bps
//     below the highest close seen since entry (a trailing stop), or 150 bps
//     below the entry close (a hard stop, a safety net for a gap move).
//
// Why these numbers: on the published dev window the strategy is positive
// over a broad plateau, not a single tuned point -- 60-minute lookbacks from
// 45 to 120 minutes, entry thresholds from +25 to +50 bps and trailing stops
// from 70 to 120 bps all end in profit, with 4 trades and a maximum drawdown
// of ~1.4% at the chosen point (net +$8.80 on $1,000). It caught the
// window's one clean recovery (bought near the bottom after the early
// washout, trailed out +170 bps higher) and sat in cash through the chop.
// Nothing here is fitted to a single bar: every decision is integer
// basis-point arithmetic on closes the harness has already sent, so two
// runs on the same data give the same orders.
//
// Robustness notes
// ----------------
//   - Missing bars: a minute with no bar is simply absent from the history;
//     the 60-minute reference is the latest bar that closed at least 60
//     minutes before the current one, found by bar time, not by count.
//   - No wall clock, no network, no randomness, no floats in decisions:
//     every comparison is cross-multiplied integer arithmetic on the raw
//     close values, so there is no rounding at all.
//   - max_slippage_bps is 100 (1%): a fill that would move more than 1%
//     past the close the order was decided on is refused rather than
//     filled at a gap price, and the signal is simply re-tried next bar.
//   - A rejected buy (or a buy whose fill never arrives) leaves no
//     position, so the entry state is cleared whenever the account shows
//     no position.

import { runBars, type BarsState, type Batch, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** 60 minutes in milliseconds: the momentum lookback. */
const LOOKBACK_MS = 60 * 60 * 1000;
/** Enter when the close is at least this far above the close 60 minutes ago. */
const ENTRY_BPS = 30n;
/** Sell when the close falls this far below the highest close since entry. */
const TRAIL_BPS = 80n;
/** Sell when the close falls this far below the entry close (gap safety net). */
const STOP_BPS = 150n;
/** Refuse a fill more than this past the close the order was decided on. */
const MAX_SLIPPAGE_BPS = 100;

/** (bar close time ms, close price) of every CBBTC bar seen, oldest first. */
const history: Array<[number, bigint]> = [];
/** Close the position was entered at, and the highest close since, once a
 *  buy has been decided. Both are null while flat. */
let entryClose: bigint | null = null;
let peakClose: bigint | null = null;

await runBars({
  onBatch(state: BarsState, batch: Batch): Array<BuyInput | SellInput> {
    if (state.warmingUp) return [];
    const bars = batch.bars.filter((b) => b.symbol === SYMBOL);
    if (bars.length === 0) return []; // No bar for our symbol this minute.
    const bar = bars[bars.length - 1];
    const close = BigInt(bar.c);
    const now = bar.t;
    history.push([now, close]);
    // Keep only what the lookback can need: drop an old bar only while a
    // later bar is still at or before the 60-minute cutoff, so the latest
    // bar at or before the cutoff (the momentum reference) always survives.
    while (history.length > 1 && history[1][0] <= now - LOOKBACK_MS) history.shift();

    const held = state.positions.get(SYMBOL);
    if (held === undefined) {
      // Flat: a buy that never filled must not leave stale entry state.
      entryClose = null;
      peakClose = null;
      // Need a bar at least 60 minutes old to measure momentum.
      let ref: bigint | null = null;
      for (const [t, c] of history) if (t <= now - LOOKBACK_MS) ref = c;
      if (ref === null) return [];
      // (close - ref) / ref >= ENTRY_BPS / 10000, cross-multiplied.
      if ((close - ref) * 10_000n < ENTRY_BPS * ref) return [];
      let amount = state.cash;
      const minNotional = BigInt(state.hello.fees.min_notional_quote_units);
      if (amount < minNotional) return [];
      const room = state.weightRoom(SYMBOL);
      if (room < amount) amount = room;
      if (amount < minNotional) return [];
      entryClose = close;
      peakClose = close;
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: amount, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }

    // Holding: track the peak and exit on the trailing stop or the hard stop.
    if (entryClose === null) {
      // Position held without a recorded entry (should not happen: the buy
      // that opened it records it). Fall back to the current close.
      entryClose = close;
      peakClose = close;
    }
    if (close > peakClose!) peakClose = close;
    // (peak - close) / peak >= TRAIL_BPS / 10000, cross-multiplied.
    if ((peakClose! - close) * 10_000n >= TRAIL_BPS * peakClose!) {
      return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    // (entry - close) / entry >= STOP_BPS / 10000, cross-multiplied.
    if ((entryClose - close) * 10_000n >= STOP_BPS * entryClose) {
      return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});
