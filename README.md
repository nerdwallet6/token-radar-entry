[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/nerdwallet6/token-radar-entry/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/nerdwallet6/token-radar-entry/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# token-radar-entry — Token Radar

Entry for the [make.fun `token-radar-01` bounty](https://make.fun/bounty/token-radar-01):
build the best token launch radar — a dashboard that tracks pre-token
protocols worth farming, ranked by implied value, with a farm plan for each.

## What it is

Token Radar reads a sealed DefiLlama protocol snapshot (758 protocols,
40 on the watchlist) and ranks every pre-token protocol — one that records
no token, no market cap, no CoinGecko id, no symbol — by **implied value**:
what a token would be worth if the protocol's record stayed as it is.
Live-token protocols are set aside and shown at their market cap, never
mixed into the ranked board. The board carries 200 rows: the 40 watchlist
protocols plus 160 early rows below the watchlist floor, so the radar
finds future launches early. Every row gets a specific farm plan.

## The model — `impliedValue` (radar-2)

`lib/model.ts` scores every protocol with the same function; no name is
ever special-cased. In words:

- **Base** — TVL × 0.25.
- **Growth** — the 7-day TVL change, clamped to −60%…+120%, weighted by
  0.5; a week above +50% earns a 10% momentum step.
- **Maturity** — age since first listing lifts the value from 0.6 toward
  1.0 over 1095 days (unknown age counts as 365 days).
- **Category** — a per-category FDV/TVL multiple (0.7–1.6; prediction
  markets highest, bridges lowest).
- **Chains** — a small premium per extra chain, +4% each, capped at +16%.

`impliedValue = round(base × growth × maturity × category × chains)`,
at least $1. The dashboard recomputes this product from each row's own
figures in its detail panel and shows whether it matches the board.

## Files

- `main.ts` — the program (Node 22, standard library only): reads the
  snapshot, scores the board, writes `board.json`, `data.js` and
  `dossier.json`, and copies `dashboard/` and `screenshots/` to the
  output directory.
- `lib/model.ts` — the radar-2 model, the snapshot parser, and the board
  builder.
- `vendor/makefun-board.ts` — the make.fun dossier library (byte for
  byte the kit's copy).
- `dashboard/` — the static dashboard: `index.html`, `app.css`,
  `app.js` (33,219 bytes total). No network, no fetch — it renders only
  from `data.js`, which `main.ts` writes beside it.
- `screenshots/` — three real renders of the dashboard at 1280×800:
  the ranked board, a protocol detail view (model breakdown + farm
  plan), and the Watchlist-only filtered view.

## Run it

```sh
# from this repository root; the kit's snapshot is the input
mkdir -p /tmp/out-radar-final
MAKEFUN_OUTPUT_DIR=/tmp/out-radar-final node main.ts \
  --input /path/to/token-radar-01-kit/input/snapshot.json

# produces /tmp/out-radar-final/board.json, data.js, dossier.json,
# dashboard/ and screenshots/. Open dashboard/index.html (served from
# the output directory, so data.js sits beside dashboard/) to view it.
```

Outside the grader's container, `MAKEFUN_OUTPUT_DIR` stands in for
`/output`; inside it, the default input is `/input/snapshot.json`.
