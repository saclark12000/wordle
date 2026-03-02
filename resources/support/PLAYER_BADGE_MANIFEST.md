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
- For tiered medal icon compositions, use `buildLayeredBadgeIcon(...)` from `badges.js` instead of hand-built HTML strings.
  - Primary option: `stars` (`0..3`) to render `⭐` count in front of a `🏅`.
  - Optional icon overrides: `starsIcon` / `starIcon` / `starGlyph`, `medalIcon` / `medalGlyph`.
  - Optional class overrides: `wrapperClass`, `starsClass`, `medalClass`.

## Player Card Fields
Use these for `PLAYER_CARD_BADGE_MANIFEST` entries so locked badges still communicate progress.
- `progress` - String or function; shown on collapsed card and in expanded details.
- `requirement` - String or function; shown in expanded details.
- `tierInfo` - Optional string/function for tiered badges; when present it renders as a `Tier Ladder` detail row under `Requirement`.
- `description` - Optional explanatory copy.
- `roundBreakdownSlots` - Optional string/object/array or function returning slots for inline Round Breakdown rendering.
  - Supported slot keys: `round` (or `bucket`) and optional `column` (`crownWins` default, `wins` supported).
  - `round` values accept `1..6`, `X`, and `#/6` label form (for example `2/6`).
  - This is intended for a subset of badges; only badges that declare slots are rendered in table cells.
  - Round Breakdown table icons are interactive and open the matching badge tile in the player badge board when clicked.

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

### Available Metric Keys
Use `ctx.metric('key')` or `ctx.metricNumber('key')`.

`core` keys (always present):
- `player` - Player handle currently being evaluated (string).
- `totalGames` - Total number of games the player appeared in for the active window.
- `solvedGames` - Number of solved games (1/6 through 6/6).
- `failGames` - Number of failed games (`X/6`).
- `crownWins` - Number of games where the player earned the crown.
- `susWins` - Number of one-guess solves (`1/6`).
- `winRatio` - Rounded crown-to-games ratio (`Math.round(crownWins / totalGames)`).
- `buckets` - Guess-distribution counts keyed by `1..6` and `X`.
- `crownBuckets` - Crown-win distribution counts keyed by `1..6` and `X`.
- `rows` - Normalized player rows in the active window (array of row objects).
- `playerRank` - Player rank by crown wins in the active leaderboard (1-based).
- `windowDays` - Active day-window size used for badge evaluation.

`derived` keys (always present):
- `crownRatio` - Exact crown conversion ratio (`crownWins / totalGames`).
- `failRatio` - Exact fail ratio (`failGames / totalGames`).
- `gamesPlayedTarget` - Current day-window count (`windowDays`) used by participation requirement copy (for example `always_guessing`).
- `playerRank` - Same value as core `playerRank`; available in derived namespace for explicit lookup.
- `maxFailGames` - Highest failed-game total among players in the current leaderboard window.

### Badge ID notes
- Deprecated IDs removed from the active manifest: `games_played`, `participation_rate`, `crown_ratio`.
- Current crown-rank series replacing `top_ten_rank`:
  - `crown_wins_1_place` (exactly 1st place).
  - `crown_wins_2-5_place` (2nd through 5th, tiered `3⭐ -> 0⭐` by place).
  - `crown_wins_6-9_place` (6th through 9th, tiered `3⭐ -> 0⭐` by place).
  - `crown_wins_10_place` (exactly 10th place).
- Current participation/conversion badges:
  - `always_guessing` (earned at 15% participation, with icon tiers by participation: `15-44%=0`, `45-64%=1`, `65-84%=2`, `85%+=3`).
  - `crown_conversion` (30% crown conversion threshold).
- Current round-lead tiered badge:
  - `bucket_master` (earned when leading at least one non-`1/6` crown round; tier map: `1 lead=0⚙`, `2=1⚙`, `3=2⚙`, `4+=3⚙`; icon uses `medalIcon: '🥫'` with tier count from qualified round leads).

`insights` keys (present when supplied via `metricSources.insights`):
- `activeCrownStreak` - Current consecutive-day crown streak.
- `bestCrownStreak` - Best consecutive-day crown streak in the current window.
- `avgGuessWhenCrowned` - Average guess number on games where the player was crowned.
- `participationRate` - Fraction of days participated in (`totalGames / windowDays`, usually `0..1`).

`custom` keys:
- Any custom key/value pair you provide via `context.badgeMetricSources.custom` or `opts.metricSources.custom`.

### Core context data
- `player`
- `badgeState`
- `data` object:
  - `data.leaderboard`
  - `data.leaderboardEntry`
  - `data.dataset`
  - `data.rows`
  - `data.metricsMap`

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

## Example Tiered Icon Helper
```js
{
  id: 'always_guessing',
  icon: () => buildLayeredBadgeIcon({
    stars: 3
  }),
  title: 'Always Guessing',
  predicate: (ctx) => ctx.metricNumber('participationRate', 0) >= 0.85
}
```

