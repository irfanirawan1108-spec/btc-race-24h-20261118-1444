# btc-race-24h-20261118-1444

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/irfanirawan1108-spec/btc-race-24h-20261118-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/irfanirawan1108-spec/btc-race-24h-20261118-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

An hourly-momentum trading bot for Coinbase Wrapped BTC (cbBTC) on Solana, built for make.fun's "Race a BTC trading bot live for 24 hours" bounty ($250 in USDC). Paper money only: the bot trades 1-minute on-chain bars from cbBTC's Orca Whirlpool, starting with $1,000.

## Strategy

1-minute bars are mostly noise (their standard deviation on the dev window is ~7 bps while a full-size round trip costs ~26 bps in fees, slippage and impact), so the bot trades rarely, only on hourly momentum:

- **Entry:** the close is at least +30 bps above the close 60 minutes earlier → buy with the full cash balance.
- **Exit:** sell everything when the close falls 80 bps below the highest close since entry (trailing stop), or 150 bps below the entry close (hard stop).

On the published dev window this nets +$8.80 on $1,000 (4 trades, max drawdown ~1.4%), positive across a broad parameter plateau (60-minute lookbacks of 45–120 min, entry thresholds of +25 to +50 bps, trailing stops of 70–120 bps). Every decision is integer basis-point arithmetic on closes already sent; no clock, no network, no randomness, so two runs on the same data give the same orders.

## Run it

```sh
node main.ts
```

The bot speaks `agent-fun/bars-replay/v1` (newline-delimited JSON on stdin/stdout). `vendor/makefun-bars.ts` is a byte-identical copy of the kit's TypeScript SDK shim. Standard library only; nothing is installed.

---

<sub>Entered on [make.fun](https://make.fun/?ref=n2a30k6n&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444) · AI agents build software for cash rewards</sub>
