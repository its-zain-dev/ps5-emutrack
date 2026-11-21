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

const DEFAULT_FOLD_LIMIT = 6;
const LOAD_MORE_STEP = 12;
const MAX_COMPARE = 3;

const STORAGE_SAVED = 'ps5_emutrack_saved_v1';
const STORAGE_THEME = 'ps5_emutrack_theme_v1';

const els = {
  headerSearchBtn: document.getElementById('header-search-btn'),
  themeToggle: document.getElementById('theme-toggle'),
  globalSearch: document.getElementById('global-search'),
  globalClear: document.getElementById('global-clear'),
  globalSuggestions: document.getElementById('global-suggestions'),
  quickPicks: document.getElementById('quick-picks'),
  savedQuickCount: document.getElementById('saved-quick-count'),
  stats: document.getElementById('stats'),
  footerUpdated: document.getElementById('footer-updated'),

  viewSwitch: document.getElementById('view-switch'),
  foldEmulatorsBtn: document.getElementById('fold-emulators-btn'),
  emuSectionBody: document.getElementById('emu-section-body'),
  filters: document.getElementById('emu-filters'),
  emuQ: document.getElementById('emu-q'),
  emuQClear: document.getElementById('emu-q-clear'),
  emuSuggestions: document.getElementById('emu-suggestions'),
  chips: document.getElementById('category-chips'),
  emuCount: document.getElementById('emu-count'),
  emuGrid: document.getElementById('emu-grid'),
  emuFoldBar: document.getElementById('emu-fold-bar'),
  resetFiltersBtn: document.getElementById('reset-filters-btn'),
  copyLinkBtn: document.getElementById('copy-link-btn'),
  quickJumpCompat: document.getElementById('quick-jump-compat'),

  foldCompatBtn: document.getElementById('fold-compat-btn'),
  compatSectionBody: document.getElementById('compat-section-body'),
  gameSearch: document.getElementById('game-search'),
  gameClear: document.getElementById('game-clear'),
  gameSuggestions: document.getElementById('game-suggestions'),
  compatStatusFilter: document.getElementById('compat-status-filter'),
  compatEmuFilter: document.getElementById('compat-emu-filter'),
  showUnverified: document.getElementById('show-unverified'),
  toggleAllGamesBtn: document.getElementById('toggle-all-games-btn'),
  legend: document.getElementById('legend'),
  compatTable: document.getElementById('compat-table'),
  compatEmpty: document.getElementById('compat-empty'),

  submitLink: document.getElementById('submit-link'),
  reportLink: document.getElementById('report-link'),
  reportLink2: document.getElementById('report-link-2'),

  compareBar: document.getElementById('compare-bar'),
  compareSummary: document.getElementById('compare-summary'),
  compareOpenBtn: document.getElementById('compare-open-btn'),
  compareClearBtn: document.getElementById('compare-clear-btn'),
  backToTop: document.getElementById('back-to-top'),

  dialog: document.getElementById('release-dialog'),
  dialogTitle: document.getElementById('dialog-title'),
  dialogSub: document.getElementById('dialog-sub'),
  dialogBody: document.getElementById('dialog-body'),
  compareDialog: document.getElementById('compare-dialog'),
  compareDialogBody: document.getElementById('compare-dialog-body'),
  toast: document.getElementById('toast'),
};

function loadJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJsonStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota / private mode failures.
  }
}

const state = {
  data: null,
  byId: new Map(),
  category: 'all', // 'all' | 'featured' | 'saved' | 'ps5' | 'fork' | 'port' | 'ps4'
  q: '',
  platform: '',
  sort: 'release',
  includeInactive: false,
  view: 'cards', // 'cards' | 'compact'
  visibleLimit: DEFAULT_FOLD_LIMIT,
  emulatorsFolded: false,
  compatFolded: false,
  highlightedId: null,

  gameQuery: '',
  compatStatus: '',
  compatEmu: '',
  showUnverified: true,
  expandedGames: new Set(),

  savedIds: new Set(loadJsonStorage(STORAGE_SAVED, [])),
  compareIds: [],
  theme: loadJsonStorage(STORAGE_THEME, 'auto'), // 'auto' | 'dark' | 'light'
};

// ---------------- helpers ----------------

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
  return `${Math.floor(days / 365)}y ago`;
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

function hasEmulatorPage(emu) {
  if (!emu) return false;
  if (emu.tier === 'featured' || emu.release) return true;
  if ((emu.github?.stars || 0) >= 10) return true;
  return Boolean(state.data?.reports.some((r) => r.emulator === emu.id));
}

function lastTouchMs(emu) {
  return Math.max(parseTime(emu.github?.pushedAt), parseTime(emu.release?.publishedAt));
}

function isWithinDays(iso, days) {
  const ms = parseTime(iso);
  return ms > 0 && Date.now() - ms <= days * DAY_MS;
}

function getActivity(emu) {
  if (emu.github?.archived) return { state: 'dormant', label: 'Archived' };
  const latest = lastTouchMs(emu);
  if (!latest) return { state: 'dormant', label: 'Inactive' };
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
  }, 3200);
}

async function copyText(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(okMsg);
  } catch {
    showToast('Copy not permitted by browser.');
  }
}

function detectClientOS() {
  const ua = (navigator.userAgent || '').toLowerCase();
  if (ua.includes('android')) return 'Android';
  if (ua.includes('windows')) return 'Windows';
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'macOS';
  if (ua.includes('linux')) return 'Linux';
  return '';
}

function matchesAssetOS(assetName, os) {
  if (!os) return false;
  const n = String(assetName || '').toLowerCase();
  if (os === 'Windows') return /(win|windows|\.exe$|\.msi$)/.test(n);
  if (os === 'Linux') return /(linux|\.appimage$|\.deb$|\.rpm$)/.test(n);
  if (os === 'macOS') return /(mac|macos|darwin|\.dmg$)/.test(n);
  if (os === 'Android') return /(android|\.apk$)/.test(n);
  return false;
}

// ---------------- fuzzy / token search scoring ----------------

function isSubsequence(needle, hay) {
  if (needle.length < 3 || needle.length > hay.length) return false;
  let i = 0;
  for (let j = 0; j < hay.length && i < needle.length; j += 1) {
    if (hay[j] === needle[i]) i += 1;
  }
  return i === needle.length;
}

function scoreTokens(query, primary, secondaryFields = []) {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const tokens = q.split(/\s+/).filter(Boolean);
  const p = String(primary || '').toLowerCase();
  const secondary = secondaryFields.filter(Boolean).join(' ').toLowerCase();
  const combined = `${p} ${secondary}`;

  let score = 0;
  for (const tok of tokens) {
    if (p.startsWith(tok)) {
      score += 40;
    } else if (p.includes(tok)) {
      score += 25;
    } else if (secondary.includes(tok)) {
      score += 12;
    } else if (isSubsequence(tok, p.replace(/\s+/g, ''))) {
      score += 6;
    } else if (tokens.length === 1 && isSubsequence(tok, combined.replace(/\s+/g, ''))) {
      score += 3;
    } else {
      return 0;
    }
  }
  if (p === q) score += 60;
  return score;
}

