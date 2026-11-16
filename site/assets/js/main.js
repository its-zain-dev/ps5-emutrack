import { escapeHtml, renderMarkdown } from './markdown.js';

const REPO = 'https://github.com/its-zain-dev/ps5-emutrack';
const SUBMIT_URL = `${REPO}/issues/new?template=submit-emulator.yml`;
const REPORT_URL = `${REPO}/issues/new?template=compatibility-report.yml`;

const MATRIX_COLUMNS = ['kytyps5', 'sharpemu', 'anyps5', 'prosperity', 'shadps4'];
const STATUS_RANK = { nothing: 0, boots: 1, menus: 2, ingame: 3, playable: 4 };

const DAY_MS = 86_400_000;
const ACTIVE_DAYS = 60;
const QUIET_DAYS = 180;
const WEEKLY_DAYS = 7;

const els = {
  stats: document.getElementById('stats'),
  footerUpdated: document.getElementById('footer-updated'),
  filters: document.getElementById('emu-filters'),
  chips: document.getElementById('category-chips'),
  emuCount: document.getElementById('emu-count'),
  emuGrid: document.getElementById('emu-grid'),
  gameSearch: document.getElementById('game-search'),
  showUnverified: document.getElementById('show-unverified'),
  legend: document.getElementById('legend'),
  compatTable: document.getElementById('compat-table'),
  compatEmpty: document.getElementById('compat-empty'),
  submitLink: document.getElementById('submit-link'),
  reportLink: document.getElementById('report-link'),
  reportLink2: document.getElementById('report-link-2'),
  dialog: document.getElementById('release-dialog'),
  dialogTitle: document.getElementById('dialog-title'),
  dialogSub: document.getElementById('dialog-sub'),
  dialogBody: document.getElementById('dialog-body'),
  toast: document.getElementById('toast'),
};

const state = {
  data: null,
  byId: new Map(),
  category: 'all',
  q: '',
  platform: '',
  sort: 'release',
  includeInactive: false,
  gameQuery: '',
  showUnverified: true,
  expandedGames: new Set(),
};

function parseTime(iso) {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function relativeTime(iso) {
  const ms = parseTime(iso);
  if (!ms) return '—';
  const diffSec = Math.round((Date.now() - ms) / 1000);
  if (diffSec < 60) return 'just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

function formatDate(iso) {
  const ms = parseTime(iso);
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  return `${val >= 10 || idx === 0 ? Math.round(val) : val.toFixed(1)} ${units[idx]}`;
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString();
}

function safeHttps(url) {
  return typeof url === 'string' && url.startsWith('https://') ? url : null;
}

function lastTouchMs(emu) {
  return Math.max(parseTime(emu.github?.pushedAt), parseTime(emu.release?.publishedAt));
}

function isWithinDays(iso, days) {
  const ms = parseTime(iso);
  return ms > 0 && Date.now() - ms <= days * DAY_MS;
}

function getActivity(emu) {
  if (emu.github?.archived) {
    return { state: 'dormant', label: 'Archived' };
  }
  const latest = lastTouchMs(emu);
  if (!latest) {
    return { state: 'dormant', label: 'Inactive' };
  }
  const ageDays = (Date.now() - latest) / DAY_MS;
  if (ageDays <= ACTIVE_DAYS) return { state: 'active', label: 'Active' };
  if (ageDays <= QUIET_DAYS) return { state: 'slowing', label: 'Quiet' };
  return { state: 'dormant', label: 'Inactive' };
}

function showToast(msg) {
  if (!els.toast) return;
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    els.toast.hidden = true;
  }, 4000);
}

function wireStaticLinks() {
  if (els.submitLink) els.submitLink.href = SUBMIT_URL;
  if (els.reportLink) els.reportLink.href = REPORT_URL;
  if (els.reportLink2) els.reportLink2.href = REPORT_URL;
}

