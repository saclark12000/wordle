# AI Generated
It's mostly AI generated code. Some small bits handwritten, but everything mostly done through prompting.

# Crown Wins Leaderboard

React/Vite web app focused on a single job: ingest the standardized Wordle/Hurdle group CSV export and render the "Crown Wins" leaderboard with player stats and badge callouts. The core leaderboard, badge, and normalization logic still lives in the reusable plain-JS modules, while the browser UI now runs through React entry points for the main app and the standalone Group Stats page.

## Current Capabilities
- **React frontend shell** – `src/App.jsx` and `src/GroupStatsApp.jsx` now drive the main leaderboard and standalone Group Stats experiences, replacing the old direct DOM bootstrapping in `script.js`.
- **Strict Wordle detection** – the loader validates that the CSV contains the `1/6` through `X/6` columns plus the crown metadata before any UI is enabled.
- **UTF-8 safe parsing** – file picker reads files as UTF-8, the built-in sample ships with proper crown text, and exports include a BOM so spreadsheets stop showing mojibake.
- **Normalization pipeline** – `crownWinsCore.js` exposes pure helpers (`normalizeWordle`, `wordleCrownWins`, etc.) that convert emoji columns into tidy player/day rows and can now be unit tested in isolation.
- **Leaderboard view** – the React crown-table keeps the dedicated leaderboard layout, including player detail panes, badge expansion, and group-stats navigation.
- **Shared Group Stats panel** – the default side panel now reuses the richer `group-stats.html` summary/sidebar leaderboard content through `groupStats.js`, so the standalone preview and in-app Group Stats view stay aligned.
- **Preview + export** – the data preview only shows the rows backing the current "Last N days" window, and you can download the normalized rows with **Export normalized CSV**.
- **Badge system** – `badges.js` drives the player-card badge board (`PLAYER_CARD_BADGE_MANIFEST`) from the full manifest. Earned tiles are full-color, locked tiles render as black boxes, and expanding a tile shows current progress plus requirements.
- **Badge balance pass** – the individual player badge board now favors meaningful progression over free volume:
  - Added `steady_solver` to reward reliable solve completion, even for players who are not crown leaders.
  - Added sample-size gates to swingy ratio/average badges such as `crown_win_ratio` and `efficient_crowns`.
  - `badge_collector` now counts progression badges only, so onboarding/comedy badges do not inflate completion.
- **Rank badge series update** – `top_ten_rank` was replaced by place-specific badges: `crown_wins_1_place`, `crown_wins_2-5_place` (tiered), `crown_wins_6-9_place` (tiered), and `crown_wins_10_place`.
- **Participation badge update** – manifest uses `always_guessing` (15% unlock, with higher tiers up to 85%+) to reward steady participation.
- **Tiered badge icon helper** – `buildLayeredBadgeIcon(...)` in `badges.js` provides a reusable star-tier medal pattern (`0-3 ⭐` displayed in front of `🏅`, for example `always_guessing`).
  - Supports icon swaps (for example `starsIcon: '🎪'`, `medalIcon: '🎱'`).
  - Supports star placement config with `starsPosition: 'default' | 'over' | 'under'` (for example `sus_wins` uses `under`).
  - `always_guessing` unlocks at `15%` participation and uses tier mapping: `15-44% = 0`, `45-64% = 1`, `65-84% = 2`, `85%+ = 3`.
  - `steady_solver` unlocks at `75%` solve rate with `10+` tracked games and uses tier mapping: `75-84% = 0`, `85-91% = 1`, `92-96% = 2`, `97%+ = 3`.
  - `crown_win_ratio` unlocks at `30%` crown ratio with `10+` tracked games and uses tier mapping: `30-44% = 0`, `45-59% = 1`, `60-74% = 2`, `75%+ = 3`.
  - `crown_win_streak` unlocks at `2` consecutive crown-win days and uses `🔥` tiers over `🍆`: `2 = 0`, `3-5 = 1`, `6-11 = 2`, `12+ = 3`.
  - `solo_crown_wins` unlocks at `1` uncontested crown and uses tier mapping: `1 = 0`, `2 = 1`, `3 = 2`, `4+ = 3`.
  - `failed_games` now uses fail-rate tiers with a `10+` game minimum: `10-17% = 0`, `18-25% = 1`, `26-34% = 2`, `35%+ = 3`.
  - `efficient_crowns` now requires `10+` crowns and a crowned-win average of `3.5` guesses or better, with bonus tiers at `3.3`, `3.1`, and `2.8`.
