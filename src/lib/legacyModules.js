import '../../crownWinsCore.js';
import '../../stateManager.js';
import '../../badges.js';
import '../../groupStats.js';

const root = typeof window !== 'undefined' ? window : globalThis;

function requireGlobal(name) {
  const value = root[name];
  if (!value) {
    throw new Error(`${name} failed to load.`);
  }
  return value;
}

export const CrownWinsCore = requireGlobal('CrownWinsCore');
export const CrownState = requireGlobal('CrownState');
export const BadgeSystem = requireGlobal('BadgeSystem');
export const GroupStats = requireGlobal('GroupStats');
