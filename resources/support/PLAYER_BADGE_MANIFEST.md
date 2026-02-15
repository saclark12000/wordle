# PLAYER_BADGE_MANIFEST Support Guide

Use this guide whenever you need to add or update player badges in `badges.js`. The `PLAYER_BADGE_MANIFEST` array is the single source of truth for badge metadata and predicates that decide which badge a player earns.

## Required Fields per Entry
- `id` - Stable string identifier. Follow the `snake_case` pattern so tests can assert on it (for example `crown_leaderboard_first_place`).
- `icon` / `image` - Visual shown in the player card. Use emoji strings for `icon` or provide a path/URL for `image` (with a matching `alt`).
- `title` - Either a string or `(ctx, helpers) => string`. Keep it short; it becomes the badge chip text.
- `description` - Optional string or function used for tooltips/expanded copy. Explain why the badge was awarded.
- `predicate` - **Required** function `(ctx, helpers) => boolean` that gates whether the badge is applied to the inspected player.

Optional keys: `ariaLabel`, `alt`, and any other presentation attributes that `buildPlayerBadgeMarkup()` understands.

## Context & Helpers Available to Predicates
Every predicate receives a `ctx` object that includes:
- `player` - Handle/name currently being resolved.
- `leaderboard` - Array of `{ player, place, winCount, totalGames, ratio }` entries for the filtered window.
- `leaderboardEntry` - The entry for `player`, if present.
- `dataset` - Normalized rows backing the active window.
- `metrics` - Aggregated stats from `buildPlayerMetricsMap()` (`totalGames`, `crownWins`, `susWins`, `buckets`, etc.).
- `rows` - The raw normalized rows for the player when `trackRows` is enabled.
- `metricsMap` - Full map of all player metrics (for cross-player comparisons when needed).
- `helpers` - Currently exposes `ordinal(n)` and `ratioPercent(wins, total)` for formatting.

You can destructure what you need inside the predicate for readability:

```js
predicate: ({ metrics }) => metrics.crownWins >= 50
```

## Example Entry
```js
{
  id: 'streak_guardian',
  icon: String.fromCodePoint(0x1F6E1),
  title: 'Streak Guardian',
  description: (ctx) => `${ctx.player} kept crowns coming for ${ctx.metrics.crownWins} days straight.`,
  predicate: ({ metrics, rows }) => {
    if (!metrics || !rows?.length) return false;
    return rows.every((row) => row.isCrown);
  }
}
```

## Workflow for Adding a Badge
1. **Plan the trigger.** Decide which metric or leaderboard scenario should award the badge and confirm the data exists in `ctx`.
2. **Add the manifest entry.** Update `PLAYER_BADGE_MANIFEST` in `badges.js`, keeping the array order meaningful (earlier entries win conflicts).
3. **Cover it with tests.** Extend `tests/badges.test.js` with a focused scenario that asserts the new badge `id` fires only when expected. Use `createCrownContext()` plus synthetic datasets to keep tests fast.
4. **Manual smoke test.** Run `npm test`, then load the built-in sample via the UI and confirm the badge renders/expands correctly for a representative player.
5. **Document user-facing copy.** If the badge introduces terminology users might not recognize, add a brief note to `README.md` under the badges section.

Keep manifest updates atomic: each change should introduce the new badge definition, matching tests, and any README adjustments in the same commit so future contributors understand the intent.
