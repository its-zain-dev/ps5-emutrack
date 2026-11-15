import { expandSearchTerms } from './compatibility-scanner';
import {
  ChangelogLine,
  CompatibilityStatus,
  CoreMatrixEmulatorId,
  CountdownBreakdown,
  DataSourceKind,
  EmulatorCategory,
  EmulatorProject,
  EmulatorReleaseInfo,
  EmulatorSubmission,
  EmulatorSubmissionInput,
  GameCompatibilityEntry,
  ReleaseAsset,
  SubmissionGitHubArtifacts,
  SubmissionValidationResult,
} from './tracker.types';

export interface GitHubRawAsset {
  name?: unknown;
  browser_download_url?: unknown;
  size?: unknown;
}

export interface GitHubRawRelease {
  tag_name?: unknown;
  name?: unknown;
  published_at?: unknown;
  html_url?: unknown;
  body?: unknown;
  assets?: unknown;
}

const PREFERRED_ARCHIVE_EXTENSIONS = ['.zip', '.7z', '.tar.gz', '.appimage', '.exe', '.msi'];

export function formatIsoDate(isoString: string | null | undefined): string {
  if (!isoString) {
    return 'Unknown date';
  }
  const parsed = Date.parse(isoString);
  if (Number.isNaN(parsed)) {
    return isoString;
  }
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(parsed));
}

export function selectPreferredAsset(assets: ReleaseAsset[]): ReleaseAsset | null {
  if (assets.length === 0) {
    return null;
  }
  const isPrimaryDesktopOs = (name: string): boolean => {
    const lower = name.toLowerCase();
    return lower.includes('win') || lower.includes('linux');
  };

  for (const ext of PREFERRED_ARCHIVE_EXTENSIONS) {
    const desktopMatch = assets.find(
      (asset) => asset.name.toLowerCase().endsWith(ext) && isPrimaryDesktopOs(asset.name),
    );
    if (desktopMatch) {
      return desktopMatch;
    }
  }
  for (const ext of PREFERRED_ARCHIVE_EXTENSIONS) {
    const match = assets.find((asset) => asset.name.toLowerCase().endsWith(ext));
    if (match) {
      return match;
    }
  }
  return assets[0] ?? null;
}

export function normalizeGitHubRelease(
  raw: GitHubRawRelease,
  fallback: EmulatorReleaseInfo,
  source: DataSourceKind = 'github-live',
): EmulatorReleaseInfo {
  const tagName =
    typeof raw.tag_name === 'string' && raw.tag_name.trim().length > 0
      ? raw.tag_name.trim()
      : fallback.tagName;

  const releaseTitle =
    typeof raw.name === 'string' && raw.name.trim().length > 0
      ? raw.name.trim()
      : tagName;

  const publishedAt =
    typeof raw.published_at === 'string' && raw.published_at.trim().length > 0
      ? raw.published_at.trim()
      : fallback.publishedAt;

  const releaseUrl =
    typeof raw.html_url === 'string' && raw.html_url.startsWith('https://')
      ? raw.html_url
      : fallback.releaseUrl;

  const bodyNotes =
    typeof raw.body === 'string' && raw.body.trim().length > 0
      ? raw.body.trim()
      : fallback.bodyNotes;

  const parsedAssets: ReleaseAsset[] = Array.isArray(raw.assets)
    ? raw.assets
        .map((item): ReleaseAsset | null => {
          if (!item || typeof item !== 'object') {
            return null;
          }
          const candidate = item as GitHubRawAsset;
          if (
            typeof candidate.name !== 'string' ||
            typeof candidate.browser_download_url !== 'string' ||
            !candidate.browser_download_url.startsWith('https://')
          ) {
            return null;
          }
          return {
            name: candidate.name,
            downloadUrl: candidate.browser_download_url,
            sizeBytes: typeof candidate.size === 'number' ? candidate.size : 0,
          };
        })
        .filter((asset): asset is ReleaseAsset => asset !== null)
    : fallback.assets;

  const preferred = selectPreferredAsset(parsedAssets);

  return {
    tagName,
    releaseTitle,
    publishedAt,
    formattedDate: formatIsoDate(publishedAt),
    releaseUrl,
    directAssetUrl: preferred?.downloadUrl ?? fallback.directAssetUrl,
    directAssetName: preferred?.name ?? fallback.directAssetName,
    bodyNotes,
    source,
    assets: parsedAssets,
  };
}

export function isCacheValid(cachedAtMs: number, ttlMs: number, nowMs: number): boolean {
  if (!Number.isFinite(cachedAtMs) || cachedAtMs <= 0 || ttlMs <= 0) {
    return false;
  }
  const age = nowMs - cachedAtMs;
  return age >= 0 && age < ttlMs;
}

