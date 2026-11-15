import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import JSZip from 'jszip';
import { applyDiscoveredGamesToMatrix } from './app/core/compatibility-scanner';
import { shouldIncludeArchiveEntry } from './app/core/project-archive-filter';
import {
  REPO_CONFIG,
  TRACKED_EMULATORS,
  TRENDING_GAMES,
} from './app/core/tracker-data';
import {
  GitHubRawRelease,
  normalizeGitHubRelease,
} from './app/core/tracker-logic';
import {
  AutomationSyncResult,
  EmulatorProject,
  GameCompatibilityEntry,
  TrackerDataPayload,
} from './app/core/tracker.types';

const browserDistFolder = join(import.meta.dirname, '../browser');
const publicDataJsonPath = join(process.cwd(), 'public', 'data.json');

const app = express();
app.use(express.json({ limit: '64kb' }));

const angularApp = new AngularNodeAppEngine();

function getGitHubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ps5-emutrack-automation-bot',
  };
  const token = process.env['GITHUB_TOKEN'];
  if (token && token.trim().length > 0) {
    headers['Authorization'] = `Bearer ${token.trim()}`;
  }
  return headers;
}

async function fetchJsonSafe<T>(url: string, timeoutMs = 8000): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
      headers: getGitHubHeaders(),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

interface GitHubReadmePayload {
  content?: string;
  encoding?: string;
}

