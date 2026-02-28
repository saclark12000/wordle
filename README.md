# AI Generated
It's mostly AI generated code. Some small bits handwritten, but everything mostly done through prompting.

# Crown Wins Leaderboard

Single-page web app focused on a single job: ingest the standardized Wordle/Hurdle group CSV export and render the "Crown Wins" leaderboard with player stats and badge callouts. All former generic charting paths have been removed; every control now maps directly to the leaderboard workflow.

## Current Capabilities
- **Strict Wordle detection** – the loader validates that the CSV contains the `1/6` through `X/6` columns plus the crown metadata before any UI is enabled.
- **UTF-8 safe parsing** – file picker reads files as UTF-8, the built-in sample ships with proper crown text, and exports include a BOM so spreadsheets stop showing mojibake.
- **Normalization pipeline** – `crownWinsCore.js` exposes pure helpers (`normalizeWordle`, `wordleCrownWins`, etc.) that convert emoji columns into tidy player/day rows and can now be unit tested in isolation.
- **Leaderboard view** – `renderCrownTable()` replaces the old Chart.js canvas with the dedicated crown-table layout, including player detail panes and multi-badge toggles.
- **Preview + export** – the data preview only shows the rows backing the current "Last N days" window, and you can download the normalized rows with **Export normalized CSV**.
- **Badge system** – `badges.js` drives the player-card badge board (`PLAYER_CARD_BADGE_MANIFEST`) from the full manifest. Earned tiles are full-color, locked tiles render as black boxes, and expanding a tile shows current progress plus requirements.
- **Round Breakdown badge placements** – manifest entries can publish `roundBreakdownSlots` so a selected subset of earned badges render inline beside Round Breakdown values (for example, `bucket_master` icons in the 👑 wins column on awarding rounds).
- **Badge metric registry** – badge predicates now consume `ctx.metric(...)`/`ctx.metricNumber(...)` against namespaced metric sources (`core`, `derived`, `insights`, `custom`) so new metrics can be added without growing top-level badge context fields.

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
1. **Load** – `parseCsvText()` (script.js) runs PapaParse with `header: true` and stamps each raw row with a hidden `__rowIndex`.
2. **Detect** – `onCsvLoaded()` validates the schema, normalizes rows via `normalizeWordle()`, and populates the "Last N days" input with the total day count.
3. **Render** – `render()` builds the day subset, feeds it to `wordleCrownWins()`, renders the leaderboard, and syncs the preview table to the same subset.
4. **Interact** – clicking rows in the crown-table updates the player card, converts non-table stats into badge tiles, and keeps the Crown Wins table visible. Clicking/Enter/Space on a badge expands it to show metrics + requirements; clicking "Close" returns to group stats. Round Breakdown values can also show inline badge icons when a manifest entry declares matching `roundBreakdownSlots`; clicking one of those inline icons expands the matching badge tile in the Earned/Locked board.

## Project Layout
```
index.html    # lean control panel + leaderboard card
style.css     # dark theme, developer tools, crown-table, badges
script.js     # DOM orchestration + subset logic
crownWinsCore.js # reusable normalization helpers (UMD-style)
badges.js     # badge rules + metrics helpers (UMD-style)
resources/    # sample CSV data
tests/        # node --test suites for core + badges
package.json  # npm scripts (npm test)
```
Only PapaParse is loaded at runtime. Chart.js has been removed entirely.

## Local Usage
1. Serve the folder via a static file server (or open `index.html` directly in a browser that allows `fetch`ing local files).
2. Click **Load built-in sample** to confirm the leaderboard renders.
3. Drop your latest Wordle/Hurdle export, tweak **Top N** and **Last N days**, then click player rows to inspect badges and per-guess stats.
4. Hit **Export normalized CSV** if you need the tidy format for spreadsheets or other tooling.

## Support Resources
- Refer to `resources/support/PLAYER_BADGE_MANIFEST.md` for a step-by-step checklist on adding or updating `PLAYER_CARD_BADGE_MANIFEST` entries. It explains manifest fields (including progress/requirement copy), the `ctx.metric*` API, and the test workflow.

## Extending Badge Metrics
- Store reusable or long-lived custom badge metrics on `crownContext.badgeMetricSources` (or pass them per-call via `resolvePlayerCardBadges(..., { metricSources })`).
- Prefer `ctx.metric('metricName')` and `ctx.metricNumber('metricName')` in badge predicates/progress copy.
- Use namespaced lookup (`ctx.metric('insights.participationRate')`) when you need explicit source control.
- Legacy option aliases like `opts.insights` are intentionally ignored; use `metricSources.insights`.

## Smoke Checklist
- Load the built-in sample -> leaderboard populates, selecting rows updates the detail pane.
- Change **Last N days** -> leaderboard, preview table, and status copy reflect the new window.
- Toggle player badges -> player cards render all available manifest badges; earned badges are full-color, locked badges are black, and expanding a tile reveals title + current metric + requirement.
- Bucket Master smoke check -> when a player leads one or more crown rounds, the 🥫 icon appears next to the corresponding 👑 wins values in Round Breakdown.
- Round Breakdown icon click check -> clicking a Round Breakdown badge icon expands the corresponding badge tile in the badge board.
- Export normalized CSV -> downloaded file opens in Excel with crowns rendered correctly.

## Tests
Run `npm test` to execute the Node test runner. The suite currently covers:
- `normalizeWordle` edge cases (crowns, failed rows, date parsing).
- `wordleCrownWins` ordering logic.
- Badge selection heuristics, earned/locked player-card badge resolution, and badge markup limits/order for player-card badges.

## Known Limitations
- **Global mutable state** – the browser implementation still keeps `rawRows`, `normalizedWordle`, and `crownContext` in module scope, so further modularization would help.
- **Performance** – normalization is synchronous and recomputes on every render; workers or memoization would help on 5k+ row CSVs.
- **Accessibility polish** – the crown-table rows are focusable, but announcing context (row place, instructions) still needs ARIA work.
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
