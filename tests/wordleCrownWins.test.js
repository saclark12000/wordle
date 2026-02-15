const test = require('node:test');
const assert = require('node:assert/strict');

const { wordleCrownWins } = require('../crownWinsCore');

test('wordleCrownWins sorts by crown wins then name', () => {
  const dataset = [
    { player: '@ace', isCrown: true },
    { player: '@ace', isCrown: false },
    { player: '@buck', isCrown: true },
    { player: '@buck', isCrown: true },
    { player: '@cara', isCrown: false }
  ];
  const leaderboard = wordleCrownWins(dataset, 5);
  assert.equal(leaderboard.length, 3);
  assert.deepEqual(leaderboard[0], {
    place: 1,
    player: '@buck',
    totalGames: 2,
    winCount: 2,
    ratio: 1
  });
  assert.equal(leaderboard[1].player, '@ace');
  assert.equal(leaderboard[1].winCount, 1);
  assert.equal(leaderboard[2].ratio, 0);
});