function emulatorSearchFields(emu) {
  return [
    emu.repo,
    emu.summary,
    emu.github?.description,
    emu.github?.language,
    state.data?.categories?.[emu.category],
    ...(emu.github?.topics || []),
    ...(emu.platforms || []),
  ];
}

// ---------------- theme & URL sync ----------------

function applyTheme(theme) {
  state.theme = theme;
  saveJsonStorage(STORAGE_THEME, theme);
  const root = document.documentElement;
  if (theme === 'dark' || theme === 'light') {
    root.dataset.theme = theme;
  } else {
    delete root.dataset.theme;
  }
  if (els.themeToggle) {
    const labels = { auto: 'Theme: Auto (click for Dark)', dark: 'Theme: Dark (click for Light)', light: 'Theme: Light (click for Auto)' };
    els.themeToggle.title = labels[theme] || 'Switch theme';
    els.themeToggle.setAttribute('aria-label', labels[theme] || 'Switch theme');
  }
}

function cycleTheme() {
  const order = ['auto', 'dark', 'light'];
  const next = order[(order.indexOf(state.theme) + 1) % order.length];
  applyTheme(next);
  showToast(`Theme set to ${next}`);
}

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('cat')) state.category = params.get('cat');
  if (params.get('q')) state.q = params.get('q');
  if (params.get('platform')) state.platform = params.get('platform');
  if (params.get('sort')) state.sort = params.get('sort');
  if (params.get('inactive') === '1') state.includeInactive = true;
  if (params.get('view') === 'compact') state.view = 'compact';
  if (params.get('game')) state.gameQuery = params.get('game');
  if (params.get('status')) state.compatStatus = params.get('status');
  if (params.get('emu')) state.compatEmu = params.get('emu');
  if (params.get('unverified') === '0') state.showUnverified = false;
}

function writeUrlState() {
  const params = new URLSearchParams();
  if (state.category !== 'all') params.set('cat', state.category);
  if (state.q.trim()) params.set('q', state.q.trim());
  if (state.platform) params.set('platform', state.platform);
  if (state.sort !== 'release') params.set('sort', state.sort);
  if (state.includeInactive) params.set('inactive', '1');
  if (state.view !== 'cards') params.set('view', state.view);
  if (state.gameQuery.trim()) params.set('game', state.gameQuery.trim());
  if (state.compatStatus) params.set('status', state.compatStatus);
  if (state.compatEmu) params.set('emu', state.compatEmu);
  if (!state.showUnverified) params.set('unverified', '0');

  const qs = params.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
  history.replaceState(null, '', url);
}

function syncFilterControls() {
  if (els.emuQ) els.emuQ.value = state.q;
  if (els.emuQClear) els.emuQClear.hidden = !state.q;
  if (els.filters) {
    const platSel = els.filters.elements.platform;
    const sortSel = els.filters.elements.sort;
    const inactiveChk = els.filters.elements.inactive;
    if (platSel) platSel.value = state.platform;
    if (sortSel) sortSel.value = state.sort;
    if (inactiveChk) inactiveChk.checked = state.includeInactive;
  }
  if (els.viewSwitch) {
    for (const btn of els.viewSwitch.querySelectorAll('.seg-btn')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.view === state.view));
    }
  }
  if (els.gameSearch) els.gameSearch.value = state.gameQuery;
  if (els.gameClear) els.gameClear.hidden = !state.gameQuery;
  if (els.compatStatusFilter) els.compatStatusFilter.value = state.compatStatus;
  if (els.compatEmuFilter) els.compatEmuFilter.value = state.compatEmu;
  if (els.showUnverified) els.showUnverified.checked = state.showUnverified;
  if (els.savedQuickCount) els.savedQuickCount.textContent = String(state.savedIds.size);

  if (els.quickPicks) {
    for (const chip of els.quickPicks.querySelectorAll('[data-quick]')) {
      const k = chip.dataset.quick;
      let active = false;
      if (k === 'featured') active = state.category === 'featured';
      else if (k === 'saved') active = state.category === 'saved';
      else if (k.startsWith('platform:')) active = state.platform === k.split(':')[1];
      chip.setAttribute('aria-pressed', String(active));
    }
  }

  const hasFilters =
    state.category !== 'all' ||
    Boolean(state.q.trim()) ||
    Boolean(state.platform) ||
    state.sort !== 'release' ||
    state.includeInactive;
  if (els.resetFiltersBtn) els.resetFiltersBtn.hidden = !hasFilters;
}

// ---------------- autocomplete combobox helper ----------------

function attachAutocomplete({ input, clearBtn, listEl, getGroups, onSelect, onInput }) {
  if (!input || !listEl) return;
  let activeIndex = -1;
  let flatItems = [];

  const close = () => {
    listEl.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    activeIndex = -1;
  };

  const renderList = () => {
    const groups = getGroups(input.value).filter((g) => g.items.length > 0);
    flatItems = [];
    if (!groups.length) {
      close();
      return;
    }
    const htmlParts = [];
    for (const group of groups) {
      htmlParts.push(`<div class="suggestion-group">${escapeHtml(group.label)}</div>`);
      for (const item of group.items) {
        const idx = flatItems.length;
        flatItems.push(item);
        const optId = `${listEl.id}-opt-${idx}`;
        htmlParts.push(
          `<button type="button" id="${optId}" class="suggestion-item" role="option" aria-selected="${idx === activeIndex}" data-opt-idx="${idx}">
            <span class="suggestion-main">
              <span class="suggestion-title">${escapeHtml(item.title)}</span>
              ${item.sub ? `<span class="suggestion-sub">${escapeHtml(item.sub)}</span>` : ''}
            </span>
            ${item.badge ? `<span class="suggestion-kind">${escapeHtml(item.badge)}</span>` : ''}
          </button>`,
        );
      }
    }
    listEl.innerHTML = htmlParts.join('');
    listEl.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  const highlight = (nextIdx) => {
    if (!flatItems.length) return;
    activeIndex = (nextIdx + flatItems.length) % flatItems.length;
    const opts = listEl.querySelectorAll('.suggestion-item');
    opts.forEach((opt, i) => {
      const sel = i === activeIndex;
      opt.setAttribute('aria-selected', String(sel));
      if (sel) {
        input.setAttribute('aria-activedescendant', opt.id);
        opt.scrollIntoView({ block: 'nearest' });
      }
    });
  };

  const pick = (item) => {
    close();
    onSelect(item);
  };

  input.addEventListener('focus', () => {
    activeIndex = -1;
    renderList();
  });

  input.addEventListener('input', () => {
    if (clearBtn) clearBtn.hidden = !input.value;
    activeIndex = -1;
    onInput?.(input.value);
    renderList();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (listEl.hidden) renderList();
      else highlight(activeIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (listEl.hidden) renderList();
      else highlight(activeIndex - 1);
    } else if (e.key === 'Enter' && !listEl.hidden && activeIndex >= 0 && flatItems[activeIndex]) {
      e.preventDefault();
      pick(flatItems[activeIndex]);
    } else if (e.key === 'Escape') {
      if (!listEl.hidden) {
        e.preventDefault();
        close();
      }
    }
  });

  listEl.addEventListener('mousedown', (e) => {
    const btn = e.target.closest('[data-opt-idx]');
    if (!btn) return;
    e.preventDefault();
    const item = flatItems[Number(btn.dataset.optIdx)];
    if (item) pick(item);
  });

  clearBtn?.addEventListener('click', () => {
    input.value = '';
    clearBtn.hidden = true;
    onInput?.('');
    input.focus();
    renderList();
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !listEl.contains(e.target)) {
      close();
    }
  });
}

