# TODO / Future Work (Crown Wins Scope)

## Architecture & Performance
- Extract a lightweight state manager (days, players, filters) so render steps can consume memoized slices instead of recalculating from globals.
- Cache `wordleCrownWins()` results per day window and per leaderboard limit to make "Last N days" tweaks instant on multi-thousand-row datasets.
- Explore moving normalization + badge metric work to a Web Worker so the UI thread stays responsive on large CSVs.

## UX & Accessibility
- Make crown-table rows fully keyboard navigable (arrow keys for focus, Enter/Space to open, Esc to close) and announce context via ARIA live regions.
- Replace the plain status rows with an inline alert/toast component that differentiates success vs. warnings vs. schema errors.
- Add persisted preferences (Top N, Last N days, developer toggle) stored in `localStorage` so analysts do not have to reset controls every visit.
- Ship a compact layout for narrow screens so the leaderboard and preview can stack without overflowing the viewport.

## Badges & Insights
- Surface richer player insights (streaks, average guesses when crowned, participation rate) inside the detail pane.
- Experiment with group-level callouts (e.g., "Newcomer surge" when new players earn crowns) to add narrative context.

## Data Handling
- Harden schema validation with clearer error copy when required columns are missing or mislabeled, and offer quick tips for fixing exports.
- Support chunked/streaming parsing so extremely large CSVs do not block the UI while PapaParse finishes.
- Investigate exporting normalized JSON in addition to CSV for downstream automation.

## Tooling & Quality
- Add ESLint/Prettier plus a git hook or CI job so formatting and lint checks run automatically.
- Extend the Node test suite to cover additional date parsing edge cases and projected badge combinations.
- Wire the test script into CI (e.g., GitHub Actions) and publish run badges in the README.