function renderStats(data) {
  const weeklyCount = data.emulators.filter((e) => isWithinDays(e.release?.publishedAt, WEEKLY_DAYS)).length;
  const verifiedCount = data.reports.filter((r) => r.verified).length;
  const totalReports = data.reports.length;

  const setStat = (key, value, title = '') => {
    const el = els.stats?.querySelector(`[data-stat="${key}"]`);
    if (!el) return;
    el.textContent = value;
    if (title) el.title = title;
  };

  setStat('projects', formatNumber(data.emulators.length));
  setStat('weekly', formatNumber(weeklyCount));
  setStat(
    'reports',
    `${formatNumber(totalReports)}`,
    `${verifiedCount} verified · ${totalReports - verifiedCount} unverified`,
  );
  setStat('updated', relativeTime(data.generatedAt), data.generatedAt || '');

  if (els.footerUpdated && data.generatedAt) {
    els.footerUpdated.textContent = `Updated ${relativeTime(data.generatedAt)}`;
    els.footerUpdated.title = data.generatedAt;
  }
}

function renderCategoryChips(data) {
  if (!els.chips) return;
  const counts = { all: data.emulators.length };
  for (const cat of Object.keys(data.categories)) counts[cat] = 0;
  for (const emu of data.emulators) {
    counts[emu.category] = (counts[emu.category] || 0) + 1;
  }

  const items = [['all', 'All'], ...Object.entries(data.categories)];
  els.chips.innerHTML = items
    .map(([key, label]) => {
      const active = state.category === key;
      return `<button type="button" class="chip" role="radio" aria-checked="${active}" data-cat="${escapeHtml(key)}">${escapeHtml(label)}<span class="count">${counts[key] ?? 0}</span></button>`;
    })
    .join('');
}

