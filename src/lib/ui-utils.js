const DAY_MS = 24 * 60 * 60 * 1000;
const GUESS_ORDER = ['1', '2', '3', '4', '5', '6', 'X'];

export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function sanitizeLeaderboardLimit(value, fallback = 25) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return clamp(Math.floor(numeric), 3, 50);
}

export function sanitizeLastDays(value, totalDays) {
  const days = Number(totalDays) || 0;
  const numeric = Number(value);
  if (!days) return 0;
  if (!Number.isFinite(numeric) || numeric <= 0) return days;
  return clamp(Math.floor(numeric), 1, days);
}

function getDayValue(row) {
  const timestamp = Number(row?.dayTimestamp);
  if (Number.isFinite(timestamp)) {
    const dayIndex = Number(row?.dayIndex) || 0;
    return timestamp + dayIndex / 1000;
  }
  const dayIndex = Number(row?.dayIndex);
  return Number.isFinite(dayIndex) ? dayIndex : 0;
}

export function buildDayEntries(rows) {
  const seen = new Map();
  rows.forEach((row) => {
    if (!row) return;
    const key = row.dayKey || String(row.dayIndex);
    if (!seen.has(key)) {
      seen.set(key, {
        key,
        label: row.dayLabel || `Day ${row.dayIndex}`,
        value: getDayValue(row),
        rowIndex: typeof row.sourceRowIndex === 'number' ? row.sourceRowIndex : null
      });
    }
  });
  return [...seen.values()].sort((a, b) => a.value - b.value);
}

export function getLastDaysWindow(rows, requestedDays) {
  const data = Array.isArray(rows) ? rows : [];
  const dayEntries = buildDayEntries(data);
  const totalDays = dayEntries.length;
  const windowDays = sanitizeLastDays(requestedDays, totalDays);

  if (!totalDays) {
    return {
      data: [],
      limit: 0,
      maxDays: 0,
      selectedDayKeys: new Set(),
      selectedRowIndexes: new Set(),
      latestLabel: '',
      rowCount: 0
    };
  }

  const selectedEntries = dayEntries.slice(totalDays - windowDays);
  const selectedDayKeys = new Set(selectedEntries.map((entry) => entry.key));
  const selectedRowIndexes = new Set(
    selectedEntries
      .map((entry) => entry.rowIndex)
      .filter((rowIndex) => rowIndex !== null && rowIndex !== undefined)
  );

  return {
    data: data.filter((row) => selectedDayKeys.has(row.dayKey || String(row.dayIndex))),
    limit: windowDays,
    maxDays: totalDays,
    selectedDayKeys,
    selectedRowIndexes,
    latestLabel: selectedEntries.length ? selectedEntries[selectedEntries.length - 1].label : '',
    rowCount: selectedRowIndexes.size
  };
}

export function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function renderSimpleMarkdown(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let inCode = false;
  let inList = false;
  let inOrderedList = false;
  let inParagraph = false;

  const closeParagraph = () => {
    if (!inParagraph) return;
    html.push('</p>');
    inParagraph = false;
  };

  const closeList = () => {
    if (!inList) return;
    html.push('</ul>');
    inList = false;
  };

  const closeOrderedList = () => {
    if (!inOrderedList) return;
    html.push('</ol>');
    inOrderedList = false;
  };

  const applyInlineMarkdown = (text) => {
    const escaped = escapeHtml(text);
    return escaped
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>');
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      closeParagraph();
      closeList();
      closeOrderedList();
      html.push(inCode ? '</code></pre>' : '<pre><code>');
      inCode = !inCode;
      continue;
    }

    if (inCode) {
      html.push(`${escapeHtml(line)}\n`);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      closeParagraph();
      closeList();
      closeOrderedList();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      closeParagraph();
      closeList();
      closeOrderedList();
      const level = Math.min(4, headingMatch[1].length + 1);
      html.push(`<h${level}>${applyInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const listMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (listMatch) {
      closeParagraph();
      closeOrderedList();
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${applyInlineMarkdown(listMatch[1])}</li>`);
      continue;
    }

    const orderedListMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (orderedListMatch) {
      closeParagraph();
      closeList();
      if (!inOrderedList) {
        html.push('<ol>');
        inOrderedList = true;
      }
      html.push(`<li>${applyInlineMarkdown(orderedListMatch[1])}</li>`);
      continue;
    }

    if (!inParagraph) {
      closeList();
      closeOrderedList();
      html.push('<p>');
      inParagraph = true;
    } else {
      html.push(' ');
    }
    html.push(applyInlineMarkdown(trimmed));
  }

  if (inCode) {
    html.push('</code></pre>');
  }
  closeParagraph();
  closeList();
  closeOrderedList();

  return html.join('');
}

