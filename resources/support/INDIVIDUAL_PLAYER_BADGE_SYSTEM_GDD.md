# Individual Player Badge System GDD

Version: 1.0
Last Updated: 2026-03-13
Status: Implemented tuning pass, pending live playtest validation

## Changelog
- v1.0 (2026-03-13): Added `steady_solver`, added sample-size gates to ratio/average badges, retuned `failed_games` around fail rate instead of raw volume, and changed `badge_collector` to count progression badges only.

## Design Pillars
- Reward behaviors players can intentionally improve, not just raw time served.
- Keep early unlocks attainable, but make mastery tiers meaningfully narrower.
- Avoid letting joke or onboarding badges dominate a player's badge identity.
- Show progress in plain language so the next target is obvious.

## Current System Analysis
Before this pass, the individual badge board had three balance problems:

1. Volume was over-rewarded.
   `failed_games` and the old `efficient_crowns` thresholds were so permissive that they became close to default badges in the sample dataset.

2. Small samples distorted skill badges.
   A player with only a few games or crowns could qualify for ratio-based badges too easily.

3. `badge_collector` was inflated by temporary or joke beats.
   New-player and fail-state badges counted the same as sustained skill badges, which made the collector reward noisy.

## Fun Hypothesis
If the badge board recognizes reliability, skill expression, and player identity separately, players will read the board as a story about how they play instead of a pile of random unlocks.

## Balance Targets
These are live tuning values, not forever values. Revisit after the next real group playtest.

Variable | Value | Rationale
--- | --- | ---
`steady_solver` unlock | `solveRate >= 0.75` with `10+` games | Gives non-crown leaders a positive progression lane while filtering out tiny samples.
`steady_solver` tiers | `0.85`, `0.92`, `0.97` | Wide first tier, narrow mastery tiers.
`crown_win_ratio` minimum sample | `10+` games | Prevents 1-for-1 or 2-for-3 streaks from reading as stable skill.
`efficient_crowns` unlock | `10+` crowns and crowned average `<= 3.5` | Makes the badge about sustained crown efficiency, not a short hot streak.
`efficient_crowns` mastery tiers | `<= 3.3`, `<= 3.1`, `<= 2.8` | Each tier requires visibly cleaner crowned wins.
`failed_games` unlock | `failRate >= 0.10` with `10+` games | Keeps the comedic fail badge visible without making it universal.
`failed_games` tiers | `0.18`, `0.26`, `0.35` fail rate | Uses proportional pain, not only long-session accumulation.
`badge_collector` threshold | `5` progression badges | Still reachable, but now reflects sustained achievement instead of filler.

## Sample Dataset Readout
The shipped sample data moved in the intended direction after the pass:

- `failed_games`: 18 players -> 10 players
- `efficient_crowns`: 16 players -> 8 players
- `badge_collector`: 12 players -> 11 players, with progression-only counting
- `steady_solver`: 13 players

Interpretation:
- The board now has a broader positive middle lane (`steady_solver`).
- The comedy/failure lane is no longer nearly universal.
- The collector badge still appears often enough to feel reachable, but it no longer counts onboarding/comedy noise.

## Mechanic Specs
## Mechanic: Steady Solver
Purpose: Reward reliable puzzle completion even when a player is not a crown leader.
Player Experience Goal: "I may not win the crown every day, but I am dependable."
Input: `solveRate`, `totalGames`
Output: Earned badge plus 0-3 tier icon
Success Condition: Player has `10+` games and solves at least `75%` of them
Failure State: Badge stays locked and shows current solve rate
Edge Cases:
- If the player has fewer than 10 games, the badge stays locked even at 100 percent solve rate
- If solve rate is exactly on a threshold, award the higher matching tier
Tuning Levers: minimum games, unlock rate, mastery tier rates
Dependencies: normalized player rows, derived metrics in `buildBadgeContext`

## Mechanic: Efficient Crowns
Purpose: Reward sustained crown quality instead of one lucky crown streak.
Player Experience Goal: "When I win, I win clean."
Input: `avgGuessWhenCrowned`, `crownWins`
Output: Earned badge plus 0-3 mastery tier
Success Condition: Player has `10+` crowns and average crowned guesses `<= 3.5`
Failure State: Badge stays locked; progress shows current average and crown count
Edge Cases:
- No crowned wins returns "No crowned wins yet."
- Fewer than 10 crowns never unlocks the badge, even with a low average
Tuning Levers: minimum crowns, unlock average, mastery averages
Dependencies: insight metric injection from `computePlayerInsights`

## Mechanic: Badge Collector
Purpose: Celebrate broad engagement with meaningful progression badges.
Player Experience Goal: "My shelf shows range, not filler."
Input: earned badge list plus `collectorEligible` flag
Output: Collector badge progress and unlock state
Success Condition: At least 5 earned badges where `collectorEligible !== false`
Failure State: Progress updates, but onboarding/comedy badges do not move the counter
Edge Cases:
- `badge_collector` does not count itself
- New manifest entries count by default unless explicitly opted out
Tuning Levers: threshold count, entry-level eligibility flag
Dependencies: `evaluateBadges()` badge-state aggregation

## Mechanic: Failed Games
Purpose: Preserve a comedic fail-state badge without letting it become a default unlock.
Player Experience Goal: "This is a funny scar, not the main thing the game says about me."
Input: `failRate`, `failGames`, `totalGames`
Output: Earned badge plus 0-3 severity tier
Success Condition: Player has `10+` games and fail rate `>= 10%`
Failure State: Locked badge still shows current fail rate and count
Edge Cases:
- Small samples do not qualify even with a high fail rate
- A locked badge can still display a higher future tier based on current rate
Tuning Levers: minimum games, unlock fail rate, tier fail rates
Dependencies: derived fail metrics in `buildBadgeContext`

## Playtest Checks
- Do mid-skill players notice `steady_solver` as a reason to keep playing?
- Does `badge_collector` now feel earned rather than automatic?
- Do players read `failed_games` as playful flavor instead of punishment?
- Are `efficient_crowns` and `crown_win_ratio` now rare enough to feel prestigious without disappearing?

## Failure Conditions To Watch
- More than 70 percent of active players earning the same non-onboarding badge
- More than 40 percent of players earning `badge_collector` from mostly negative/comedy badges
- Ratio badges being earned by players with obviously tiny samples
- Badge board skewing too hard toward crown leaders and ignoring reliable non-leaders
