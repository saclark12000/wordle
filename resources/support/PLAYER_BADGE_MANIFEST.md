# Player Badge Manifest Support Guide

Use this guide whenever you need to add or update badges in `badges.js`.

Primary manifest in active use:
- `PLAYER_CARD_BADGE_MANIFEST` - player card badge board used by `resolvePlayerCardBadges()` (default: all entries, includes locked + earned badges).

## Required Fields per Entry
- `id` - Stable identifier (`snake_case`) so tests can assert behavior.
- `title` - String or `(ctx, helpers) => string`.
- `predicate` - **Required** `(ctx, helpers) => boolean` function.

## Common Visual Fields
- `icon` / `image` - Earned visual treatment.
- `lockedIcon` / `lockedImage` - Optional locked-state override.
- `alt`, `ariaLabel` - Accessibility metadata.

## Player Card Fields
Use these for `PLAYER_CARD_BADGE_MANIFEST` entries so locked badges still communicate progress.
- `progress` - String or function; shown on collapsed card and in expanded details.
- `requirement` - String or function; shown in expanded details.
- `description` - Optional explanatory copy.

## Context & Helpers Available to Predicates
Every predicate receives a `ctx` object including:
- `player`
- `leaderboard`
- `leaderboardEntry`
- `dataset`
- `metrics`
- `rows`
- `metricsMap`
- `insights` (player insight metrics passed from `script.js`)
- `windowDays`
- `playerRank`
- `helpers`

`ctx.leaderboard.rankings` is still available for crown-guess leader comparisons.

Helpers currently include:
- `ordinal(n)`
- `ratioPercent(wins, total)`
- `percent(value, digits?)`
- `metricNumber(value)`

## Example Player Card Entry
```js
{
  id: 'crown_conversion',
  icon: () => String.fromCodePoint(0x1f451),
  title: 'Crown Conversion',
  requirement: 'Reach at least 30% crown conversion.',
  progress: (ctx, helpers) => `${helpers.percent(ctx.metrics.crownWins / ctx.metrics.totalGames, 1)} / 30%`,
  predicate: (ctx) => (ctx.metrics.totalGames > 0) && (ctx.metrics.crownWins / ctx.metrics.totalGames >= 0.3)
}
```

## Workflow for Adding/Updating a Badge
1. Add or update the entry in `PLAYER_CARD_BADGE_MANIFEST` inside `badges.js`, keeping manifest order intentional.
2. Update `tests/badges.test.js` for predicate behavior and ordering.
3. Run `npm test`.
4. Smoke test in browser: row selection, earned/locked visuals, and expand/collapse details.
5. Update `README.md` if user-facing terminology changes.

Keep badge updates atomic: manifest change + tests + docs in one commit.
