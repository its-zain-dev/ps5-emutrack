'use strict';

// Configurable repository coordinates for GitHub Pages deployment
const REPO_URL = 'https://github.com/its-zain-dev/ps5-emutrack';
const ISSUES_URL = `${REPO_URL}/issues/new?title=Compatibility+Report%3A+&labels=compatibility`;
const CACHE_KEY = 'ps5_emutrack_static_gh_cache_v1';
const CACHE_TTL_MS = 30 * 60 * 1000;

const EMULATORS = [
  {
    id: 'kytyps5',
    name: 'KytyPS5',
    meta: 'Most Active · C++20 · Vulkan · Windows & Linux',
    summary:
      "Near-daily updates; capable of running heavy titles in-game such as Ghost of Yōtei, Astro Bot, and Demon's Souls at early low framerates.",
    repoUrl: 'https://github.com/KytyPS5/KytyPS5',
    releasesUrl: 'https://github.com/KytyPS5/KytyPS5/releases',
    apiUrl: 'https://api.github.com/repos/KytyPS5/KytyPS5/releases/latest',
  },
  {
    id: 'sharpemu',
    name: 'SharpEmu',
    meta: 'Continuous Updates · C# / .NET 9 · Vulkan · Windows & Linux',
    summary:
      'Written in C#, supports Windows & Linux via Vulkan, and maintains a massive compatibility database tracking thousands of games.',
    repoUrl: 'https://github.com/sharpemu/sharpemu',
    releasesUrl: 'https://github.com/sharpemu/sharpemu/releases',
    apiUrl: 'https://api.github.com/repos/sharpemu/sharpemu/releases/latest',
  },
  {
    id: 'prosperity',
    name: 'Prosperity',
    meta: 'Active Research · C++ / Rust · Low-Level LLE · Linux & Windows',
    summary:
      'Low-level emulation project targeting PS4 and PS5 architecture, focusing on reverse engineering and executing native game binaries.',
    repoUrl: 'https://github.com/search?q=Prosperity+PS5+emulator&type=repositories',
    releasesUrl: 'https://github.com/search?q=Prosperity+PS5+emulator&type=repositories',
    apiUrl: null,
  },
  {
    id: 'anyps5',
    name: 'AnyPS5',
    meta: 'Experimental · C++ / LLVM · Binary Re-Linking · Windows & Linux',
    summary:
      'Uses a high-level binary re-linking and system API translation approach to run titles natively on Windows and Linux.',
    repoUrl: 'https://github.com/search?q=AnyPS5+emulator&type=repositories',
    releasesUrl: 'https://github.com/search?q=AnyPS5+emulator&type=repositories',
    apiUrl: null,
  },
];

const GAMES = [
  {
    title: 'Grand Theft Auto VI (GTA VI)',
    note: 'Awaiting official PS5 console launch & retail binary analysis.',
    lastVerified: '2026-11-15',
    statuses: {
      kytyps5: 'Pending Release',
      sharpemu: 'Pending Release',
      prosperity: 'Not Supported Yet',
      anyps5: 'Not Supported Yet',
    },
  },
  {
    title: 'Ghost of Yōtei',
    note: 'KytyPS5 reaches early world exploration at 10–18 FPS.',
    lastVerified: '2026-11-14',
    statuses: {
      kytyps5: 'In-Game',
      sharpemu: 'Boots to Menu',
      prosperity: 'Not Supported Yet',
      anyps5: 'Boots to Menu',
    },
  },
  {
    title: 'Astro Bot',
    note: 'In-game on KytyPS5 and SharpEmu (15–25 FPS on desktop Vulkan GPUs).',
    lastVerified: '2026-11-13',
    statuses: {
      kytyps5: 'In-Game',
      sharpemu: 'In-Game',
      prosperity: 'Boots to Menu',
      anyps5: 'Boots to Menu',
    },
  },
  {
    title: "Demon's Souls",
    note: 'KytyPS5 enters Nexus & Boletaria in-game at low framerates.',
    lastVerified: '2026-11-12',
    statuses: {
      kytyps5: 'In-Game',
      sharpemu: 'Boots to Menu',
      prosperity: 'Boots to Menu',
      anyps5: 'Not Supported Yet',
    },
  },
];

