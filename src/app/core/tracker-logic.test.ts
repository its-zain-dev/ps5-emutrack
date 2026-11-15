import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDiscoveredGamesToMatrix,
  discoverSupportedGamesFromText,
  expandSearchTerms,
} from './compatibility-scanner';
import { shouldIncludeArchiveEntry } from './project-archive-filter';
import {
  buildSubmissionGitHubArtifacts,
  filterEmulators,
  filterGames,
  formatBytes,
  formatCountdown,
  formatIsoDate,
  getGameBestStatus,
  isCacheValid,
  normalizeGitHubRelease,
  parseChangelogLines,
  parseGitHubOwnerRepo,
  submissionToEmulatorProject,
  validateEmulatorSubmission,
} from './tracker-logic';
import {
  EmulatorProject,
  EmulatorReleaseInfo,
  EmulatorSubmission,
  GameCompatibilityEntry,
} from './tracker.types';

const SAMPLE_FALLBACK_RELEASE: EmulatorReleaseInfo = {
  tagName: 'v0.1.0-fallback',
  releaseTitle: 'Fallback Release',
  publishedAt: '2026-11-10T00:00:00Z',
  formattedDate: 'Nov 10, 2026',
  releaseUrl: 'https://github.com/KytyPS5/KytyPS5/releases',
  directAssetUrl: null,
  directAssetName: null,
  bodyNotes: 'Fallback notes',
  source: 'static-fallback',
  assets: [],
};

const SAMPLE_GAMES: GameCompatibilityEntry[] = [
  {
    id: 'gta-vi',
    title: 'Grand Theft Auto VI',
    shortNote: 'Rockstar Games · PS5 Console Exclusive Launch Window',
    featured: true,
    releaseTargetIso: '2026-11-19T00:00:00Z',
    lastVerifiedDate: '2026-11-15',
    statuses: {
      kytyps5: 'Pending Release',
      sharpemu: 'Pending Release',
      prosperity: 'Not Supported Yet',
      anyps5: 'Not Supported Yet',
    },
    performanceNote: 'Awaiting retail PS5 binary dump after launch.',
  },
  {
    id: 'ghost-of-yotei',
    title: 'Ghost of Yōtei',
    shortNote: 'Sucker Punch · Action-Adventure',
    featured: false,
    lastVerifiedDate: '2026-11-14',
    statuses: {
      kytyps5: 'In-Game',
      sharpemu: 'Boots to Menu',
      prosperity: 'Not Supported Yet',
      anyps5: 'Boots to Menu',
    },
    performanceNote: 'KytyPS5 reaches early world exploration at 12–18 FPS.',
  },
  {
    id: 'astro-bot',
    title: 'Astro Bot',
    shortNote: 'Team Asobi · 3D Platformer',
    featured: false,
    lastVerifiedDate: '2026-11-12',
    statuses: {
      kytyps5: 'In-Game',
      sharpemu: 'In-Game',
      prosperity: 'Boots to Menu',
      anyps5: 'Not Supported Yet',
    },
    performanceNote: 'Playable intro levels with minor shader compilation stutter.',
  },
];

const SAMPLE_EMULATORS: EmulatorProject[] = [
  {
    id: 'kytyps5',
    name: 'KytyPS5',
    category: 'PS5 Native / HLE',
    activityLabel: 'Most Active',
    isMostActive: true,
    languages: ['C++20'],
    graphicsBackends: ['Vulkan'],
    platforms: ['Windows', 'Linux'],
    architectureSummary: 'Hybrid PS5 runtime',
    statusSummary: 'Near-daily updates with Vulkan shader pipeline.',
    repoOwner: 'KytyPS5',
    repoName: 'KytyPS5',
    repoUrl: 'https://github.com/KytyPS5/KytyPS5',
    releasesPageUrl: 'https://github.com/KytyPS5/KytyPS5/releases',
    apiLatestReleaseUrl: null,
    fallbackRelease: SAMPLE_FALLBACK_RELEASE,
  },
  {
    id: 'rps5e',
    name: 'RPS5E',
    category: 'Translation & Re-Linking',
    activityLabel: 'Experimental',
    isMostActive: false,
    languages: ['Rust'],
    graphicsBackends: ['Vulkan'],
    platforms: ['Linux', 'Windows'],
    architectureSummary: 'Rust compatibility layer',
    statusSummary: 'Maps x86-64 binaries to host CPU with HLE modules.',
    repoOwner: 'keklick1337',
    repoName: 'rps5e',
    repoUrl: 'https://github.com/keklick1337/rps5e',
    releasesPageUrl: 'https://github.com/keklick1337/rps5e/releases',
    apiLatestReleaseUrl: null,
    fallbackRelease: SAMPLE_FALLBACK_RELEASE,
  },
];

