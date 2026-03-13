# TODO / Future Work (Crown Wins Scope)
## Devleoper Reccomenations only, AI should only update AI Reccomendations section only
### custom badge system
- develop a system to allow for others to easily enter badges.
- i.e. a tool in the developer console

### badge disply
- further update and organize badges

## AI Reccomendations 
## AI edits entered below this line only
### Architecture & Performance
- Cache `wordleCrownWins()` results per day window and per leaderboard limit to make "Last N days" tweaks instant on multi-thousand-row datasets.
- Explore moving normalization + badge metric work to a Web Worker so the UI thread stays responsive on large CSVs.
- Replace the remaining legacy HTML-string renderers (`groupStats.js`, `badges.js`) with typed React components so the new frontend no longer depends on delegated DOM patches.

### UX & Accessibility
- Make crown-table rows fully keyboard navigable (arrow keys for focus, Enter/Space to open, Esc to close) and announce context via ARIA live regions.
- Replace the plain status rows with an inline alert/toast component that differentiates success vs. warnings vs. schema errors.
- Add persisted preferences (Top N, Last N days, developer toggle) stored in `localStorage` so analysts do not have to reset controls every visit.
- Ship a compact layout for narrow screens so the leaderboard and preview can stack without overflowing the viewport.

### Badges & Insights
- Surface richer player insights (streaks, average guesses when crowned, participation rate) as first-class card stats instead of badge-only metrics.
- Add trend deltas to the shared Group Stats panel so leaderboard changes between windows are visible without manual comparison.
- Break the badge manifest and badge helper logic into smaller modules to keep future badge additions reviewable.

### Data Handling
- Harden schema validation with clearer error copy when required columns are missing or mislabeled, and offer quick tips for fixing exports.
- Support chunked/streaming parsing so extremely large CSVs do not block the UI while PapaParse finishes.
- Investigate exporting normalized JSON in addition to CSV for downstream automation.

### Tooling & Quality
- Add ESLint/Prettier plus a git hook or CI job so formatting and lint checks run automatically.
- Extend the Node test suite to cover additional date parsing edge cases and projected badge combinations.
- Add a browser smoke test path for CSV load/render/export flows so DOM regressions are caught alongside the Node tests.
- Wire the test script into CI (e.g., GitHub Actions) and publish run badges in the README.