const FAQS = [
  {
    q: 'Can any PS5 emulator run Grand Theft Auto VI (GTA VI) right now?',
    a: 'Not yet. Grand Theft Auto VI is Pending Release / Not Supported Yet until retail PS5 dumps and keys can be analyzed.',
  },
  {
    q: 'Which open-source PS5 emulator is currently the most active?',
    a: "KytyPS5 is the most active project with near-daily commits and In-Game progress on Ghost of Yōtei, Astro Bot, and Demon's Souls.",
  },
  {
    q: 'Are download links safe and official?',
    a: 'Yes. All download buttons link directly to official GitHub Releases pages with zero third-party mirrors.',
  },
];

let selectedStatus = 'All';
let searchQuery = '';
let selectedEmulator = 'all';
let releaseMap = {};

function badgeClass(status) {
  if (status === 'In-Game') return 'status-badge status-ingame';
  if (status === 'Boots to Menu') return 'status-badge status-menu';
  if (status === 'Pending Release') return 'status-badge status-pending';
  return 'status-badge status-unsupported';
}

function renderMatrix() {
  const tbody = document.getElementById('matrix-tbody');
  const countEl = document.getElementById('matrix-count');
  const filtered = GAMES.filter((game) => {
    const matchesText =
      !searchQuery ||
      game.title.toLowerCase().includes(searchQuery) ||
      game.note.toLowerCase().includes(searchQuery);
    if (!matchesText) return false;
    if (selectedStatus === 'All') return true;
    if (selectedEmulator !== 'all') return game.statuses[selectedEmulator] === selectedStatus;
    return Object.values(game.statuses).includes(selectedStatus);
  });

  countEl.textContent = `Showing ${filtered.length} of ${GAMES.length} tracked titles`;
  tbody.innerHTML = filtered
    .map(
      (g) => `
      <tr>
        <td><strong>${g.title}</strong><div class="muted-meta">${g.note}</div></td>
        <td><span class="${badgeClass(g.statuses.kytyps5)}">${g.statuses.kytyps5}</span></td>
        <td><span class="${badgeClass(g.statuses.sharpemu)}">${g.statuses.sharpemu}</span></td>
        <td><span class="${badgeClass(g.statuses.prosperity)}">${g.statuses.prosperity}</span></td>
        <td><span class="${badgeClass(g.statuses.anyps5)}">${g.statuses.anyps5}</span></td>
        <td class="text-right">${g.lastVerified}</td>
      </tr>`,
    )
    .join('');
}

function renderEmulators() {
  const grid = document.getElementById('emulator-grid');
  grid.innerHTML = EMULATORS.map((emu) => {
    const rel = releaseMap[emu.id] || {
      tagName: 'Latest',
      formattedDate: 'Snapshot',
      releaseUrl: emu.releasesUrl,
      directAssetUrl: emu.releasesUrl,
      bodyNotes: 'Official GitHub release notes.',
    };
    return `
      <article class="emu-card">
        <div>
          <h3>${emu.name}</h3>
          <p class="muted-meta">${emu.meta}</p>
          <p>${emu.summary}</p>
          <div class="emu-meta-row">
            <span>Tag: <strong>${rel.tagName}</strong></span>
            <span>Date: ${rel.formattedDate}</span>
          </div>
          <details class="changelog-details">
            <summary>View Release Notes</summary>
            <div class="changelog-box">${rel.bodyNotes}</div>
          </details>
        </div>
        <div class="emu-actions">
          <a href="${emu.repoUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">Repository</a>
          <a href="${rel.directAssetUrl || rel.releaseUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">Download Latest Build</a>
        </div>
      </article>`;
  }).join('');
}