export function computePlayerInsights(metrics, opts = {}) {
  const windowDays = Number(opts.windowDays) || 0;
  const rows =
    (Array.isArray(opts.rows) && opts.rows.length ? opts.rows : null) ||
    (metrics && Array.isArray(metrics.rows) ? metrics.rows : []) ||
    [];
  const byDay = new Map();

  rows.forEach((row) => {
    if (!row) return;
    const key = row.dayKey || `day-${row.dayIndex}`;
    const timestamp = Number(row.dayTimestamp) || Number(row.dayIndex) || 0;
    const existing = byDay.get(key);
    if (existing) {
      existing.isCrown = existing.isCrown || !!row.isCrown;
      existing.timestamp = Math.min(existing.timestamp, timestamp);
      return;
    }
    byDay.set(key, { isCrown: !!row.isCrown, timestamp });
  });

  const timeline = [...byDay.values()].sort((a, b) => a.timestamp - b.timestamp);
  let activeStreak = 0;
  let bestStreak = 0;
  let previousTimestamp = null;

  timeline.forEach((day) => {
    if (!day.isCrown) {
      activeStreak = 0;
      previousTimestamp = day.timestamp;
      return;
    }

    const isSequential =
      previousTimestamp !== null && Math.abs(day.timestamp - previousTimestamp) <= DAY_MS * 1.5;
    activeStreak = isSequential ? activeStreak + 1 : 1;
    bestStreak = Math.max(bestStreak, activeStreak);
    previousTimestamp = day.timestamp;
  });

  const crownRows = rows.filter((row) => row && row.isCrown && Number.isFinite(row.guesses));
  const avgGuessWhenCrowned = crownRows.length
    ? crownRows.reduce((sum, row) => sum + Number(row.guesses || 0), 0) / crownRows.length
    : null;
  const participationRate =
    windowDays > 0 && metrics && metrics.totalGames
      ? Math.min(1, metrics.totalGames / windowDays)
      : 0;

  return {
    activeCrownStreak: activeStreak,
    bestCrownStreak: bestStreak,
    avgGuessWhenCrowned,
    participationRate
  };
}

function getRoundBreakdownCellBadges(roundBreakdownBadges, column, round) {
  if (!roundBreakdownBadges || typeof roundBreakdownBadges !== 'object') return [];
  const columnEntries = roundBreakdownBadges[column];
  if (!columnEntries || typeof columnEntries !== 'object') return [];
  const key = String(round || '').toUpperCase();
  const badges = columnEntries[key];
  return Array.isArray(badges) ? badges.filter(Boolean) : [];
}

function buildRoundBreakdownCellBadgeMarkup(roundBreakdownBadges, column, round) {
  const badges = getRoundBreakdownCellBadges(roundBreakdownBadges, column, round);
  if (!badges.length) return '';
  const items = badges
    .map((badge) => {
      if (!badge || !badge.icon) return '';
      const tooltip = [badge.text, badge.progress, badge.requirement, badge.description]
        .filter(Boolean)
        .join(' - ');
      const label = badge.ariaLabel || [badge.text, badge.progress, badge.requirement].filter(Boolean).join('. ');
      const actionLabel = badge.text
        ? `Open ${badge.text} badge details`
        : label
          ? `Open badge details: ${label}`
          : 'Open badge details';
      const titleAttr = tooltip ? ` title="${escapeHtml(tooltip)}"` : '';
      const labelAttr = ` aria-label="${escapeHtml(actionLabel)}"`;
      const idAttr = badge.id ? ` data-round-badge-id="${escapeHtml(badge.id)}"` : '';
      return `<button type="button" class="playerCard__tableBadge"${titleAttr}${labelAttr}${idAttr}>${badge.icon}</button>`;
    })
    .filter(Boolean)
    .join('');

  return items ? `<span class="playerCard__tableBadgeWrap">${items}</span>` : '';
}

function formatGuessLabel(guessKey) {
  return guessKey === 'X' ? 'X/6 (fail)' : `${guessKey}/6`;
}

function buildRoundBreakdownRowData(metrics, roundBreakdownBadges) {
  const rowData = GUESS_ORDER.map((guessKey) => ({
    guessKey,
    label: formatGuessLabel(guessKey),
    total: metrics.buckets[guessKey] || 0,
    crown: metrics.crownBuckets[guessKey] || 0,
    crownBadges: buildRoundBreakdownCellBadgeMarkup(roundBreakdownBadges, 'crownWins', guessKey)
  }));
  const highestTotal = Math.max(...rowData.map((row) => row.total), 0);
  const highestCrown = Math.max(...rowData.map((row) => row.crown), 0);
  return rowData.map((row) => ({
    ...row,
    isHighestTotal: highestTotal > 0 && row.total === highestTotal,
    isHighestCrown: highestCrown > 0 && row.crown === highestCrown
  }));
}