function decodeBase64Content(payload: GitHubReadmePayload | null): string {
  if (!payload?.content || payload.encoding !== 'base64') {
    return '';
  }
  try {
    return Buffer.from(payload.content, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

async function readPublicDataJson(): Promise<TrackerDataPayload> {
  try {
    const raw = await readFile(publicDataJsonPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<TrackerDataPayload>;
    return {
      generatedAt: parsed.generatedAt ?? new Date().toISOString(),
      repoUrl: parsed.repoUrl ?? REPO_CONFIG.repoUrl,
      lastCompatibilityScan: parsed.lastCompatibilityScan,
      emulators: parsed.emulators ?? {},
      emulatorSupportedGames: parsed.emulatorSupportedGames ?? {},
      customEmulators: Array.isArray(parsed.customEmulators) ? parsed.customEmulators : [],
      games: Array.isArray(parsed.games) && parsed.games.length > 0 ? parsed.games : [...TRENDING_GAMES],
    };
  } catch {
    return {
      generatedAt: new Date().toISOString(),
      repoUrl: REPO_CONFIG.repoUrl,
      emulators: {},
      emulatorSupportedGames: {},
      customEmulators: [],
      games: [...TRENDING_GAMES],
    };
  }
}

async function writePublicDataJson(payload: TrackerDataPayload): Promise<void> {
  await mkdir(join(process.cwd(), 'public'), { recursive: true });
  await writeFile(publicDataJsonPath, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
}

async function runFullAutomatedSync(): Promise<{
  result: AutomationSyncResult;
  payload: TrackerDataPayload;
}> {
  const payload = await readPublicDataJson();
  const nowIso = new Date().toISOString();
  const scanInputs: Record<string, { emulatorName: string; text: string }> = {};

  let updatedReleases = 0;

  const allTargets: EmulatorProject[] = [
    ...TRACKED_EMULATORS,
    ...(payload.customEmulators ?? []),
  ];

  await Promise.all(
    allTargets.map(async (emu) => {
      const scanChunks: string[] = [
        emu.name,
        emu.statusSummary,
        emu.fallbackRelease.bodyNotes,
        ...(emu.supportedGames ?? []),
      ];

      if (emu.apiLatestReleaseUrl) {
        const rawRel = await fetchJsonSafe<GitHubRawRelease>(emu.apiLatestReleaseUrl, 7000);
        if (rawRel) {
          const normalized = normalizeGitHubRelease(
            rawRel,
            payload.emulators[emu.id] ?? emu.fallbackRelease,
            'static-fallback',
          );
          payload.emulators[emu.id] = normalized;
          updatedReleases += 1;
          scanChunks.push(normalized.bodyNotes, normalized.releaseTitle);
        }

        const readme = await fetchJsonSafe<GitHubReadmePayload>(
          `https://api.github.com/repos/${emu.repoOwner}/${emu.repoName}/readme`,
          7000,
        );
        const decoded = decodeBase64Content(readme);
        if (decoded) {
          scanChunks.push(decoded);
        }
      }

      scanInputs[emu.id] = {
        emulatorName: emu.name,
        text: scanChunks.join('\n'),
      };
    }),
  );

  const currentGames: GameCompatibilityEntry[] =
    payload.games && payload.games.length > 0 ? payload.games : [...TRENDING_GAMES];

  const matrixUpdate = applyDiscoveredGamesToMatrix(currentGames, scanInputs, nowIso);

  payload.generatedAt = nowIso;
  payload.lastCompatibilityScan = nowIso;
  payload.games = matrixUpdate.games;
  payload.emulatorSupportedGames = {
    ...(payload.emulatorSupportedGames ?? {}),
    ...matrixUpdate.emulatorSupportedGames,
  };

  if (payload.customEmulators) {
    payload.customEmulators = payload.customEmulators.map((custom) => ({
      ...custom,
      supportedGames:
        payload.emulatorSupportedGames?.[custom.id] ?? custom.supportedGames ?? [],
      lastAutoScannedAt: nowIso,
    }));
  }

  await writePublicDataJson(payload);

  const gta = payload.games.find((g) => g.id === 'gta-vi');
  const gtaStatus = gta?.statuses.kytyps5 ?? 'Pending Release';

  const result: AutomationSyncResult = {
    generatedAt: nowIso,
    scannedEmulators: allTargets.length,
    updatedReleases,
    discoveredGameMentions: matrixUpdate.discoveredCount,
    gtaStatus,
    summary: `Auto-synced ${allTargets.length} emulators (${updatedReleases} live release feeds, ${matrixUpdate.discoveredCount} game compatibility signals detected). GTA VI status: ${gtaStatus}.`,
  };

  return { result, payload };
}

/**
 * Dynamic SEO endpoints: robots.txt and sitemap.xml
 */
app.get('/robots.txt', (req, res) => {
  const baseUrl =
    process.env['APP_URL']?.replace(/\/+$/, '') || `${req.protocol}://${req.get('host')}`;
  res
    .type('text/plain')
    .send(
      `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`,
    );
});

app.get('/sitemap.xml', (req, res) => {
  const baseUrl =
    process.env['APP_URL']?.replace(/\/+$/, '') || `${req.protocol}://${req.get('host')}`;
  const lastMod = new Date().toISOString().slice(0, 10);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/data.json</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>`;
  res.type('application/xml').send(xml);
});

/**
 * Automated Compatibility & Release Sync endpoint:
 * Scans GitHub releases + READMEs across tracked emulators, updates GTA VI
 * and game support matrix automatically, and persists public/data.json.
 */
app.post('/api/automation/sync', async (_req, res) => {
  try {
    const { result, payload } = await runFullAutomatedSync();
    res.json({ result, data: payload });
  } catch {
    res.status(500).json({ error: 'Automated compatibility scan failed.' });
  }
});

async function addDirectoryToZip(
  zip: JSZip,
  rootDir: string,
  relPrefix = '',
): Promise<void> {
  const currentDir = relPrefix ? join(rootDir, ...relPrefix.split('/')) : rootDir;
  const entries = await readdir(currentDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    const relPosix = relPrefix ? posix.join(relPrefix, entry.name) : entry.name;
    const isDir = entry.isDirectory();
    if (!shouldIncludeArchiveEntry(relPosix, isDir)) {
      continue;
    }
    if (isDir) {
      await addDirectoryToZip(zip, rootDir, relPosix);
    } else if (entry.isFile()) {
      const content = await readFile(join(currentDir, entry.name));
      zip.file(`ps5-emutrack/${relPosix}`, content);
    }
  }
}

async function buildProjectArchiveBuffer(rootDir: string): Promise<Buffer> {
  const zip = new JSZip();
  await addDirectoryToZip(zip, rootDir);
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

/**
 * Full Project ZIP Export endpoint:
 * Packages source code, automation scripts, workflows, docs, and static snapshot
 * while excluding node_modules, build artifacts, caches, and .env secrets.
 */
app.get('/api/project-archive', async (_req, res) => {
  try {
    const archiveBuffer = await buildProjectArchiveBuffer(process.cwd());
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="ps5-emutrack-full-project.zip"',
    );
    res.setHeader('Content-Length', String(archiveBuffer.length));
    res.setHeader('Cache-Control', 'no-store');
    res.send(archiveBuffer);
  } catch {
    res.status(500).json({ error: 'Failed to package full project archive.' });
  }
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);

    // Run background hourly automated compatibility & release sync
    setInterval(() => {
      void runFullAutomatedSync().catch(() => {
        // Silent retry on next hourly tick
      });
    }, 60 * 60 * 1000);
  });
}

export const reqHandler = createNodeRequestHandler(app);