export function getGameBestStatus(game: GameCompatibilityEntry): CompatibilityStatus {
  const values = Object.values(game.statuses);
  if (values.includes('In-Game')) {
    return 'In-Game';
  }
  if (values.includes('Boots to Menu')) {
    return 'Boots to Menu';
  }
  if (values.includes('Pending Release')) {
    return 'Pending Release';
  }
  return 'Not Supported Yet';
}

export function filterGames(
  games: readonly GameCompatibilityEntry[],
  searchQuery: string,
  statusFilter: CompatibilityStatus | 'All',
  emulatorFilter: CoreMatrixEmulatorId | 'all',
): GameCompatibilityEntry[] {
  const terms = expandSearchTerms(searchQuery);

  return games.filter((game) => {
    const haystack = [
      game.title,
      game.shortNote,
      game.performanceNote,
      ...(game.searchAliases ?? []),
      ...(game.verifiedEmulators ?? []),
    ]
      .join(' ')
      .toLowerCase();

    const matchesQuery =
      terms.length === 0 || terms.some((term) => haystack.includes(term));

    if (!matchesQuery) {
      return false;
    }

    if (statusFilter === 'All') {
      return true;
    }

    if (emulatorFilter !== 'all') {
      return game.statuses[emulatorFilter] === statusFilter;
    }

    return Object.values(game.statuses).includes(statusFilter);
  });
}

export function filterEmulators<T extends EmulatorProject>(
  emulators: readonly T[],
  searchQuery: string,
  category: EmulatorCategory,
): T[] {
  const terms = expandSearchTerms(searchQuery);

  return emulators.filter((emu) => {
    if (category !== 'All' && emu.category !== category) {
      return false;
    }
    if (terms.length === 0) {
      return true;
    }
    const haystack = [
      emu.name,
      emu.category,
      emu.activityLabel,
      emu.architectureSummary,
      emu.statusSummary,
      emu.repoOwner,
      emu.repoName,
      ...emu.languages,
      ...emu.graphicsBackends,
      ...emu.platforms,
      ...(emu.supportedGames ?? []),
    ]
      .join(' ')
      .toLowerCase();

    return terms.some((term) => haystack.includes(term));
  });
}

export function parseGitHubOwnerRepo(repoUrl: string): { owner: string; repo: string } | null {
  try {
    const parsed = new URL(repoUrl.trim());
    if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') {
      return null;
    }
    const parts = parsed.pathname.split('/').filter((segment) => segment.length > 0);
    if (parts.length < 2) {
      return null;
    }
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, '');
    if (!owner || !repo) {
      return null;
    }
    return { owner, repo };
  } catch {
    return null;
  }
}

export function isValidHttpsUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === 'https:' && parsed.hostname.includes('.');
  } catch {
    return false;
  }
}