- **Round Breakdown badge placements** – manifest entries can publish `roundBreakdownSlots` so a selected subset of earned badges render inline beside Round Breakdown values (for example, `bucket_master` icons in the 👑 wins column on awarding rounds).
  - `bucket_master` now uses tier mapping by non-`1/6` leading rounds: `1 lead = 0⚙`, `2 = 1⚙`, `3 = 2⚙`, `4+ = 3⚙`, with a gold `🥫` medal icon.
- **Badge metric registry** – badge predicates now consume `ctx.metric(...)`/`ctx.metricNumber(...)` against namespaced metric sources (`core`, `derived`, `insights`, `custom`) so new metrics can be added without growing top-level badge context fields.
  - Derived metrics include `soloCrownWins`, which counts days where a player was the only crown winner in the active window.

## Expected CSV Shape
```
date posted,day streak,crown round,crown,1/6,2/6,3/6,4/6,5/6,6/6,X/6
2025-06-06,"**Your group...**","1/6","@winner","@winner",--,...
```
The parser looks for:
- `1/6` … `X/6` columns with space-separated handles per guess bucket.
- A crown column (`crown` or `👑`) listing winners per day.
- An optional `crown round` column describing which streak or round the crown applied to.
If any required column is missing the app leaves the controls disabled and surfaces a warning.

## Data & Rendering Flow
1. **Load** – `src/lib/csv-utils.js` runs PapaParse with `header: true`, stamps each raw row with a hidden `__rowIndex`, and hands the document to the React app.
2. **Detect** – `src/App.jsx` validates the schema, normalizes rows via `normalizeWordle()`, and seeds the active "Last N days" window with the full dataset.
3. **Render** – React derives the active day-window subset, feeds it to `wordleCrownWins()`, renders the leaderboard, and keeps the preview table aligned to the same subset.
4. **Interact** – the Group Stats panel defaults to the shared summary + leaderboard sidebar view from `group-stats.html`; clicking sidebar metrics swaps the active leaderboard in place. Clicking rows in the crown-table updates the player card, converts non-table stats into badge tiles, and keeps the Crown Wins table visible. Clicking/Enter/Space on a badge expands it to show metrics + requirements; clicking "Close" returns to group stats. Round Breakdown values can also show inline badge icons when a manifest entry declares matching `roundBreakdownSlots`; clicking one of those inline icons expands the matching badge tile in the Earned/Locked board.

## Project Layout
```
index.html         # Vite entry for the main React app
group-stats.html   # Vite entry for the standalone Group Stats page
src/               # React app shell, components, and browser-side helpers
style.css          # existing badge / group-stats / table styling
script.js          # legacy DOM bootstrap kept for reference during migration
groupStats.js      # shared group-stats derivation + panel markup
crownWinsCore.js   # reusable normalization helpers (UMD-style)
badges.js          # badge rules + metrics helpers (UMD-style)
resources/         # sample CSV data
tests/             # Node test suites + sequential test entrypoint
package.json       # npm scripts (dev/build/preview/test)
```
Runtime dependencies are now bundled through Vite. Chart.js remains removed.