test('normalizeGitHubRelease prefers desktop archive assets and formats ISO date', () => {
  const normalized = normalizeGitHubRelease(
    {
      tag_name: 'v2026.11.14',
      name: 'KytyPS5 Build 2026.11.14',
      published_at: '2026-11-14T18:30:00Z',
      html_url: 'https://github.com/KytyPS5/KytyPS5/releases/tag/v2026.11.14',
      body: '## Highlights\n- Improved Vulkan shader cache',
      assets: [
        {
          name: 'checksums.txt',
          browser_download_url: 'https://github.com/KytyPS5/KytyPS5/releases/download/v2026.11.14/checksums.txt',
          size: 512,
        },
        {
          name: 'kytyps5-macOS.zip',
          browser_download_url: 'https://github.com/KytyPS5/KytyPS5/releases/download/v2026.11.14/kytyps5-macOS.zip',
          size: 22_000_000,
        },
        {
          name: 'kytyps5-win64.zip',
          browser_download_url: 'https://github.com/KytyPS5/KytyPS5/releases/download/v2026.11.14/kytyps5-win64.zip',
          size: 24_500_000,
        },
      ],
    },
    SAMPLE_FALLBACK_RELEASE,
    'github-live',
  );

  assert.equal(normalized.tagName, 'v2026.11.14');
  assert.equal(normalized.formattedDate, 'Nov 14, 2026');
  assert.equal(normalized.directAssetName, 'kytyps5-win64.zip');
  assert.equal(normalized.source, 'github-live');
});

test('isCacheValid respects TTL boundaries', () => {
  const now = 1_700_000_000_000;
  const thirtyMinutes = 30 * 60 * 1000;
  assert.equal(isCacheValid(now - 60_000, thirtyMinutes, now), true);
  assert.equal(isCacheValid(now - thirtyMinutes - 1, thirtyMinutes, now), false);
  assert.equal(isCacheValid(now + 5_000, thirtyMinutes, now), false);
});

test('filterGames matches by search query, status, and specific emulator', () => {
  assert.equal(filterGames(SAMPLE_GAMES, 'ghost', 'All', 'all').length, 1);
  assert.equal(filterGames(SAMPLE_GAMES, '', 'In-Game', 'all').length, 2);
  assert.equal(filterGames(SAMPLE_GAMES, '', 'In-Game', 'sharpemu').length, 1);
  assert.equal(filterGames(SAMPLE_GAMES, '', 'Pending Release', 'kytyps5').length, 1);
  assert.equal(filterGames(SAMPLE_GAMES, 'nonexistent', 'All', 'all').length, 0);
});

test('filterEmulators filters by category and search text', () => {
  assert.equal(filterEmulators(SAMPLE_EMULATORS, '', 'All').length, 2);
  assert.equal(filterEmulators(SAMPLE_EMULATORS, 'rust', 'All').length, 1);
  assert.equal(filterEmulators(SAMPLE_EMULATORS, '', 'Translation & Re-Linking').length, 1);
  assert.equal(filterEmulators(SAMPLE_EMULATORS, 'kyty', 'Translation & Re-Linking').length, 0);
});

