# TODO / Future Work (King Wins Scope)

## Immediate Cleanup
- Delete generic charting code paths (setMode, populateGenericSelectors, enderChart, ggregate, Chart.js include) and collapse the UI to only the controls the King Wins table needs.
- Split ender() (script.js:735) into intent-specific functions (load subset, compute leaderboard, render table, render preview) so future logic changes touch smaller surfaces.
- Normalize the bundled sample CSV to UTF-8 so the crown columns render correctly and the README screenshots stay trustworthy.

## Data & Performance
- Cap normalization work with worker threads or incremental rendering for very large CSVs (>5k rows) to prevent UI locks when recomputing badges.
- Cache wordleKingWins() results per day window so adjusting the **Last N days** slider does not recompute metrics from scratch.
- Store the parsed dataset in a structured object (e.g., {days:[], players:Map}) rather than parallel arrays to simplify reasoning about subsets.

## UX & Accessibility
- Remove unused generic controls from the DOM and redesign the layout around a single-column experience focused on the king-table.
- Make the leaderboard keyboard navigable (arrow keys, Enter to open player panel, Esc to close) and expose ARIA labels for badge descriptions.
- Replace status divs with a toast or inline alert component that clearly indicates loading, success, or schema errors.

## Badges & Insights
- Refactor PLAYER_BADGE_RULES (adges.js:98) into a declarative list with shared helpers so adding or rewording badges does not require duplicating strings.
- Add derived stats that matter for crown chasing (streaks, average guesses when crowned, participation rate) and surface them in the player panel.
- Allow group-level badges or callouts (e.g., "Newcomer surge" when new players get crowns) for richer storytelling.

## Tooling & Tests
- Introduce unit tests around normalization, crown counting, and badge selection (Vitest/Jest) and run them via CI before deploying.
- Add linting/formatting (ESLint + Prettier) plus type coverage via JSDoc or TypeScript to catch regressions in the now-focused scope.
- Provide a CLI or script that converts raw Wordle exports into the normalized JSON for automated validation jobs.