function updateCountdown() {
  const el = document.getElementById('gta-countdown');
  const target = Date.parse('2026-11-19T00:00:00Z');
  const diff = target - Date.now();
  if (diff <= 0) {
    el.innerHTML = '<div class="muted-meta">Console Released · Live Dump Tracking Active</div>';
    return;
  }
  const s = Math.floor(diff / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  el.innerHTML = [
    [days, 'Days'],
    [String(hours).padStart(2, '0'), 'Hours'],
    [String(mins).padStart(2, '0'), 'Mins'],
    [String(secs).padStart(2, '0'), 'Secs'],
  ]
    .map(
      ([val, lbl]) =>
        `<div class="cd-box"><div class="cd-val">${val}</div><div class="cd-lbl">${lbl}</div></div>`,
    )
    .join('');
}

async function syncGitHub(forceRefresh) {
  const statusEl = document.getElementById('sync-status');
  try {
    const fallbackRes = await fetch('./data.json');
    if (fallbackRes.ok) {
      const json = await fallbackRes.json();
      if (json.emulators) releaseMap = json.emulators;
    }
  } catch (_) {}

  if (!forceRefresh) {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        releaseMap = cached.data;
        statusEl.textContent = 'Source: localStorage cache (30m TTL)';
        renderEmulators();
        return;
      }
    } catch (_) {}
  }

  let liveCount = 0;
  await Promise.all(
    EMULATORS.map(async (emu) => {
      if (!emu.apiUrl) return;
      try {
        const res = await fetch(emu.apiUrl, { headers: { Accept: 'application/vnd.github+json' } });
        if (!res.ok) return;
        const rel = await res.json();
        const asset = (rel.assets || [])[0];
        releaseMap[emu.id] = {
          tagName: rel.tag_name || 'Latest',
          formattedDate: (rel.published_at || '').slice(0, 10),
          releaseUrl: rel.html_url || emu.releasesUrl,
          directAssetUrl: asset?.browser_download_url || rel.html_url || emu.releasesUrl,
          bodyNotes: rel.body || 'No release notes provided.',
        };
        liveCount += 1;
      } catch (_) {}
    }),
  );

  if (liveCount > 0) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: releaseMap }));
    } catch (_) {}
    statusEl.textContent = `Source: Live GitHub REST API (${liveCount} repos synced)`;
  } else {
    statusEl.textContent = 'Source: Static data.json snapshot';
  }
  renderEmulators();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('header-repo-link').href = REPO_URL;
  document.getElementById('footer-repo-link').href = REPO_URL;
  document.getElementById('hero-issue-link').href = ISSUES_URL;
  document.getElementById('footer-issue-link').href = ISSUES_URL;

  const tabsContainer = document.getElementById('status-tabs');
  ['All', 'In-Game', 'Boots to Menu', 'Pending Release', 'Not Supported Yet'].forEach((status) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `tab-btn${status === 'All' ? ' active' : ''}`;
    btn.textContent = status;
    btn.addEventListener('click', () => {
      selectedStatus = status;
      tabsContainer.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderMatrix();
    });
    tabsContainer.appendChild(btn);
  });

  document.getElementById('game-search').addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderMatrix();
  });

  document.getElementById('emulator-filter').addEventListener('change', (e) => {
    selectedEmulator = e.target.value;
    renderMatrix();
  });

  document.getElementById('refresh-github-btn').addEventListener('click', () => syncGitHub(true));

  document.getElementById('faq-list').innerHTML = FAQS.map(
    (item, i) => `
      <details class="faq-item"${i === 0 ? ' open' : ''}>
        <summary>${item.q}</summary>
        <p>${item.a}</p>
      </details>`,
  ).join('');

  renderMatrix();
  updateCountdown();
  setInterval(updateCountdown, 1000);
  syncGitHub(false);
});