export function buildPlayerStatsMarkup(player, metrics, badgeMarkup, roundBreakdownBadges = null) {
  const rows = buildRoundBreakdownRowData(metrics, roundBreakdownBadges)
    .map(
      (row) => `
      <tr id="playerCardRow_${row.guessKey}">
        <td>${row.label}</td>
        <td>
          <span class="playerCard__tableMetric">
            <span class="playerCard__tablePrefix">
              <span
                id="playerCardTotalHighlight_${row.guessKey}"
                class="${row.isHighestTotal ? 'playerCard__total--highlight_visible' : 'playerCard__total--highlight_hidden'}"
                ${row.isHighestTotal ? 'title="Highest total wins for this player"' : ''}
              >&#8593;</span>
            </span>
            <span class="playerCard__tableNumber">${row.total}</span>
            <span class="playerCard__tableSuffix"></span>
          </span>
        </td>
        <td id="playerCardCrown_${row.guessKey}">
          <span class="playerCard__tableMetric">
            <span class="playerCard__tablePrefix">
              <span
                id="playerCardCrownHighlight_${row.guessKey}"
                class="${row.isHighestCrown ? 'playerCard__crown--highlight_visible' : 'playerCard__crown--highlight_hidden'}"
                ${row.isHighestCrown ? 'title="Highest crown wins for this player"' : ''}
              >&#8593;</span>
            </span>
            <span class="playerCard__tableNumber">${row.crown}</span>
            <span class="playerCard__tableSuffix">${row.crownBadges}</span>
          </span>
        </td>
      </tr>
    `
    )
    .join('');

  const badgeBlock = badgeMarkup
    ? `<div class="playerCard__badgeWrap">${badgeMarkup}</div>`
    : '<div class="status">No badges available for this player.</div>';

  return `
    <div class="playerCard">
      <div class="playerCard__header">
        <div class="playerCard__title">${escapeHtml(player)}</div>
        <button class="panelActionBtn" type="button" data-crown-group-panel="true" aria-label="Close player details">&times;</button>
      </div>
      ${badgeBlock}
      <div class="playerCard__badgeGroupTitle">Round Breakdown</div>
      <table class="playerCard__table">
        <thead><tr><th>Round</th><th>Wins</th><th>Crown Wins</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

export function toggleBadgeExpansion(badge) {
  if (!badge || !badge.classList.contains('playerCard__badge--expandable')) return;
  const willExpand = !badge.classList.contains('playerCard__badge--expanded');
  const wrap = badge.closest('.playerCard__badgeWrap');
  if (willExpand && wrap) {
    wrap.querySelectorAll('.playerCard__badge--expanded').forEach((item) => {
      if (item === badge) return;
      item.classList.remove('playerCard__badge--expanded');
      item.setAttribute('aria-expanded', 'false');
    });
  }
  const expanded = badge.classList.toggle('playerCard__badge--expanded');
  badge.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

export function collapseBadgeExpansion(badge) {
  if (!badge || !badge.classList.contains('playerCard__badge--expandable')) return;
  badge.classList.remove('playerCard__badge--expanded');
  badge.setAttribute('aria-expanded', 'false');
}

export function expandEarnedBadgeById(badgeId, root = document) {
  if (!badgeId || !root || typeof root.querySelectorAll !== 'function') return false;
  const allBadges = Array.from(root.querySelectorAll('[data-player-badge][data-badge-id]'));
  if (!allBadges.length) return false;
  const earnedBadge = allBadges.find(
    (badge) => badge.dataset.badgeId === badgeId && badge.dataset.badgeEarned === 'true'
  );
  const targetBadge = earnedBadge || allBadges.find((badge) => badge.dataset.badgeId === badgeId);
  if (!targetBadge) return false;
  if (!targetBadge.classList.contains('playerCard__badge--expanded')) {
    toggleBadgeExpansion(targetBadge);
  } else {
    targetBadge.setAttribute('aria-expanded', 'true');
  }
  if (typeof targetBadge.focus === 'function') {
    targetBadge.focus();
  }
  return true;
}

export function downloadText(filename, text) {
  const serialized = `\ufeff${text}`;
  const blob = new Blob([serialized], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function buildNormalizedCsvText(normalizedRows) {
  const header = ['dayIndex', 'player', 'guesses', 'solved', 'isCrown', 'crownRound'];
  const lines = [header.join(',')];

  normalizedRows.forEach((row) => {
    const serializedRow = header
      .map((key) => {
        const value = row[key];
        if (value === null || value === undefined) return '';
        const stringValue = String(value).replaceAll('"', '""');
        return /[",\n]/.test(stringValue) ? `"${stringValue}"` : stringValue;
      })
      .join(',');
    lines.push(serializedRow);
  });

  return lines.join('\n');
}