## Local Usage
1. Run `npm install`.
2. Run `npm run dev` and open the local Vite URL.
3. Click **Load built-in sample** to confirm the leaderboard renders, or open `?developer=true` to expose CSV upload controls and in-app docs.
4. Drop your latest Wordle/Hurdle export, tweak **Top N** and **Last N days**, then click player rows to inspect badges and per-guess stats.
5. Hit **Export normalized CSV** if you need the tidy format for spreadsheets or other tooling.
6. Open `/group-stats.html` in the dev server (or use `npm run build`) if you want the standalone preview of the same Group Stats panel used in-app.

## Support Resources
- Refer to `resources/support/PLAYER_BADGE_MANIFEST.md` for a step-by-step checklist on adding or updating `PLAYER_CARD_BADGE_MANIFEST` entries. It explains manifest fields (including progress/requirement copy), the `ctx.metric*` API, and the test workflow.
- Refer to `resources/support/INDIVIDUAL_PLAYER_BADGE_SYSTEM_GDD.md` for the badge-balance rationale, tuning targets, and changelog for the individual player badge board.

## Extending Badge Metrics
- Store reusable or long-lived custom badge metrics on `crownContext.badgeMetricSources` (or pass them per-call via `resolvePlayerCardBadges(..., { metricSources })`).
- Prefer `ctx.metric('metricName')` and `ctx.metricNumber('metricName')` in badge predicates/progress copy.
- Use namespaced lookup (`ctx.metric('insights.participationRate')`) when you need explicit source control.
- Legacy option aliases like `opts.insights` are intentionally ignored; use `metricSources.insights`.

## Smoke Checklist
- Load the built-in sample -> leaderboard populates, selecting rows updates the detail pane.
- Change **Last N days** -> leaderboard, preview table, and status copy reflect the new window.
- Toggle player badges -> player cards render all available manifest badges; earned badges are full-color, locked badges are black, and expanding a tile reveals title + current metric + requirement.
- Bucket Master smoke check -> when a player leads a non-`1/6` crown round, the layered gold-🥫 + ⚙ tier icon appears next to corresponding 👑 wins values in Round Breakdown, and tier changes at 1/2/3/4+ qualifying leads.
- Round Breakdown icon click check -> clicking a Round Breakdown badge icon expands the corresponding badge tile in the badge board.
- Export normalized CSV -> downloaded file opens in Excel with crowns rendered correctly.

## Tests
Run `npm test` to execute the Node-based test suite. The package script uses `tests/run-tests.js` so the suite also works in restricted environments where `node --test` cannot spawn worker processes. Coverage currently includes:
- `normalizeWordle` edge cases (crowns, failed rows, date parsing).
- `wordleCrownWins` ordering logic.
- State-store day window filtering and memoized player subset lookups.
- Badge selection heuristics, earned/locked player-card badge resolution, and badge markup limits/order for player-card badges.
- Group stats derivation, leaderboard ordering, and shared Group Stats panel markup.

## Known Limitations
- **Legacy markup generators** – Group Stats and badge boards still rely on HTML string builders from `groupStats.js` / `badges.js`; moving those to typed React components would improve maintainability.
- **Performance** – normalization is synchronous and recomputes on every render; workers or memoization would help on 5k+ row CSVs.
- **Accessibility polish** – the crown-table rows are focusable, but announcing context (row place, instructions) still needs richer ARIA work.
- **No persistence** – user preferences (Top N, Last N days, developer toggle) reset on refresh.

## Contributing
- Keep data/normalization helpers in `crownWinsCore.js` so they remain testable from Node.
- Update this README plus `TODO.md` when you alter workflows or add roadmap items.
- Run `npm test` before shipping changes; add new coverage when you touch the normalization or badge rules.


## Developer Panel
- The developer panel doubles as in-app documentation by rendering key markdown docs.
- Developer Tools now includes **Log current badge ctx**, which prints a grouped, human-readable badge-context snapshot to the browser console (plus raw ctx and badge result table).
- To view the developer panel, open the app with the query string `?developer=true`.
  - [Show Developer Panel](?developer=true)