## Example Custom Icon Swap
```js
icon: () => buildLayeredBadgeIcon({
  stars: 2,
  starsIcon: '🎪',
  medalIcon: '🎱'
})
```

## Example Round Breakdown Placement
```js
{
  id: 'bucket_master',
  icon: (ctx) => buildLayeredBadgeIcon({
    stars: getThresholdTierStars(
      CROWN_GUESS_BUCKETS.filter((bucketKey) => {
        if (bucketKey === '1') return false;
        const playerBuckets = ctx.data.metricsMap.get(ctx.player)?.crownBuckets || {};
        const playerRoundWins = Number(playerBuckets[bucketKey]) || 0;
        if (playerRoundWins <= 0) return false;
        let groupMax = 0;
        ctx.data.metricsMap.forEach((metrics) => {
          const roundWins = Number(metrics?.crownBuckets?.[bucketKey]) || 0;
          if (roundWins > groupMax) groupMax = roundWins;
        });
        return groupMax > 0 && playerRoundWins === groupMax;
      }).length,
      [2, 3, 4],
      3
    ),
    medalIcon: '🥫',
    medalClass: 'badgeIcon--goldBucket'
  }),
  title: 'Bucket Master',
  requirement: 'Lead the group in 👑 wins for at least one non-1/6 round.',
  tierInfo: '0⭐ 1 lead, 1⭐ 2 leads, 2⭐ 3 leads, 3⭐ 4+ leads.',
  progress: (ctx) => {
    const playerBuckets = ctx.data.metricsMap.get(ctx.player)?.crownBuckets || {};
    const qualifiedRounds = CROWN_GUESS_BUCKETS.filter((bucketKey) => {
      if (bucketKey === '1') return false;
      const playerRoundWins = Number(playerBuckets[bucketKey]) || 0;
      if (playerRoundWins <= 0) return false;
      let groupMax = 0;
      ctx.data.metricsMap.forEach((metrics) => {
        const roundWins = Number(metrics?.crownBuckets?.[bucketKey]) || 0;
        if (roundWins > groupMax) groupMax = roundWins;
      });
      return groupMax > 0 && playerRoundWins === groupMax;
    });
    if (!qualifiedRounds.length) return 'No non-1/6 round leads yet';
    const tierCount = getThresholdTierStars(qualifiedRounds.length, [2, 3, 4], 3);
    return `Leading rounds: ${qualifiedRounds.map((key) => `${key}/6`).join(', ')}. Tier: ${tierCount}⚙`;
  },
  roundBreakdownSlots: (ctx) => {
    const playerBuckets = ctx.data.metricsMap.get(ctx.player)?.crownBuckets || {};
    return CROWN_GUESS_BUCKETS.filter((bucketKey) => {
      const playerRoundWins = Number(playerBuckets[bucketKey]) || 0;
      if (playerRoundWins <= 0) return false;
      let groupMax = 0;
      ctx.data.metricsMap.forEach((metrics) => {
        const roundWins = Number(metrics?.crownBuckets?.[bucketKey]) || 0;
        if (roundWins > groupMax) groupMax = roundWins;
      });
      return groupMax > 0 && playerRoundWins === groupMax;
    }).map((round) => ({ round, column: 'crownWins' }));
  },
  predicate: (ctx) => {
    const playerBuckets = ctx.data.metricsMap.get(ctx.player)?.crownBuckets || {};
    return CROWN_GUESS_BUCKETS.some((bucketKey) => {
      if (bucketKey === '1') return false;
      const playerRoundWins = Number(playerBuckets[bucketKey]) || 0;
      if (playerRoundWins <= 0) return false;
      let groupMax = 0;
      ctx.data.metricsMap.forEach((metrics) => {
        const roundWins = Number(metrics?.crownBuckets?.[bucketKey]) || 0;
        if (roundWins > groupMax) groupMax = roundWins;
      });
      return groupMax > 0 && playerRoundWins === groupMax;
    });
  }
}
```

## Adding New Metrics for Future Badges
You no longer need to expand top-level `ctx` fields.

1. Put new values into one of these inputs when resolving badges:
   - `context.badgeMetricSources`
   - `opts.metricSources`
2. Read the metric in predicates via `ctx.metric('yourMetric')` or `ctx.metricNumber('yourMetric')`.
3. If needed, access a specific namespace with dot notation (`ctx.metric('insights.participationRate')`).
4. Do not use legacy aliases (for example `opts.insights`); only `metricSources` is supported.

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
2. Keep entry-specific logic in the entry itself; only extract helpers when reused by multiple entries.
3. Update `tests/badges.test.js` for predicate behavior and ordering.
4. Run `npm test`.
5. Smoke test in browser: row selection, earned/locked visuals, and expand/collapse details.
6. If `roundBreakdownSlots` changed, verify inline table badges appear beside the targeted Round Breakdown values and that clicking the table icon opens the corresponding badge tile.
7. Update `README.md` if user-facing terminology changes.

Keep badge updates atomic: manifest change + tests + docs in one commit.