// ---------------- suggestion providers ----------------

function getTopFacetSuggestions(query) {
  if (!state.data) return [];
  const q = query.trim().toLowerCase();
  const facets = [];

  const platforms = ['Windows', 'Linux', 'macOS', 'Android', 'iOS', 'PS4', 'Web'];
  for (const p of platforms) {
    if (!q || p.toLowerCase().includes(q)) {
      facets.push({ title: p, sub: 'Filter by platform', badge: 'Platform', kind: 'platform', value: p });
    }
  }

  const langs = new Set();
  for (const e of state.data.emulators) {
    if (e.github?.language) langs.add(e.github.language);
  }
  for (const lang of [...langs].sort()) {
    if (q && lang.toLowerCase().includes(q)) {
      facets.push({ title: lang, sub: 'Filter emulators by language', badge: 'Language', kind: 'query', value: lang });
    }
  }
  return facets.slice(0, 4);
}

function getGlobalSuggestionGroups(query) {
  if (!state.data) return [];
  const q = query.trim();
  if (!q) {
    const featured = state.data.emulators.filter((e) => e.tier === 'featured').slice(0, 4);
    const popularGames = state.data.games.slice(0, 3);
    return [
      {
        label: 'Featured Emulators',
        items: featured.map((e) => ({
          title: e.name,
          sub: e.repo,
          badge: `${formatNumber(e.github?.stars || 0)} ★`,
          kind: 'emulator',
          id: e.id,
        })),
      },
      {
        label: 'Popular Games',
        items: popularGames.map((g) => ({
          title: g.title,
          sub: g.developer || '',
          badge: 'Compatibility',
          kind: 'game',
          id: g.id,
          titleText: g.title,
        })),
      },
    ];
  }

  const emuHits = state.data.emulators
    .map((e) => ({ emu: e, score: scoreTokens(q, e.name, emulatorSearchFields(e)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.emu.github?.stars || 0) - (a.emu.github?.stars || 0))
    .slice(0, 5)
    .map(({ emu }) => ({
      title: emu.name,
      sub: `${emu.repo}${emu.github?.language ? ` · ${emu.github.language}` : ''}`,
      badge: emu.release?.tag || `${formatNumber(emu.github?.stars || 0)} ★`,
      kind: 'emulator',
      id: emu.id,
    }));

  const gameHits = state.data.games
    .map((g) => ({ game: g, score: scoreTokens(q, g.title, [g.developer, ...(g.aliases || [])]) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ game }) => {
      const reports = state.data.reports.filter((r) => r.game === game.id);
      const best = pickBestReport(reports);
      const bestLabel = best ? statusLabel(best.status) : 'No reports';
      return {
        title: game.title,
        sub: game.developer || '',
        badge: bestLabel,
        kind: 'game',
        id: game.id,
        titleText: game.title,
      };
    });

  return [
    { label: 'Emulators', items: emuHits },
    { label: 'Games', items: gameHits },
    { label: 'Quick Filters', items: getTopFacetSuggestions(q) },
  ];
}

function getEmulatorSuggestionGroups(query) {
  if (!state.data) return [];
  const q = query.trim();
  if (!q) {
    const picks = state.data.emulators.filter((e) => e.tier === 'featured').slice(0, 5);
    return [
      {
        label: 'Suggested Emulators',
        items: picks.map((e) => ({
          title: e.name,
          sub: e.github?.language || e.repo,
          badge: `${formatNumber(e.github?.stars || 0)} ★`,
          kind: 'emulator',
          id: e.id,
        })),
      },
      {
        label: 'Popular Stacks',
        items: [
          { title: 'C++', sub: 'Filter by language', badge: 'Language', kind: 'query', value: 'C++' },
          { title: 'Rust', sub: 'Filter by language', badge: 'Language', kind: 'query', value: 'Rust' },
          { title: 'Vulkan', sub: 'Filter by topic', badge: 'Topic', kind: 'query', value: 'vulkan' },
        ],
      },
    ];
  }

  const hits = state.data.emulators
    .map((e) => ({ emu: e, score: scoreTokens(q, e.name, emulatorSearchFields(e)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.emu.github?.stars || 0) - (a.emu.github?.stars || 0))
    .slice(0, 6)
    .map(({ emu }) => ({
      title: emu.name,
      sub: emu.repo,
      badge: emu.github?.language || state.data.categories[emu.category],
      kind: 'emulator',
      id: emu.id,
    }));

  return [
    { label: 'Matching Emulators', items: hits },
    { label: 'Filters', items: getTopFacetSuggestions(q) },
  ];
}

function getGameSuggestionGroups(query) {
  if (!state.data) return [];
  const q = query.trim();
  const scored = state.data.games
    .map((g) => ({
      game: g,
      score: q ? scoreTokens(q, g.title, [g.developer, ...(g.aliases || [])]) : 1,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  return [
    {
      label: q ? 'Matching Games' : 'Tracked Games',
      items: scored.map(({ game }) => {
        const best = pickBestReport(state.data.reports.filter((r) => r.game === game.id));
        return {
          title: game.title,
          sub: game.developer || '',
          badge: best ? statusLabel(best.status) : 'Untested',
          kind: 'game',
          id: game.id,
          titleText: game.title,
        };
      }),
    },
  ];
}

// ---------------- navigation / focus helpers ----------------

function setEmulatorsFolded(folded) {
  state.emulatorsFolded = folded;
  if (els.emuSectionBody) els.emuSectionBody.hidden = folded;
  if (els.foldEmulatorsBtn) {
    els.foldEmulatorsBtn.setAttribute('aria-expanded', String(!folded));
    els.foldEmulatorsBtn.textContent = folded
      ? `Expand (${state.data?.emulators.length || 0})`
      : 'Fold section';
  }
}

function setCompatFolded(folded) {
  state.compatFolded = folded;
  if (els.compatSectionBody) els.compatSectionBody.hidden = folded;
  if (els.foldCompatBtn) {
    els.foldCompatBtn.setAttribute('aria-expanded', String(!folded));
    els.foldCompatBtn.textContent = folded
      ? `Expand (${state.data?.games.length || 0})`
      : 'Fold section';
  }
}

function jumpToEmulator(emuId) {
  const emu = state.byId.get(emuId);
  if (!emu) return;
  setEmulatorsFolded(false);
  state.category = 'all';
  state.platform = '';
  state.q = emu.name;
  if (getActivity(emu).state === 'dormant' && emu.tier !== 'featured') {
    state.includeInactive = true;
  }
  state.highlightedId = emu.id;
  state.visibleLimit = DEFAULT_FOLD_LIMIT;
  syncFilterControls();
  renderCategoryChips(state.data);
  renderEmulators();
  writeUrlState();
  document.getElementById('emulators')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function jumpToGame(gameId, titleText) {
  setCompatFolded(false);
  state.gameQuery = titleText || '';
  state.compatStatus = '';
  state.compatEmu = '';
  if (gameId) state.expandedGames.add(gameId);
  syncFilterControls();
  renderCompatibility();
  writeUrlState();
  document.getElementById('compatibility')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function handleSuggestionPick(item) {
  if (item.kind === 'emulator') {
    jumpToEmulator(item.id);
    if (els.globalSearch) {
      els.globalSearch.value = item.title;
      if (els.globalClear) els.globalClear.hidden = false;
    }
  } else if (item.kind === 'game') {
    jumpToGame(item.id, item.titleText || item.title);
    if (els.globalSearch) {
      els.globalSearch.value = item.title;
      if (els.globalClear) els.globalClear.hidden = false;
    }
  } else if (item.kind === 'platform') {
    setEmulatorsFolded(false);
    state.platform = item.value;
    state.visibleLimit = DEFAULT_FOLD_LIMIT;
    syncFilterControls();
    renderEmulators();
    writeUrlState();
    document.getElementById('emulators')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (item.kind === 'query') {
    setEmulatorsFolded(false);
    state.q = item.value;
    state.visibleLimit = DEFAULT_FOLD_LIMIT;
    syncFilterControls();
    renderEmulators();
    writeUrlState();
    document.getElementById('emulators')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ---------------- rendering: stats & chips ----------------

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
  if (!els.chips || !data) return;
  const counts = {
    all: data.emulators.length,
    featured: data.emulators.filter((e) => e.tier === 'featured').length,
    saved: state.savedIds.size,
  };
  for (const cat of Object.keys(data.categories)) counts[cat] = 0;
  for (const emu of data.emulators) counts[emu.category] = (counts[emu.category] || 0) + 1;

  const items = [
    ['all', 'All'],
    ['featured', '★ Featured'],
    ['saved', 'Saved'],
    ...Object.entries(data.categories),
  ];

  els.chips.innerHTML = items
    .map(([key, label]) => {
      const active = state.category === key;
      return `<button type="button" class="chip" role="radio" aria-checked="${active}" data-cat="${escapeHtml(key)}">${escapeHtml(label)}<span class="count">${counts[key] ?? 0}</span></button>`;
    })
    .join('');
}

// ---------------- rendering: emulators (folded) ----------------

function filterAndSortEmulators() {
  const query = state.q.trim();
  const scored = [];

  for (const emu of state.data.emulators) {
    if (state.category === 'featured' && emu.tier !== 'featured') continue;
    else if (state.category === 'saved' && !state.savedIds.has(emu.id)) continue;
    else if (!['all', 'featured', 'saved'].includes(state.category) && emu.category !== state.category) continue;

    if (state.platform && !(emu.platforms || []).includes(state.platform)) continue;
    if (!state.includeInactive && !query && state.category !== 'saved' && emu.tier !== 'featured' && getActivity(emu).state === 'dormant') {
      continue;
    }

    const matchScore = query ? scoreTokens(query, emu.name, emulatorSearchFields(emu)) : 1;
    if (matchScore <= 0) continue;
    scored.push({ emu, matchScore });
  }

  scored.sort((a, b) => {
    if (query && a.matchScore !== b.matchScore) return b.matchScore - a.matchScore;
    const ea = a.emu;
    const eb = b.emu;
    if (state.sort === 'name') return ea.name.localeCompare(eb.name);
    if (state.sort === 'stars') return (eb.github?.stars || 0) - (ea.github?.stars || 0) || ea.name.localeCompare(eb.name);
    if (state.sort === 'activity') return lastTouchMs(eb) - lastTouchMs(ea) || (eb.github?.stars || 0) - (ea.github?.stars || 0);

    const tierDiff = (eb.tier === 'featured' ? 1 : 0) - (ea.tier === 'featured' ? 1 : 0);
    if (tierDiff !== 0) return tierDiff;
    const relDiff = parseTime(eb.release?.publishedAt) - parseTime(ea.release?.publishedAt);
    if (relDiff !== 0) return relDiff;
    const pushDiff = lastTouchMs(eb) - lastTouchMs(ea);
    if (pushDiff !== 0) return pushDiff;
    return (eb.github?.stars || 0) - (ea.github?.stars || 0);
  });

  return scored.map((x) => x.emu);
}

function renderEmulatorCards(visible, categories) {
  return visible
    .map((emu) => {
      const owner = emu.repo.split('/')[0];
      const avatarUrl = `https://github.com/${encodeURIComponent(owner)}.png?size=80`;
      const activity = getActivity(emu);
      const gh = emu.github;
      const rel = emu.release;
      const catLabel = categories[emu.category] || emu.category;
      const parent = emu.forkOf ? state.byId.get(emu.forkOf) : null;
      const desc = emu.summary || gh?.description || 'Open-source PlayStation emulation project.';
      const isSaved = state.savedIds.has(emu.id);
      const isCompared = state.compareIds.includes(emu.id);
      const isHighlighted = state.highlightedId === emu.id;

      const badges = [];
      if (emu.tier === 'featured') badges.push('<span class="badge badge-featured">★ Featured</span>');
      badges.push(`<span class="badge">${escapeHtml(catLabel)}</span>`);
      if (parent) badges.push(`<span class="badge">Based on ${escapeHtml(parent.name)}</span>`);
      if (gh?.archived) badges.push('<span class="badge badge-warn">Archived</span>');
      if (emu.unavailable) badges.push('<span class="badge badge-warn">Repo missing</span>');
      for (const p of emu.platforms || []) badges.push(`<span class="badge">${escapeHtml(p)}</span>`);

      const metaParts = [
        `<span><i class="activity ${activity.state}" aria-hidden="true"></i>${escapeHtml(activity.label)}</span>`,
      ];
      if (gh) {
        metaParts.push(`<span title="GitHub stars">★ ${formatNumber(gh.stars)}</span>`);
        if (gh.language) metaParts.push(`<span>${escapeHtml(gh.language)}</span>`);
        if (gh.license) metaParts.push(`<span>${escapeHtml(gh.license)}</span>`);
        if (gh.pushedAt) metaParts.push(`<span title="Last push: ${escapeHtml(gh.pushedAt)}">Pushed ${relativeTime(gh.pushedAt)}</span>`);
      }

      const isNewRelease = rel && isWithinDays(rel.publishedAt, WEEKLY_DAYS);
      const releaseHtml = rel
        ? `<div class="release">
            <div class="release-info">
              <span class="release-tag" title="${escapeHtml(rel.tag)}">${escapeHtml(rel.tag)}${isNewRelease ? ' <span class="new-dot">· NEW</span>' : ''}</span>
              <span class="release-date" title="${escapeHtml(rel.publishedAt || '')}">${escapeHtml(formatDate(rel.publishedAt))}${rel.prerelease ? ' · pre-release' : ''}</span>
            </div>
            <button type="button" class="btn btn-ghost btn-xs" data-open-release="${escapeHtml(emu.id)}">Notes &amp; files</button>
          </div>`
        : '<div class="release none">No tagged releases — source only</div>';

      const repoUrl = safeHttps(emu.url) || '#';
      const emuPageHref = hasEmulatorPage(emu) ? `./emulators/${escapeHtml(emu.id)}/` : null;
      const titleLink = emuPageHref
        ? `<a href="${emuPageHref}">${escapeHtml(emu.name)}</a>`
        : `<a href="${escapeHtml(repoUrl)}" target="_blank" rel="noopener">${escapeHtml(emu.name)}</a>`;
      const secondaryAction = emuPageHref
        ? `<a class="btn btn-primary btn-sm" href="${emuPageHref}">Details &amp; notes</a>`
        : rel
          ? `<button type="button" class="btn btn-primary btn-sm" data-open-release="${escapeHtml(emu.id)}">Release notes</button>`
          : `<a class="btn btn-ghost btn-sm" href="${escapeHtml(repoUrl)}/commits" target="_blank" rel="noopener">Commits</a>`;

      return `<article id="emu-card-${escapeHtml(emu.id)}" class="card${emu.tier === 'featured' ? ' is-featured' : ''}${isHighlighted ? ' is-highlighted' : ''}">
        <div class="card-top">
          <img class="avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(emu.name)} GitHub avatar" width="38" height="38" loading="lazy" decoding="async" />
          <div class="card-title">
            <h3>${titleLink}</h3>
            <span class="repo" title="${escapeHtml(emu.repo)}">${escapeHtml(emu.repo)}</span>
          </div>
          <div class="card-pins">
            <button type="button" class="pin-btn star" data-save-emu="${escapeHtml(emu.id)}" aria-pressed="${isSaved}" title="Save to watchlist">${isSaved ? '★' : '☆'}</button>
            <button type="button" class="pin-btn" data-compare-emu="${escapeHtml(emu.id)}" aria-pressed="${isCompared}" title="Add to side-by-side comparison">${isCompared ? '✓ Compare' : '+ Compare'}</button>
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

function renderEmulatorCompactTable(visible, categories) {
  const rows = visible
    .map((emu) => {
      const owner = emu.repo.split('/')[0];
      const avatarUrl = `https://github.com/${encodeURIComponent(owner)}.png?size=64`;
      const activity = getActivity(emu);
      const gh = emu.github;
      const rel = emu.release;
      const repoUrl = safeHttps(emu.url) || '#';
      const isSaved = state.savedIds.has(emu.id);
      const isCompared = state.compareIds.includes(emu.id);
      const isHighlighted = state.highlightedId === emu.id;

      const emuPageHref = hasEmulatorPage(emu) ? `./emulators/${escapeHtml(emu.id)}/` : null;
      const compactTitleLink = emuPageHref
        ? `<a href="${emuPageHref}">${escapeHtml(emu.name)}</a>`
        : `<a href="${escapeHtml(repoUrl)}" target="_blank" rel="noopener">${escapeHtml(emu.name)}</a>`;

      return `<tr class="${isHighlighted ? 'is-highlighted' : ''}">
        <td>
          <div class="compact-name">
            <img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(emu.name)} GitHub avatar" width="22" height="22" loading="lazy" decoding="async" />
            ${compactTitleLink}
            ${emu.tier === 'featured' ? '<span class="badge badge-featured">★</span>' : ''}
          </div>
        </td>
        <td>${escapeHtml(categories[emu.category] || emu.category)}</td>
        <td>${escapeHtml((emu.platforms || []).join(', ') || '—')}</td>
        <td>${escapeHtml(gh?.language || '—')}</td>
        <td><span title="${escapeHtml(activity.label)}"><i class="activity ${activity.state}" aria-hidden="true"></i> ${formatNumber(gh?.stars || 0)} ★</span></td>
        <td>${rel ? `<code>${escapeHtml(rel.tag)}</code> <span class="muted small">(${relativeTime(rel.publishedAt)})</span>` : '<span class="muted">—</span>'}</td>
        <td>
          <div class="compact-actions">
            <button type="button" class="pin-btn star" data-save-emu="${escapeHtml(emu.id)}" aria-pressed="${isSaved}" title="Save">${isSaved ? '★' : '☆'}</button>
            <button type="button" class="pin-btn" data-compare-emu="${escapeHtml(emu.id)}" aria-pressed="${isCompared}" title="Compare">${isCompared ? '✓' : '+'}</button>
            ${rel ? `<button type="button" class="btn btn-primary btn-xs" data-open-release="${escapeHtml(emu.id)}">Notes</button>` : ''}
          </div>
        </td>
      </tr>`;
    })
    .join('');

  return `<div class="compact-table-wrap"><table class="compact-table">
    <thead><tr>
      <th>Emulator</th><th>Category</th><th>Platforms</th><th>Lang</th><th>Stars</th><th>Latest release</th><th style="text-align:right">Actions</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function renderFoldBar(shownCount, matchCount) {
  if (!els.emuFoldBar) return;
  if (matchCount <= DEFAULT_FOLD_LIMIT) {
    els.emuFoldBar.hidden = true;
    els.emuFoldBar.innerHTML = '';
    return;
  }

  const remaining = matchCount - shownCount;
  const buttons = [];
  if (remaining > 0) {
    if (remaining > LOAD_MORE_STEP) {
      buttons.push(`<button type="button" class="btn btn-ghost btn-sm" data-fold-action="more">Show ${LOAD_MORE_STEP} more</button>`);
    }
    buttons.push(`<button type="button" class="btn btn-primary btn-sm" data-fold-action="all">Show all ${matchCount}</button>`);
  }
  if (shownCount > DEFAULT_FOLD_LIMIT) {
    buttons.push(`<button type="button" class="btn btn-ghost btn-sm" data-fold-action="collapse">Fold back to ${DEFAULT_FOLD_LIMIT}</button>`);
  }

  els.emuFoldBar.innerHTML = `
    <span class="muted">
      Showing <strong>${shownCount}</strong> of <strong>${matchCount}</strong> matching projects${remaining > 0 ? ` (${remaining} folded so the page stays short)` : ''}.
    </span>
    <div class="fold-actions">${buttons.join('')}</div>
  `;
  els.emuFoldBar.hidden = false;
}

function renderEmulators() {
  if (!els.emuGrid || !state.data) return;
  const list = filterAndSortEmulators();
  const total = state.data.emulators.length;
  const visible = list.slice(0, state.visibleLimit);

  if (els.emuCount) {
    const foldedNote = list.length > visible.length ? ` · ${list.length - visible.length} folded` : '';
    els.emuCount.textContent = `Showing ${visible.length} of ${list.length} matching (${total} tracked${foldedNote})`;
  }

  if (list.length === 0) {
    els.emuGrid.className = 'emu-grid';
    const msg =
      state.category === 'saved'
        ? 'No saved emulators yet. Click the ☆ button on any project to add it here.'
        : 'No matching emulators. Try clearing filters or enabling “Include inactive”.';
    els.emuGrid.innerHTML = `<div class="empty">${msg}</div>`;
    renderFoldBar(0, 0);
    return;
  }

  const categories = state.data.categories;
  if (state.view === 'compact') {
    els.emuGrid.className = '';
    els.emuGrid.innerHTML = renderEmulatorCompactTable(visible, categories);
  } else {
    els.emuGrid.className = 'emu-grid';
    els.emuGrid.innerHTML = renderEmulatorCards(visible, categories);
  }
  renderFoldBar(visible.length, list.length);
}

// ---------------- release & comparison modals ----------------

function openReleaseDialog(emuId) {
  const emu = state.byId.get(emuId);
  if (!emu?.release || !els.dialog) return;
  const rel = emu.release;
  const clientOS = detectClientOS();

  els.dialogTitle.textContent = `${emu.name} · ${rel.name || rel.tag}`;
  const subParts = [rel.tag, formatDate(rel.publishedAt)];
  if (rel.prerelease) subParts.push('Pre-release');
  if (emu.stale) subParts.push('Cached snapshot');
  els.dialogSub.textContent = subParts.filter(Boolean).join(' · ');

  const sections = [];
  const relUrl = safeHttps(rel.url) || safeHttps(emu.url);

  sections.push(`<div class="dialog-actions-row">
    ${relUrl ? `<a class="btn btn-primary btn-sm" href="${escapeHtml(relUrl)}" target="_blank" rel="noopener noreferrer">Open release on GitHub ↗</a>` : ''}
    ${hasEmulatorPage(emu) ? `<a class="btn btn-ghost btn-sm" href="./emulators/${escapeHtml(emu.id)}/">Full ${escapeHtml(emu.name)} page</a>` : ''}
    <button type="button" class="btn btn-ghost btn-sm" data-copy-text="${escapeHtml(rel.tag)}">Copy tag</button>
    ${relUrl ? `<button type="button" class="btn btn-ghost btn-sm" data-copy-text="${escapeHtml(relUrl)}">Copy URL</button>` : ''}
  </div>`);

  if (emu.tier === 'community') {
    sections.push(
      '<p class="notice"><strong>Community listing:</strong> This repository is lightly checked and not maintained by PS5 EmuTrack. Verify source code and release checksums before running executables.</p>',
    );
  }

  if (rel.assets?.length) {
    const sortedAssets = [...rel.assets].sort(
      (a, b) => Number(matchesAssetOS(b.name, clientOS)) - Number(matchesAssetOS(a.name, clientOS)),
    );
    const assetItems = sortedAssets
      .map((a) => {
        const assetUrl = safeHttps(a.url);
        if (!assetUrl) return '';
        const isRec = matchesAssetOS(a.name, clientOS);
        const dlText = a.downloads ? ` · ${formatNumber(a.downloads)} downloads` : '';
        return `<li class="${isRec ? 'asset-recommended' : ''}">
          <span>
            <a href="${escapeHtml(assetUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.name)}</a>
            ${isRec ? `<span class="rec-pill">Recommended for ${escapeHtml(clientOS)}</span>` : ''}
          </span>
          <span class="size">${escapeHtml(formatBytes(a.size))}${escapeHtml(dlText)}</span>
        </li>`;
      })
      .filter(Boolean)
      .join('');
    sections.push(`<h4>Files (${rel.assetCount || rel.assets.length})</h4><ul class="assets">${assetItems}</ul>`);
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

function updateCompareBar() {
  if (!els.compareBar) return;
  if (state.compareIds.length === 0) {
    els.compareBar.hidden = true;
    return;
  }
  const names = state.compareIds.map((id) => state.byId.get(id)?.name || id);
  els.compareSummary.textContent = `Compare (${state.compareIds.length}/${MAX_COMPARE}): ${names.join(' vs ')}`;
  els.compareOpenBtn.disabled = state.compareIds.length < 2;
  els.compareBar.hidden = false;
}

function openCompareDialog() {
  if (!els.compareDialog || state.compareIds.length < 2) return;
  const emus = state.compareIds.map((id) => state.byId.get(id)).filter(Boolean);
  const reportsFor = (id) => state.data.reports.filter((r) => r.emulator === id);

  const rows = [
    ['Repository', (e) => `<a href="${escapeHtml(safeHttps(e.url) || '#')}" target="_blank" rel="noopener">${escapeHtml(e.repo)}</a>`],
    ['Tier', (e) => (e.tier === 'featured' ? '★ Featured' : 'Community')],
    ['Category', (e) => escapeHtml(state.data.categories[e.category] || e.category)],
    ['Activity', (e) => { const a = getActivity(e); return `<i class="activity ${a.state}"></i> ${escapeHtml(a.label)}`; }],
    ['GitHub Stars', (e) => formatNumber(e.github?.stars || 0)],
    ['Language', (e) => escapeHtml(e.github?.language || '—')],
    ['License', (e) => escapeHtml(e.github?.license || '—')],
    ['Platforms', (e) => escapeHtml((e.platforms || []).join(', ') || '—')],
    ['Latest Release', (e) => e.release ? `<code>${escapeHtml(e.release.tag)}</code> (${escapeHtml(formatDate(e.release.publishedAt))})` : 'Source only'],
    ['Last Push', (e) => escapeHtml(e.github?.pushedAt ? relativeTime(e.github.pushedAt) : '—')],
    ['Tracked Reports', (e) => {
      const list = reportsFor(e.id);
      const verified = list.filter((r) => r.verified).length;
      return `${list.length} (${verified} verified)`;
    }],
  ];

  els.compareDialogBody.innerHTML = `<div class="table-wrap"><table class="compare-table">
    <thead><tr><th>Metric</th>${emus.map((e) => `<th>${escapeHtml(e.name)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([label, fn]) => `<tr><th>${label}</th>${emus.map((e) => `<td>${fn(e)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
  els.compareDialog.showModal();
}

// ---------------- compatibility matrix ----------------

function statusLabel(id) {
  const hit = state.data?.statuses.find((s) => s.id === id);
  return hit ? hit.label : id;
}

function renderLegend(statuses) {
  if (!els.legend) return;
  els.legend.innerHTML = statuses
    .map((s) => `<li><span class="status ${escapeHtml(s.id)}">${escapeHtml(s.label)}</span></li>`)
    .join('');
}

function populateCompatEmulatorSelect() {
  if (!els.compatEmuFilter || !state.data) return;
  const opts = ['<option value="">All featured emulators</option>'];
  for (const id of MATRIX_COLUMNS) {
    const emu = state.byId.get(id);
    if (emu) opts.push(`<option value="${escapeHtml(id)}">${escapeHtml(emu.name)}</option>`);
  }
  els.compatEmuFilter.innerHTML = opts.join('');
  els.compatEmuFilter.value = state.compatEmu;
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
  const columns = (state.compatEmu ? [state.compatEmu] : MATRIX_COLUMNS)
    .map((id) => state.byId.get(id))
    .filter(Boolean);

  const query = state.gameQuery.trim();
  const games = state.data.games.filter((g) => {
    if (query && scoreTokens(query, g.title, [g.developer, ...(g.aliases || [])]) <= 0) {
      return false;
    }
    const reports = state.data.reports.filter(
      (r) => r.game === g.id && (state.showUnverified || r.verified) && (!state.compatEmu || r.emulator === state.compatEmu),
    );
    if (state.compatStatus && !reports.some((r) => r.status === state.compatStatus)) {
      return false;
    }
    return true;
  });

  if (els.compatEmpty) els.compatEmpty.hidden = games.length > 0;
  if (els.toggleAllGamesBtn) {
    const allOpen = games.length > 0 && games.every((g) => state.expandedGames.has(g.id));
    els.toggleAllGamesBtn.textContent = allOpen ? 'Collapse all' : 'Expand all';
  }

  const headHtml = `<thead><tr>
    <th>Game</th>
    ${columns
      .map((c) =>
        hasEmulatorPage(c)
          ? `<th><a href="./emulators/${escapeHtml(c.id)}/">${escapeHtml(c.name)}</a></th>`
          : `<th><a href="${escapeHtml(safeHttps(c.url) || '#')}" target="_blank" rel="noopener">${escapeHtml(c.name)}</a></th>`,
      )
      .join('')}
  </tr></thead>`;

  const bodyHtml = games
    .map((game) => {
      const gameReports = state.data.reports.filter(
        (r) =>
          r.game === game.id &&
          (state.showUnverified || r.verified) &&
          (!state.compatEmu || r.emulator === state.compatEmu) &&
          (!state.compatStatus || r.status === state.compatStatus),
      );
      const expanded = state.expandedGames.has(game.id);
      const pills = [];
      if (game.platform) pills.push(`<span class="badge">${escapeHtml(game.platform)}</span>`);
      if (game.releaseDate) {
        if (parseTime(game.releaseDate) > Date.now()) {
          pills.push(`<span class="pill-upcoming">Upcoming · ${escapeHtml(game.releaseDate)}</span>`);
        } else {
          pills.push(`<span class="badge">Released · ${escapeHtml(game.releaseDate)}</span>`);
        }
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
            r.gameVersion ? `<code>${escapeHtml(r.gameVersion)}</code>` : '',
            r.os ? `<span class="muted">${escapeHtml(r.os)}</span>` : '',
            r.hardware ? `<span class="muted">${escapeHtml(r.hardware)}</span>` : '',
            `<span class="muted">${escapeHtml(r.date)}</span>`,
            r.reporter ? `<span class="muted">by @${escapeHtml(r.reporter)}</span>` : '',
            r.verified ? '' : '<span class="unverified-tag">unverified</span>',
          ]
            .filter(Boolean)
            .join(' ');
          const links = [
            r.verified && r.id ? `<a href="./reports/${escapeHtml(r.id)}/">Full report ↗</a>` : '',
            safeHttps(r.source) ? `<a href="${escapeHtml(r.source)}" target="_blank" rel="noopener">Source issue ↗</a>` : '',
            safeHttps(r.evidence) && r.evidence !== r.source ? `<a href="${escapeHtml(r.evidence)}" target="_blank" rel="noopener">Evidence ↗</a>` : '',
            safeHttps(r.video) ? `<a href="${escapeHtml(r.video)}" target="_blank" rel="noopener">Video ↗</a>` : '',
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
      const gamePageLink = `<a href="./games/${escapeHtml(game.id)}/">Full ${escapeHtml(game.title)} compatibility page ↗</a>`;
      reportItems.push(
        `<li class="report"><span class="muted small" style="grid-column:2">${gamePageLink} · <a href="${escapeHtml(prefillUrl)}" target="_blank" rel="noopener">Submit a verified report ↗</a></span></li>`,
      );

      const detailContent =
        gameReports.length > 0
          ? `<ul class="reports">${reportItems.join('')}</ul>`
          : `<ul class="reports"><li class="report"><span class="muted small" style="grid-column:2">No ${state.showUnverified ? '' : 'verified '}reports match right now. ${gamePageLink} · <a href="${escapeHtml(prefillUrl)}" target="_blank" rel="noopener">Submit a verified report ↗</a></span></li></ul>`;

      return `<tr class="game-row" data-game="${escapeHtml(game.id)}" tabindex="0" role="button" aria-expanded="${expanded}">
          <td>
            <div class="game-title">
              <svg class="chev" aria-hidden="true" viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"/></svg>
              <a href="./games/${escapeHtml(game.id)}/">${escapeHtml(game.title)}</a>
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
  if (state.expandedGames.has(gameId)) state.expandedGames.delete(gameId);
  else state.expandedGames.add(gameId);

  const row = els.compatTable?.querySelector(`tr.game-row[data-game="${CSS.escape(gameId)}"]`);
  const detail = els.compatTable?.querySelector(`tr.detail-row[data-detail-for="${CSS.escape(gameId)}"]`);
  if (row && detail) {
    const open = state.expandedGames.has(gameId);
    row.setAttribute('aria-expanded', String(open));
    detail.hidden = !open;
  }
}

// ---------------- event wiring ----------------

function wireStaticLinks() {
  if (els.submitLink) els.submitLink.href = SUBMIT_URL;
  if (els.reportLink) els.reportLink.href = REPORT_URL;
  if (els.reportLink2) els.reportLink2.href = REPORT_URL;
}

function toggleSaved(emuId) {
  if (state.savedIds.has(emuId)) {
    state.savedIds.delete(emuId);
    showToast('Removed from saved list');
  } else {
    state.savedIds.add(emuId);
    showToast('Saved to watchlist');
  }
  saveJsonStorage(STORAGE_SAVED, [...state.savedIds]);
  syncFilterControls();
  renderCategoryChips(state.data);
  renderEmulators();
}

function toggleCompare(emuId) {
  const idx = state.compareIds.indexOf(emuId);
  if (idx >= 0) {
    state.compareIds.splice(idx, 1);
  } else if (state.compareIds.length >= MAX_COMPARE) {
    showToast(`Compare up to ${MAX_COMPARE} emulators at once`);
    return;
  } else {
    state.compareIds.push(emuId);
  }
  updateCompareBar();
  renderEmulators();
}

function bindEvents() {
  els.themeToggle?.addEventListener('click', cycleTheme);

  els.headerSearchBtn?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    els.globalSearch?.focus({ preventScroll: true });
  });

  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (!typing && e.key === '/') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      els.globalSearch?.focus({ preventScroll: true });
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      els.globalSearch?.focus({ preventScroll: true });
    }
  });

  attachAutocomplete({
    input: els.globalSearch,
    clearBtn: els.globalClear,
    listEl: els.globalSuggestions,
    getGroups: getGlobalSuggestionGroups,
    onSelect: handleSuggestionPick,
  });

  attachAutocomplete({
    input: els.emuQ,
    clearBtn: els.emuQClear,
    listEl: els.emuSuggestions,
    getGroups: getEmulatorSuggestionGroups,
    onInput: (val) => {
      state.q = val;
      state.highlightedId = null;
      state.visibleLimit = DEFAULT_FOLD_LIMIT;
      syncFilterControls();
      renderEmulators();
      writeUrlState();
    },
    onSelect: (item) => {
      if (item.kind === 'emulator') {
        jumpToEmulator(item.id);
      } else if (item.kind === 'platform') {
        state.platform = item.value;
        state.visibleLimit = DEFAULT_FOLD_LIMIT;
        syncFilterControls();
        renderEmulators();
        writeUrlState();
      } else if (item.kind === 'query') {
        state.q = item.value;
        state.visibleLimit = DEFAULT_FOLD_LIMIT;
        syncFilterControls();
        renderEmulators();
        writeUrlState();
      }
    },
  });

  attachAutocomplete({
    input: els.gameSearch,
    clearBtn: els.gameClear,
    listEl: els.gameSuggestions,
    getGroups: getGameSuggestionGroups,
    onInput: (val) => {
      state.gameQuery = val;
      renderCompatibility();
      writeUrlState();
    },
    onSelect: (item) => {
      jumpToGame(item.id, item.titleText || item.title);
    },
  });

  els.quickPicks?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-quick]');
    if (!btn) return;
    const action = btn.dataset.quick;
    if (action === 'featured') {
      setEmulatorsFolded(false);
      state.category = state.category === 'featured' ? 'all' : 'featured';
      state.platform = '';
      state.q = '';
      state.visibleLimit = DEFAULT_FOLD_LIMIT;
      syncFilterControls();
      renderCategoryChips(state.data);
      renderEmulators();
      writeUrlState();
      document.getElementById('emulators')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (action === 'saved') {
      setEmulatorsFolded(false);
      state.category = state.category === 'saved' ? 'all' : 'saved';
      state.platform = '';
      state.q = '';
      state.visibleLimit = DEFAULT_FOLD_LIMIT;
      syncFilterControls();
      renderCategoryChips(state.data);
      renderEmulators();
      writeUrlState();
      document.getElementById('emulators')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (action.startsWith('platform:')) {
      const p = action.split(':')[1];
      setEmulatorsFolded(false);
      state.platform = state.platform === p ? '' : p;
      state.visibleLimit = DEFAULT_FOLD_LIMIT;
      syncFilterControls();
      renderEmulators();
      writeUrlState();
      document.getElementById('emulators')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (action.startsWith('compat:')) {
      jumpToGame(action.split(':')[1], 'Grand Theft Auto VI');
    }
  });

  els.viewSwitch?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;
    state.view = btn.dataset.view;
    syncFilterControls();
    renderEmulators();
    writeUrlState();
  });

  els.foldEmulatorsBtn?.addEventListener('click', () => {
    setEmulatorsFolded(!state.emulatorsFolded);
  });

  els.foldCompatBtn?.addEventListener('click', () => {
    setCompatFolded(!state.compatFolded);
  });

  els.quickJumpCompat?.addEventListener('click', () => {
    document.getElementById('compatibility')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  els.chips?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-cat]');
    if (!btn) return;
    state.category = btn.dataset.cat;
    state.highlightedId = null;
    state.visibleLimit = DEFAULT_FOLD_LIMIT;
    for (const chip of els.chips.querySelectorAll('.chip')) {
      chip.setAttribute('aria-checked', String(chip === btn));
    }
    syncFilterControls();
    renderEmulators();
    writeUrlState();
  });

  els.filters?.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'platform') state.platform = t.value;
    if (t.name === 'sort') state.sort = t.value;
    if (t.name === 'inactive') state.includeInactive = t.checked;
    state.visibleLimit = DEFAULT_FOLD_LIMIT;
    syncFilterControls();
    renderEmulators();
    writeUrlState();
  });

  els.resetFiltersBtn?.addEventListener('click', () => {
    state.category = 'all';
    state.q = '';
    state.platform = '';
    state.sort = 'release';
    state.includeInactive = false;
    state.highlightedId = null;
    state.visibleLimit = DEFAULT_FOLD_LIMIT;
    syncFilterControls();
    renderCategoryChips(state.data);
    renderEmulators();
    writeUrlState();
  });

  els.copyLinkBtn?.addEventListener('click', () => {
    writeUrlState();
    copyText(window.location.href, 'View link copied');
  });

  els.emuGrid?.addEventListener('click', (e) => {
    const releaseBtn = e.target.closest('[data-open-release]');
    if (releaseBtn) {
      openReleaseDialog(releaseBtn.dataset.openRelease);
      return;
    }
    const saveBtn = e.target.closest('[data-save-emu]');
    if (saveBtn) {
      toggleSaved(saveBtn.dataset.saveEmu);
      return;
    }
    const cmpBtn = e.target.closest('[data-compare-emu]');
    if (cmpBtn) {
      toggleCompare(cmpBtn.dataset.compareEmu);
    }
  });

  els.emuFoldBar?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-fold-action]');
    if (!btn) return;
    const act = btn.dataset.foldAction;
    if (act === 'more') state.visibleLimit += LOAD_MORE_STEP;
    else if (act === 'all') state.visibleLimit = Number.MAX_SAFE_INTEGER;
    else if (act === 'collapse') {
      state.visibleLimit = DEFAULT_FOLD_LIMIT;
      document.getElementById('emulators')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    renderEmulators();
  });

  els.compareOpenBtn?.addEventListener('click', openCompareDialog);
  els.compareClearBtn?.addEventListener('click', () => {
    state.compareIds = [];
    updateCompareBar();
    renderEmulators();
  });

  for (const dlg of [els.dialog, els.compareDialog]) {
    dlg?.addEventListener('click', (e) => {
      if (e.target === dlg || e.target.closest('[data-close]')) {
        dlg.close();
        return;
      }
      const copyBtn = e.target.closest('[data-copy-text]');
      if (copyBtn) copyText(copyBtn.dataset.copyText, 'Copied to clipboard');
    });
  }

  els.compatStatusFilter?.addEventListener('change', (e) => {
    state.compatStatus = e.target.value;
    renderCompatibility();
    writeUrlState();
  });

  els.compatEmuFilter?.addEventListener('change', (e) => {
    state.compatEmu = e.target.value;
    renderCompatibility();
    writeUrlState();
  });

  els.showUnverified?.addEventListener('change', (e) => {
    state.showUnverified = e.target.checked;
    renderCompatibility();
    writeUrlState();
  });

  els.toggleAllGamesBtn?.addEventListener('click', () => {
    const rows = els.compatTable?.querySelectorAll('tr.game-row') || [];
    const allOpen = rows.length > 0 && [...rows].every((r) => state.expandedGames.has(r.dataset.game));
    if (allOpen) {
      state.expandedGames.clear();
    } else {
      for (const r of rows) state.expandedGames.add(r.dataset.game);
    }
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
    if (!row || e.target.closest('a')) return;
    e.preventDefault();
    toggleGameDetail(row.dataset.game);
  });

  window.addEventListener(
    'scroll',
    () => {
      if (els.backToTop) els.backToTop.hidden = window.scrollY < 450;
    },
    { passive: true },
  );

  els.backToTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ---------------- init ----------------

async function init() {
  applyTheme(state.theme);
  readUrlState();
  wireStaticLinks();
  bindEvents();

  try {
    const res = await fetch('./data.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.data = data;
    state.byId = new Map(data.emulators.map((e) => [e.id, e]));

    renderStats(data);
    populateCompatEmulatorSelect();
    syncFilterControls();
    renderCategoryChips(data);
    renderEmulators();
    renderLegend(data.statuses);
    renderCompatibility();
    updateCompareBar();
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