export function validateEmulatorSubmission(
  input: EmulatorSubmissionInput,
): SubmissionValidationResult {
  const errors: Partial<Record<keyof EmulatorSubmissionInput, string>> = {};

  const name = input.name.trim();
  if (name.length < 2 || name.length > 60) {
    errors.name = 'Enter an emulator name between 2 and 60 characters.';
  }

  if (!parseGitHubOwnerRepo(input.repoUrl)) {
    errors.repoUrl = 'Enter a valid GitHub repository URL (e.g. https://github.com/owner/repo).';
  }

  const desc = input.description.trim();
  if (desc.length < 15 || desc.length > 320) {
    errors.description = 'Provide a brief description between 15 and 320 characters.';
  }

  if (!isValidHttpsUrl(input.releaseOrDocsUrl)) {
    errors.releaseOrDocsUrl = 'Enter a valid HTTPS link to releases or documentation.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function slugifyEmulatorId(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.length > 0 ? base : 'custom-emulator';
}

export function buildSubmissionGitHubArtifacts(
  submission: EmulatorSubmissionInput,
  trackerRepoUrl: string,
): SubmissionGitHubArtifacts {
  const parsedRepo = parseGitHubOwnerRepo(submission.repoUrl);
  const id = slugifyEmulatorId(submission.name);
  const owner = parsedRepo?.owner ?? 'community';
  const repo = parsedRepo?.repo ?? id;
  const language = submission.language?.trim() || 'C++';
  const backend = submission.graphicsBackend?.trim() || 'Vulkan';
  const platforms = submission.platforms?.trim() || 'Windows, Linux';
  const category = submission.category ?? 'PS5 Native / HLE';

  const issueBody = [
    '### New PS5 Emulator Submission',
    `- **Emulator Name:** ${submission.name.trim()}`,
    `- **GitHub Repository:** ${submission.repoUrl.trim()}`,
    `- **Latest Releases / Docs:** ${submission.releaseOrDocsUrl.trim()}`,
    `- **Category:** ${category}`,
    `- **Tech Stack:** ${language} · ${backend} · ${platforms}`,
    '',
    '### Brief Description',
    submission.description.trim(),
  ].join('\n');

  const issueUrl = `${trackerRepoUrl}/issues/new?title=${encodeURIComponent(
    `[Emulator Submission] ${submission.name.trim()}`,
  )}&labels=emulator-submission&body=${encodeURIComponent(issueBody)}`;

  const prObj = {
    id,
    name: submission.name.trim(),
    category,
    languages: language.split(',').map((s) => s.trim()).filter(Boolean),
    graphicsBackends: backend.split(',').map((s) => s.trim()).filter(Boolean),
    platforms: platforms.split(',').map((s) => s.trim()).filter(Boolean),
    repoOwner: owner,
    repoName: repo,
    repoUrl: submission.repoUrl.trim(),
    releasesPageUrl: submission.releaseOrDocsUrl.trim(),
    statusSummary: submission.description.trim(),
  };

  const prJsonSnippet = JSON.stringify(prObj, null, 2);

  const markdownRow = `- **[${submission.name.trim()}](${submission.repoUrl.trim()})** — \`${language}\` · \`${backend}\` · \`${platforms}\`  \n  ${submission.description.trim()} ([Releases / Docs](${submission.releaseOrDocsUrl.trim()}))`;

  return {
    issueUrl,
    prJsonSnippet,
    markdownRow,
  };
}

export function submissionToEmulatorProject(submission: EmulatorSubmission): EmulatorProject {
  if (submission.autoApprovedProject) {
    return submission.autoApprovedProject;
  }

  const parsedRepo = parseGitHubOwnerRepo(submission.repoUrl);
  const owner = parsedRepo?.owner ?? 'community';
  const repo = parsedRepo?.repo ?? slugifyEmulatorId(submission.name);
  const cleanDate = formatIsoDate(submission.reviewedAt ?? submission.submittedAt);
  const languages = (submission.language ?? 'C++')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const backends = (submission.graphicsBackend ?? 'Vulkan')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const platforms = (submission.platforms ?? 'Windows, Linux')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    id: `sub-${submission.id}`,
    name: submission.name,
    category: submission.category ?? 'PS5 Native / HLE',
    activityLabel: 'Community Approved · Auto-Synced',
    isMostActive: false,
    languages: languages.length > 0 ? languages : ['C++'],
    graphicsBackends: backends.length > 0 ? backends : ['Vulkan'],
    platforms: platforms.length > 0 ? platforms : ['Windows', 'Linux'],
    architectureSummary: submission.description,
    statusSummary: submission.description,
    repoOwner: owner,
    repoName: repo,
    repoUrl: submission.repoUrl,
    releasesPageUrl: submission.releaseOrDocsUrl,
    docsUrl: submission.releaseOrDocsUrl,
    apiLatestReleaseUrl: parsedRepo
      ? `https://api.github.com/repos/${owner}/${repo}/releases/latest`
      : null,
    autoApproved: true,
    fallbackRelease: {
      tagName: 'community-verified',
      releaseTitle: `${submission.name} Verified Submission`,
      publishedAt: submission.reviewedAt ?? submission.submittedAt,
      formattedDate: cleanDate,
      releaseUrl: submission.releaseOrDocsUrl,
      directAssetUrl: submission.releaseOrDocsUrl,
      directAssetName: 'Releases / Documentation',
      bodyNotes: `### Moderator Verified Addition\n- ${submission.description}\n- Source repository: ${submission.repoUrl}`,
      source: 'community-approved',
      assets: [],
    },
  };
}

export function formatCountdown(targetIso: string, nowMs: number): CountdownBreakdown {
  const targetMs = Date.parse(targetIso);
  if (Number.isNaN(targetMs) || nowMs >= targetMs) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isReleased: true,
      label: 'Console Released · Live Dump Tracking Active',
    };
  }

  const diffSeconds = Math.floor((targetMs - nowMs) / 1000);
  const days = Math.floor(diffSeconds / 86400);
  const hours = Math.floor((diffSeconds % 86400) / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  const seconds = diffSeconds % 60;

  const pad = (n: number): string => String(n).padStart(2, '0');

  return {
    days,
    hours,
    minutes,
    seconds,
    isReleased: false,
    label: `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s until console launch`,
  };
}

export function parseChangelogLines(markdown: string): ChangelogLine[] {
  if (!markdown || markdown.trim().length === 0) {
    return [{ kind: 'paragraph', text: 'No release notes published for this tag yet.' }];
  }

  const lines = markdown.split(/\r?\n/);
  const result: ChangelogLine[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (trimmed.startsWith('### ') || trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      result.push({
        kind: 'heading',
        text: trimmed.replace(/^#+\s*/, '').replaceAll('**', ''),
      });
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      result.push({
        kind: 'bullet',
        text: trimmed.slice(2).replaceAll('**', '').replaceAll('`', ''),
      });
    } else {
      result.push({
        kind: 'paragraph',
        text: trimmed.replaceAll('**', '').replaceAll('`', ''),
      });
    }
  }

  return result;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 'GitHub Asset';
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(1)} MB`;
  }
  const kb = Math.max(1, Math.round(bytes / 1024));
  return `${kb} KB`;
}