test('validateEmulatorSubmission rejects invalid GitHub URLs and short descriptions', () => {
  const invalid = validateEmulatorSubmission({
    name: 'X',
    repoUrl: 'https://example.com/not-github',
    description: 'Too short',
    releaseOrDocsUrl: 'ftp://bad-protocol',
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.name);
  assert.ok(invalid.errors.repoUrl);
  assert.ok(invalid.errors.description);
  assert.ok(invalid.errors.releaseOrDocsUrl);

  const valid = validateEmulatorSubmission({
    name: 'NovaPS5',
    repoUrl: 'https://github.com/novaps5/novaps5',
    description: 'Experimental Rust and Vulkan runtime for PS5 ELF binaries.',
    releaseOrDocsUrl: 'https://github.com/novaps5/novaps5/releases',
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.errors, {});
});

test('parseGitHubOwnerRepo and buildSubmissionGitHubArtifacts produce valid outputs', () => {
  assert.deepEqual(parseGitHubOwnerRepo('https://github.com/keklick1337/rps5e.git'), {
    owner: 'keklick1337',
    repo: 'rps5e',
  });
  assert.equal(parseGitHubOwnerRepo('https://gitlab.com/foo/bar'), null);

  const artifacts = buildSubmissionGitHubArtifacts(
    {
      name: 'NovaPS5',
      repoUrl: 'https://github.com/novaps5/novaps5',
      description: 'Experimental Rust and Vulkan runtime for PS5 ELF binaries.',
      releaseOrDocsUrl: 'https://github.com/novaps5/novaps5/releases',
      language: 'Rust',
      graphicsBackend: 'Vulkan',
      platforms: 'Linux, Windows',
      category: 'PS5 Native / HLE',
    },
    'https://github.com/ps5-emutrack/ps5-emutrack',
  );
  assert.ok(artifacts.issueUrl.startsWith('https://github.com/ps5-emutrack/ps5-emutrack/issues/new?'));
  assert.ok(artifacts.prJsonSnippet.includes('"repoOwner": "novaps5"'));
  assert.ok(artifacts.markdownRow.includes('**[NovaPS5](https://github.com/novaps5/novaps5)**'));
});

test('submissionToEmulatorProject maps approved submission to tracker card model', () => {
  const sub: EmulatorSubmission = {
    id: 'abc123',
    name: 'NovaPS5',
    repoUrl: 'https://github.com/novaps5/novaps5',
    description: 'Experimental Rust and Vulkan runtime for PS5 ELF binaries.',
    releaseOrDocsUrl: 'https://github.com/novaps5/novaps5/releases',
    language: 'Rust',
    graphicsBackend: 'Vulkan',
    platforms: 'Linux, Windows',
    category: 'PS5 Native / HLE',
    status: 'approved',
    submittedAt: '2026-11-15T06:00:00Z',
    reviewedAt: '2026-11-15T06:10:00Z',
  };
  const mapped = submissionToEmulatorProject(sub);
  assert.equal(mapped.id, 'sub-abc123');
  assert.equal(mapped.repoOwner, 'novaps5');
  assert.equal(mapped.fallbackRelease.source, 'community-approved');
});

test('getGameBestStatus prioritizes In-Game > Boots to Menu > Pending Release', () => {
  assert.equal(getGameBestStatus(SAMPLE_GAMES[0]), 'Pending Release');
  assert.equal(getGameBestStatus(SAMPLE_GAMES[1]), 'In-Game');
});

test('formatCountdown returns accurate breakdown before and after launch', () => {
  const target = '2026-11-19T00:00:00Z';
  const before = Date.parse('2026-11-15T12:00:00Z');
  const countdownBefore = formatCountdown(target, before);
  assert.equal(countdownBefore.isReleased, false);
  assert.equal(countdownBefore.days, 3);
  assert.equal(countdownBefore.hours, 12);

  const after = Date.parse('2026-11-20T00:00:00Z');
  const countdownAfter = formatCountdown(target, after);
  assert.equal(countdownAfter.isReleased, true);
  assert.equal(countdownAfter.days, 0);
});

test('parseChangelogLines parses headings, bullets, and paragraphs cleanly', () => {
  const lines = parseChangelogLines('## Changes\n- Fixed **Vulkan** sync\nGeneral stability note.');
  assert.deepEqual(lines, [
    { kind: 'heading', text: 'Changes' },
    { kind: 'bullet', text: 'Fixed Vulkan sync' },
    { kind: 'paragraph', text: 'General stability note.' },
  ]);
});

test('formatIsoDate and formatBytes handle edge values cleanly', () => {
  assert.equal(formatIsoDate('2026-11-15T06:00:00Z'), 'Nov 15, 2026');
  assert.equal(formatBytes(10_485_760), '10.0 MB');
  assert.equal(formatBytes(0), 'GitHub Asset');
});

test('expandSearchTerms and filterGames match broad search aliases (gta 6, pc)', () => {
  const gtaTerms = expandSearchTerms('gta 6');
  assert.ok(gtaTerms.includes('gta vi'));
  assert.equal(filterGames(SAMPLE_GAMES, 'gta 6', 'All', 'all').length, 1);
  assert.equal(filterEmulators(SAMPLE_EMULATORS, 'pc', 'All').length, 2);
});

test('discoverSupportedGamesFromText and applyDiscoveredGamesToMatrix auto-update compatibility statuses', () => {
  const rawNotes =
    'Changelog v0.5: Added Astro Bot playable at 60fps in-game! Also boots Bloodborne intro and monitors GTA VI release.';
  const hits = discoverSupportedGamesFromText(rawNotes, Date.parse('2026-11-15T00:00:00Z'));
  assert.ok(hits.some((h) => h.gameId === 'astro-bot' && h.status === 'In-Game'));
  assert.ok(hits.some((h) => h.gameId === 'bloodborne'));
  assert.ok(hits.some((h) => h.gameId === 'gta-vi' && h.status === 'Pending Release'));

  const updated = applyDiscoveredGamesToMatrix(
    SAMPLE_GAMES,
    { anyps5: { emulatorName: 'AnyPS5', text: rawNotes } },
    '2026-11-15T10:00:00Z',
    Date.parse('2026-11-15T00:00:00Z'),
  );
  const astro = updated.games.find((g) => g.id === 'astro-bot');
  const bloodborne = updated.games.find((g) => g.id === 'bloodborne');
  assert.equal(astro?.statuses.anyps5, 'In-Game');
  assert.ok(bloodborne);
  assert.ok(updated.emulatorSupportedGames['anyps5']?.includes('Astro Bot'));
});

test('submissionToEmulatorProject preserves autoApprovedProject metadata when present', () => {
  const enriched: EmulatorProject = {
    ...SAMPLE_EMULATORS[0],
    id: 'novaps5',
    name: 'NovaPS5',
    stars: 420,
    supportedGames: ['Astro Bot'],
    autoApproved: true,
  };
  const sub: EmulatorSubmission = {
    id: 'sub-999',
    name: 'NovaPS5',
    repoUrl: 'https://github.com/novaps5/novaps5',
    description: 'Experimental Rust and Vulkan runtime for PS5 ELF binaries.',
    releaseOrDocsUrl: 'https://github.com/novaps5/novaps5/releases',
    status: 'approved',
    submittedAt: '2026-11-15T06:00:00Z',
    reviewedAt: '2026-11-15T06:10:00Z',
    autoApprovedProject: enriched,
  };
  const result = submissionToEmulatorProject(sub);
  assert.equal(result.id, 'novaps5');
  assert.equal(result.stars, 420);
  assert.deepEqual(result.supportedGames, ['Astro Bot']);
});

test('shouldIncludeArchiveEntry includes full project sources and blocks secrets/artifacts', () => {
  assert.equal(shouldIncludeArchiveEntry('src/server.ts', false), true);
  assert.equal(shouldIncludeArchiveEntry('src/app', true), true);
  assert.equal(shouldIncludeArchiveEntry('.github/workflows/update-tracker.yml', false), true);
  assert.equal(shouldIncludeArchiveEntry('.env.example', false), true);
  assert.equal(shouldIncludeArchiveEntry('public/data.json', false), true);
  assert.equal(shouldIncludeArchiveEntry('scripts/update_tracker.py', false), true);
  assert.equal(shouldIncludeArchiveEntry('README.md', false), true);

  assert.equal(shouldIncludeArchiveEntry('node_modules', true), false);
  assert.equal(shouldIncludeArchiveEntry('node_modules/jszip/index.js', false), false);
  assert.equal(shouldIncludeArchiveEntry('.angular', true), false);
  assert.equal(shouldIncludeArchiveEntry('dist/app/server.mjs', false), false);
  assert.equal(shouldIncludeArchiveEntry('.aistudio', true), false);
  assert.equal(shouldIncludeArchiveEntry('.git/config', false), false);
  assert.equal(shouldIncludeArchiveEntry('.playwright-cli/trace.png', false), false);
  assert.equal(shouldIncludeArchiveEntry('data/submissions.json', false), false);
  assert.equal(shouldIncludeArchiveEntry('.env', false), false);
  assert.equal(shouldIncludeArchiveEntry('.env.local', false), false);
  assert.equal(shouldIncludeArchiveEntry('ps5-emutrack-full-project.zip', false), false);
});

