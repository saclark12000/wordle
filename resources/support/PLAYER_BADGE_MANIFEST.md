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
### Preferred metric API (new)
Use these first when writing/maintaining badge rules:
- `ctx.metric(key, fallback?)` - get any metric value by key.
- `ctx.metricNumber(key, fallback?)` - numeric-safe accessor.
- `ctx.hasMetric(key)` - check if a metric exists.
- `ctx.metricSources` - namespaced storage for metrics:
  - `core` (player totals from normalized rows)
  - `derived` (computed values like `crownRatio`, `gamesPlayedTarget`)
  - `insights` (metrics passed from `script.js`)
  - `custom` (project-specific metrics you add over time)
- `ctx.metricValues` - flattened read view (custom > insights > derived > core precedence).

### Core context data
- `player`
- `metrics`
- `windowDays`
- `playerRank`
- `badgeState`
- `data` object:
  - `data.leaderboard`
  - `data.leaderboardEntry`
  - `data.dataset`
  - `data.rows`
  - `data.metricsMap`

### Legacy compatibility
Legacy flat fields (`leaderboard`, `dataset`, `rows`, `insights`, etc.) are still populated for existing predicates, but new badge rules should use `ctx.metric*` + `ctx.data`.

Helpers currently include:
- `ordinal(n)`
- `ratioPercent(wins, total)`
- `percent(value, digits?)`
- `metricNumber(value)`
- `metric(ctx, key, fallback?)`
- `metricNumberFrom(ctx, key, fallback?)`

## Example Player Card Entry
```js
{
  id: 'crown_conversion',
  icon: () => String.fromCodePoint(0x1f451),
  title: 'Crown Conversion',
  requirement: 'Reach at least 30% crown conversion.',
  progress: (ctx, helpers) => `${helpers.percent(ctx.metricNumber('crownRatio', 0), 1)} / 30%`,
  predicate: (ctx) => ctx.metricNumber('crownRatio', 0) >= 0.3
}
```

## Adding New Metrics for Future Badges
You no longer need to expand top-level `ctx` fields.

1. Put new values into one of these inputs when resolving badges:
   - `context.badgeMetricSources`
   - `opts.metricSources`
   - `opts.customMetrics` / `opts.extraMetrics` (shorthand for `custom`)
2. Read the metric in predicates via `ctx.metric('yourMetric')` or `ctx.metricNumber('yourMetric')`.
3. If needed, access a specific namespace with dot notation (`ctx.metric('insights.participationRate')`).

Example:
```js
const badges = resolvePlayerCardBadges(context, '@ace', {
  metricSources: {
    custom: {
      clutchWins: 7
    }
  }
});
```

## Workflow for Adding/Updating a Badge
1. Add or update the entry in `PLAYER_CARD_BADGE_MANIFEST` inside `badges.js`, keeping manifest order intentional.
2. Update `tests/badges.test.js` for predicate behavior and ordering.
3. Run `npm test`.
4. Smoke test in browser: row selection, earned/locked visuals, and expand/collapse details.
5. Update `README.md` if user-facing terminology changes.

Keep badge updates atomic: manifest change + tests + docs in one commit.
