# King Wins Leaderboard

Single page web app that ingests the standardized Wordle/Hurdle group CSV export and renders only the "King Wins" leaderboard, complete with player stats and badge callouts. The earlier generic charting mode is out of scope and remnants of that code path now exist only for backward compatibility.

## Current Capabilities
- **Deterministic CSV load** via file picker or the built-in sample located at esources/game_data/wordleData.csv.
- **Wordle-only parsing**: looksLikeWordleSummary() (script.js:107) verifies the presence of the 1/6 through X/6 columns plus crown metadata before work continues.
- **Normalization pipeline**: 
ormalizeWordle() (script.js:164) explodes emoji columns into tidy player/day rows with crown flags, then getWordleLastDaysSubset() limits the dataset to the requested trailing window.
- **King Wins table**: wordleKingWins() (script.js:247) aggregates per-player crown wins, and enderKingTable() (script.js:483) draws the leaderboard plus detail panel.
- **Badges**: adges.js defines rule-based badges (see PLAYER_BADGE_RULES at adges.js:98) and surfaces them alongside player stats.
- **Developer mode toggle**: append ?developer=true to the URL to keep the control panel visible even when sharing embeds.

## Expected CSV Shape
The parser assumes the official Wordle summary export with headers similar to:

`
date posted,day streak,?? Round,??,1/6,2/6,3/6,4/6,5/6,6/6,X/6
2025-06-06,...
`

Fields of note:
- 1/6 ... X/6: space separated handles per guess bucket.
- ?? (or its mojibake variants): list of crown winners per day.
- ?? Round: formatted string describing which round the crown applied to.

Anything missing from this shape flips the app back to "generic" mode even though that UI is no longer part of the product scope, so malformed files currently surface confusing controls.

## Runtime Layout

`
index.html   # markup, file input, and King Wins preset dropdown
style.css    # dark theme, developer panel, king-table, and badge styles
script.js    # parsing, normalization, rendering, badge orchestration
badges.js    # badge rules + helper utilities
resources/   # sample CSV data packaged with the app
`

External libraries are pulled from CDNs:
- PapaParse 5.4.1 for CSV parsing.
- Chart.js 4.4.1 (still loaded even though generic charts are unused; removing it requires code cleanup).

## Data and Render Flow
1. User selects a CSV or hits **Load built-in sample**.
2. parseCsvText() (script.js:656) lets PapaParse read the file, then injects a synthetic __rowIndex on every row so preview slices can map back to origins.
3. onCsvLoaded() (script.js:677) normalizes the dataset when the Wordle schema is detected, primes the King Wins preset, and auto-renders on first load.
4. ender() (script.js:735) branches between the stale generic mode and the King Wins path; when the preset is wordle_king_wins it computes the leaderboard, swaps the chart canvas for the king-table, and refreshes the preview table.
5. Player clicks in the king-table bubble up via delegated listeners (script.js:906) to setActiveKingPlayer() (script.js:565) which recalculates per-player metrics and badge markup.

## Known Limitations
- **Generic mode zombie code**: setMode(), populateGenericSelectors(), enderChart(), ggregate(), pplyFilter(), and the Chart.js dependency remain even though only the King Wins preset is productized.
- **Global state**: awRows, 
ormalizedWordle, kingContext, and related values live in module scope (script.js:135 onward), making isolated testing or future modularization painful.
- **Encoding artifacts**: built-in sample data uses double-encoded emoji characters (script.js:886), so UI labels display mojibake unless the user provides a clean UTF-8 CSV.
- **Latency on large files**: normalization iterates over every bucket per row, and badge metrics recompute on each selection; there is no streaming or worker offload, so multi-thousand-row CSVs stutter.
- **Accessibility gaps**: king-table rows and badge chips are not fully keyboard navigable, and ARIA attributes are incomplete, making it hard to use with screen readers.
- **Stale controls**: dropdowns for chart type, aggregation, and export still render even though they no longer have functional value, leading to user confusion.

## Local Usage
1. Serve the folder via a static server (or open index.html directly if the browser allows local etch of esources/).
2. Click **Load built-in sample** to verify the leaderboard renders.
3. Drop the latest group CSV into the file picker, adjust the **Last N days** field, and click player names to inspect stats/badges.
4. Optional: use **Export normalized CSV** to download the exploded player-day rows for offline analysis.

## Smoke Checklist
- Load sample CSV, confirm King Wins table populates and the detail panel updates when selecting a player (script.js:552).
- Change the **Last N days** input and ensure both leaderboard ranking and preview table reflect the subset (script.js:209).
- Verify badge expansion toggles with mouse and keyboard (script.js:612 / script.js:930).
- Export normalized CSV and spot check that isCrown matches the leaderboard counts (script.js:838).

## Contributing Notes
Until the code is modularized, edits happen directly in script.js and adges.js. Please capture any changes to the King Wins flow in this README and keep the TODO.md roadmap updated so future contributors understand which parts of the legacy generic mode are slated for removal.