function filterAndSortEmulators() {
  const query = state.q.trim().toLowerCase();
  const list = state.data.emulators.filter((emu) => {
    if (state.category !== 'all' && emu.category !== state.category) return false;
    if (state.platform && !(emu.platforms || []).includes(state.platform)) return false;
    if (!state.includeInactive && emu.tier !== 'featured' && getActivity(emu).state === 'dormant') {
      return false;
    }
    if (!query) return true;
    const haystack = [
      emu.name,
      emu.repo,
      emu.summary,
      emu.github?.description,
      emu.github?.language,
      ...(emu.github?.topics || []),
      ...(emu.platforms || []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });

  list.sort((a, b) => {
    if (state.sort === 'name') {
      return a.name.localeCompare(b.name);
    }
    if (state.sort === 'stars') {
      return (b.github?.stars || 0) - (a.github?.stars || 0) || a.name.localeCompare(b.name);
    }
    if (state.sort === 'activity') {
      return lastTouchMs(b) - lastTouchMs(a) || (b.github?.stars || 0) - (a.github?.stars || 0);
    }
    // Default 'release': featured first, then newest release, then recent push, then stars.
    const tierDiff = (b.tier === 'featured' ? 1 : 0) - (a.tier === 'featured' ? 1 : 0);
    if (tierDiff !== 0) return tierDiff;
    const relDiff = parseTime(b.release?.publishedAt) - parseTime(a.release?.publishedAt);
    if (relDiff !== 0) return relDiff;
    const pushDiff = lastTouchMs(b) - lastTouchMs(a);
    if (pushDiff !== 0) return pushDiff;
    return (b.github?.stars || 0) - (a.github?.stars || 0);
  });

  return list;
}

function renderEmulators() {
  if (!els.emuGrid || !state.data) return;
  const list = filterAndSortEmulators();
  const total = state.data.emulators.length;
  if (els.emuCount) {
    els.emuCount.textContent = `Showing ${list.length} of ${total} tracked projects`;
  }

  if (list.length === 0) {
    els.emuGrid.innerHTML =
      '<div class="empty">No matching emulators. Try clearing filters or enabling “Include inactive”.</div>';
    return;
  }

  const categories = state.data.categories;
  els.emuGrid.innerHTML = list
    .map((emu) => {
      const owner = emu.repo.split('/')[0];
      const avatarUrl = `https://github.com/${encodeURIComponent(owner)}.png?size=80`;
      const activity = getActivity(emu);
      const gh = emu.github;
      const rel = emu.release;
      const catLabel = categories[emu.category] || emu.category;
      const parent = emu.forkOf ? state.byId.get(emu.forkOf) : null;
      const desc = emu.summary || gh?.description || 'Open-source PlayStation emulation project.';

      const badges = [];
      if (emu.tier === 'featured') badges.push('<span class="badge badge-featured">★ Featured</span>');
      badges.push(`<span class="badge">${escapeHtml(catLabel)}</span>`);
      if (parent) badges.push(`<span class="badge">Based on ${escapeHtml(parent.name)}</span>`);
      if (gh?.archived) badges.push('<span class="badge badge-warn">Archived</span>');
      if (emu.unavailable) badges.push('<span class="badge badge-warn">Repo missing</span>');
      for (const p of emu.platforms || []) {
        badges.push(`<span class="badge">${escapeHtml(p)}</span>`);
      }

      const metaParts = [
        `<span><i class="activity ${activity.state}" aria-hidden="true"></i>${escapeHtml(activity.label)}</span>`,
      ];
      if (gh) {
        metaParts.push(
          `<span title="GitHub stars"><svg aria-hidden="true" viewBox="0 0 16 16" width="13" height="13"><path fill="currentColor" d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/></svg>${formatNumber(gh.stars)}</span>`,
        );
        if (gh.language) metaParts.push(`<span>${escapeHtml(gh.language)}</span>`);
        if (gh.license) metaParts.push(`<span>${escapeHtml(gh.license)}</span>`);
        if (gh.pushedAt) {
          metaParts.push(`<span title="Last push: ${escapeHtml(gh.pushedAt)}">Pushed ${relativeTime(gh.pushedAt)}</span>`);
        }
      }

      const isNewRelease = rel && isWithinDays(rel.publishedAt, WEEKLY_DAYS);
      const releaseHtml = rel
        ? `<div class="release">
            <div class="release-info">
              <span class="release-tag" title="${escapeHtml(rel.tag)}">${escapeHtml(rel.tag)}${isNewRelease ? ' <span class="new-dot">· NEW</span>' : ''}</span>
              <span class="release-date" title="${escapeHtml(rel.publishedAt || '')}">${escapeHtml(formatDate(rel.publishedAt))}${rel.prerelease ? ' · pre-release' : ''}</span>
            </div>
            <button type="button" class="btn btn-ghost btn-sm" data-open-release="${escapeHtml(emu.id)}">Notes &amp; files</button>
          </div>`
        : '<div class="release none">No tagged releases — source only</div>';

      const repoUrl = safeHttps(emu.url) || '#';
      const secondaryAction = rel
        ? `<button type="button" class="btn btn-primary btn-sm" data-open-release="${escapeHtml(emu.id)}">Release notes</button>`
        : `<a class="btn btn-ghost btn-sm" href="${escapeHtml(repoUrl)}/commits" target="_blank" rel="noopener">Commits</a>`;

      return `<article class="card${emu.tier === 'featured' ? ' is-featured' : ''}">
        <div class="card-top">
          <img class="avatar" src="${escapeHtml(avatarUrl)}" alt="" width="40" height="40" loading="lazy" />
          <div class="card-title">
            <h3><a href="${escapeHtml(repoUrl)}" target="_blank" rel="noopener">${escapeHtml(emu.name)}</a></h3>
            <span class="repo" title="${escapeHtml(emu.repo)}">${escapeHtml(emu.repo)}</span>
          </div>
        </div>
        <div class="badges">${badges.join('')}</div>
        <p class="desc">${escapeHtml(desc)}</p>
        <div class="meta">${metaParts.join('')}</div>
        ${releaseHtml}
        <div class="card-actions">
          <a class="btn btn-ghost btn-sm" href="${escapeHtml(repoUrl)}" target="_blank" rel="noopener">Repository</a>
          ${secondaryAction}
        </div>
      </article>`;
    })
    .join('');
}

function openReleaseDialog(emuId) {
  const emu = state.byId.get(emuId);
  if (!emu?.release || !els.dialog) return;
  const rel = emu.release;

  els.dialogTitle.textContent = `${emu.name} · ${rel.name || rel.tag}`;
  const subParts = [rel.tag, formatDate(rel.publishedAt)];
  if (rel.prerelease) subParts.push('Pre-release');
  if (emu.stale) subParts.push('Cached snapshot');
  els.dialogSub.textContent = subParts.filter(Boolean).join(' · ');

  const sections = [];
  if (emu.tier === 'community') {
    sections.push(
      '<p class="notice"><strong>Community listing:</strong> This repository is lightly checked and not maintained by PS5 EmuTrack. Verify source code and release checksums before running executables.</p>',
    );
  }

  const relUrl = safeHttps(rel.url) || safeHttps(emu.url);
  if (rel.assets?.length) {
    const assetItems = rel.assets
      .map((a) => {
        const assetUrl = safeHttps(a.url);
        if (!assetUrl) return '';
        const dlText = a.downloads ? ` · ${formatNumber(a.downloads)} downloads` : '';
        return `<li>
          <a href="${escapeHtml(assetUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.name)}</a>
          <span class="size">${escapeHtml(formatBytes(a.size))}${escapeHtml(dlText)}</span>
        </li>`;
      })
      .filter(Boolean)
      .join('');
    sections.push(`<h4>Files (${rel.assetCount || rel.assets.length})</h4><ul class="assets">${assetItems}</ul>`);
  }

  if (relUrl) {
    sections.push(
      `<p class="small muted" style="margin-top:12px"><a href="${escapeHtml(relUrl)}" target="_blank" rel="noopener noreferrer">Open full release on GitHub ↗</a></p>`,
    );
  }

  sections.push(`<h4>Release notes</h4><div class="notes">${renderMarkdown(rel.notes)}</div>`);
  if (rel.notesTruncated && relUrl) {
    sections.push(
      `<p class="small muted" style="margin-top:10px">Notes truncated — <a href="${escapeHtml(relUrl)}" target="_blank" rel="noopener noreferrer">read the full notes on GitHub</a>.</p>`,
    );
  }

  els.dialogBody.innerHTML = sections.join('');
  els.dialog.showModal();
}

function renderLegend(statuses) {
  if (!els.legend) return;
  els.legend.innerHTML = statuses
    .map((s) => `<li><span class="status ${escapeHtml(s.id)}">${escapeHtml(s.label)}</span></li>`)
    .join('');
}

function pickBestReport(reports) {
  if (!reports.length) return null;
  return reports.reduce((best, cur) => {
    if (!best) return cur;
    if (cur.verified !== best.verified) return cur.verified ? cur : best;
    const rankDiff = (STATUS_RANK[cur.status] ?? -1) - (STATUS_RANK[best.status] ?? -1);
    if (rankDiff !== 0) return rankDiff > 0 ? cur : best;
    return String(cur.date).localeCompare(String(best.date)) > 0 ? cur : best;
  }, null);
}

function renderCompatibility() {
  if (!els.compatTable || !state.data) return;
  const statusLabels = Object.fromEntries(state.data.statuses.map((s) => [s.id, s.label]));
  const columns = MATRIX_COLUMNS.map((id) => state.byId.get(id)).filter(Boolean);
  const query = state.gameQuery.trim().toLowerCase();

  const games = state.data.games.filter((g) => {
    if (!query) return true;
    return [g.title, g.developer, ...(g.aliases || [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(query);
  });

  if (els.compatEmpty) els.compatEmpty.hidden = games.length > 0;

  const headHtml = `<thead><tr>
    <th>Game</th>
    ${columns
      .map(
        (c) =>
          `<th><a href="${escapeHtml(safeHttps(c.url) || '#')}" target="_blank" rel="noopener">${escapeHtml(c.name)}</a></th>`,
      )
      .join('')}
  </tr></thead>`;

  const bodyHtml = games
    .map((game) => {
      const gameReports = state.data.reports.filter(
        (r) => r.game === game.id && (state.showUnverified || r.verified),
      );
      const expanded = state.expandedGames.has(game.id);
      const pills = [];
      if (game.platform) pills.push(`<span class="badge">${escapeHtml(game.platform)}</span>`);
      if (game.releaseDate && parseTime(game.releaseDate) > Date.now()) {
        pills.push(`<span class="pill-upcoming">Upcoming · ${escapeHtml(game.releaseDate)}</span>`);
      }

      const cells = columns
        .map((emu) => {
          const matching = gameReports.filter((r) => r.emulator === emu.id);
          const best = pickBestReport(matching);
          if (!best) return '<td><span class="untested" title="No report">—</span></td>';
          const label = statusLabels[best.status] || best.status;
          const cls = `status ${escapeHtml(best.status)}${best.verified ? '' : ' unverified'}`;
          const tip = best.verified ? 'Verified report' : 'Unverified legacy entry';
          return `<td><span class="${cls}" title="${tip}">${escapeHtml(label)}</span></td>`;
        })
        .join('');

      const reportItems = [...gameReports]
        .sort((a, b) => Number(b.verified) - Number(a.verified) || String(b.date).localeCompare(String(a.date)))
        .map((r) => {
          const emuName = state.byId.get(r.emulator)?.name || r.emulator;
          const label = statusLabels[r.status] || r.status;
          const cls = `status ${escapeHtml(r.status)}${r.verified ? '' : ' unverified'}`;
          const metaBits = [
            `<strong>${escapeHtml(emuName)}</strong>`,
            r.version ? `<code>${escapeHtml(r.version)}</code>` : '',
            r.hardware ? `<span class="muted">${escapeHtml(r.hardware)}</span>` : '',
            `<span class="muted">${escapeHtml(r.date)}</span>`,
            r.verified ? '' : '<span class="unverified-tag">unverified</span>',
          ]
            .filter(Boolean)
            .join(' ');
          const links = [
            safeHttps(r.source)
              ? `<a href="${escapeHtml(r.source)}" target="_blank" rel="noopener">Source issue ↗</a>`
              : '',
            safeHttps(r.evidence)
              ? `<a href="${escapeHtml(r.evidence)}" target="_blank" rel="noopener">Evidence ↗</a>`
              : '',
          ]
            .filter(Boolean)
            .join('');
          return `<li class="report">
            <span class="${cls}">${escapeHtml(label)}</span>
            <div class="report-main">${metaBits}</div>
            ${r.notes ? `<div class="report-notes">${escapeHtml(r.notes)}</div>` : ''}
            ${links ? `<div class="report-links">${links}</div>` : ''}
          </li>`;
        });

      const prefillUrl = `${REPORT_URL}&title=${encodeURIComponent(`[Compatibility] ${game.title}`)}`;
      reportItems.push(
        `<li class="report"><span class="muted small" style="grid-column:2">Have a test result? <a href="${escapeHtml(prefillUrl)}" target="_blank" rel="noopener">Submit a verified report for ${escapeHtml(game.title)} ↗</a></span></li>`,
      );

      const detailContent =
        gameReports.length > 0
          ? `<ul class="reports">${reportItems.join('')}</ul>`
          : `<ul class="reports"><li class="report"><span class="muted small" style="grid-column:2">No ${state.showUnverified ? '' : 'verified '}reports yet. <a href="${escapeHtml(prefillUrl)}" target="_blank" rel="noopener">Submit the first verified report ↗</a></span></li></ul>`;

      return `<tr class="game-row" data-game="${escapeHtml(game.id)}" tabindex="0" role="button" aria-expanded="${expanded}">
          <td>
            <div class="game-title">
              <svg class="chev" aria-hidden="true" viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"/></svg>
              <span>${escapeHtml(game.title)}</span>
              ${pills.join('')}
            </div>
            ${game.developer ? `<div class="game-sub">${escapeHtml(game.developer)}</div>` : ''}
          </td>
          ${cells}
        </tr>
        <tr class="detail-row" data-detail-for="${escapeHtml(game.id)}"${expanded ? '' : ' hidden'}>
          <td colspan="${columns.length + 1}">${detailContent}</td>
        </tr>`;
    })
    .join('');

  els.compatTable.innerHTML = `${headHtml}<tbody>${bodyHtml}</tbody>`;
}

function toggleGameDetail(gameId) {
  if (!gameId) return;
  if (state.expandedGames.has(gameId)) {
    state.expandedGames.delete(gameId);
  } else {
    state.expandedGames.add(gameId);
  }
  const row = els.compatTable?.querySelector(`tr.game-row[data-game="${CSS.escape(gameId)}"]`);
  const detail = els.compatTable?.querySelector(`tr.detail-row[data-detail-for="${CSS.escape(gameId)}"]`);
  if (row && detail) {
    const open = state.expandedGames.has(gameId);
    row.setAttribute('aria-expanded', String(open));
    detail.hidden = !open;
  }
}

function bindEvents() {
  els.chips?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-cat]');
    if (!btn) return;
    state.category = btn.dataset.cat;
    for (const chip of els.chips.querySelectorAll('.chip')) {
      chip.setAttribute('aria-checked', String(chip === btn));
    }
    renderEmulators();
  });

  els.filters?.addEventListener('input', (e) => {
    const t = e.target;
    if (t.name === 'q') state.q = t.value;
    if (t.name === 'platform') state.platform = t.value;
    if (t.name === 'sort') state.sort = t.value;
    if (t.name === 'inactive') state.includeInactive = t.checked;
    renderEmulators();
  });

  els.filters?.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'platform') state.platform = t.value;
    if (t.name === 'sort') state.sort = t.value;
    if (t.name === 'inactive') state.includeInactive = t.checked;
    renderEmulators();
  });

  els.emuGrid?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open-release]');
    if (btn) openReleaseDialog(btn.dataset.openRelease);
  });

  els.dialog?.addEventListener('click', (e) => {
    if (e.target === els.dialog || e.target.closest('[data-close]')) {
      els.dialog.close();
    }
  });

  els.gameSearch?.addEventListener('input', (e) => {
    state.gameQuery = e.target.value;
    renderCompatibility();
  });

  els.showUnverified?.addEventListener('change', (e) => {
    state.showUnverified = e.target.checked;
    renderCompatibility();
  });

  els.compatTable?.addEventListener('click', (e) => {
    const row = e.target.closest('tr.game-row');
    if (!row || e.target.closest('a')) return;
    toggleGameDetail(row.dataset.game);
  });

  els.compatTable?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('tr.game-row');
    if (!row) return;
    e.preventDefault();
    toggleGameDetail(row.dataset.game);
  });
}

async function init() {
  wireStaticLinks();
  bindEvents();

  try {
    const res = await fetch('./data.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.data = data;
    state.byId = new Map(data.emulators.map((e) => [e.id, e]));

    renderStats(data);
    renderCategoryChips(data);
    renderEmulators();
    renderLegend(data.statuses);
    renderCompatibility();
  } catch (err) {
    console.error('Failed to load data.json', err);
    if (els.emuGrid) {
      els.emuGrid.innerHTML =
        '<div class="empty">Could not load tracker data. Try reloading, or check <a href="./data.json">data.json</a>.</div>';
    }
    showToast('Could not load tracker data.');
  }
}

init();
