import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import {
  REPO_CONFIG,
  TRACKED_EMULATORS,
  TRENDING_GAMES,
} from './tracker-data';
import {
  GitHubRawRelease,
  isCacheValid,
  normalizeGitHubRelease,
} from './tracker-logic';
import {
  AutomationSyncResult,
  DataSourceKind,
  EmulatorId,
  EmulatorProject,
  EmulatorReleaseInfo,
  GameCompatibilityEntry,
  TrackerDataPayload,
} from './tracker.types';

interface CachedReleasesEnvelope {
  cachedAt: number;
  releases: Record<string, EmulatorReleaseInfo>;
}

export interface EmulatorViewModel extends EmulatorProject {
  release: EmulatorReleaseInfo;
}

@Injectable({
  providedIn: 'root',
})
export class GithubTrackerService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private readonly releaseMapSignal = signal<Record<string, EmulatorReleaseInfo>>(
    this.buildInitialReleaseMap(),
  );
  private readonly customEmulatorsSignal = signal<EmulatorProject[]>([]);
  private readonly supportedGamesMapSignal = signal<Record<string, string[]>>({});
  private readonly gamesSignal = signal<GameCompatibilityEntry[]>(TRENDING_GAMES);
  private readonly isRefreshingSignal = signal<boolean>(false);
  private readonly isAutoScanningSignal = signal<boolean>(false);
  private readonly lastSyncedAtSignal = signal<string>('Static Snapshot');
  private readonly syncNoticeSignal = signal<string>(
    'Loaded verified directory (24 emulators). Auto-syncing live GitHub releases & game compatibility...',
  );

  readonly isRefreshing = this.isRefreshingSignal.asReadonly();
  readonly isAutoScanning = this.isAutoScanningSignal.asReadonly();
  readonly lastSyncedAt = this.lastSyncedAtSignal.asReadonly();
  readonly syncNotice = this.syncNoticeSignal.asReadonly();
  readonly games = this.gamesSignal.asReadonly();

  readonly emulators = computed<EmulatorViewModel[]>(() => {
    const releases = this.releaseMapSignal();
    const supportedGamesMap = this.supportedGamesMapSignal();

    const seenRepoUrls = new Set<string>(
      TRACKED_EMULATORS.map((e) => e.repoUrl.toLowerCase()),
    );
    const mergedCustom: EmulatorProject[] = [];

    for (const proj of this.customEmulatorsSignal()) {
      const normalizedRepo = proj.repoUrl.toLowerCase();
      if (!seenRepoUrls.has(normalizedRepo)) {
        seenRepoUrls.add(normalizedRepo);
        mergedCustom.push(proj);
      }
    }

    const allProjects = [...mergedCustom, ...TRACKED_EMULATORS];

    return allProjects.map((emu) => {
      const mergedSupported =
        supportedGamesMap[emu.id] && supportedGamesMap[emu.id].length > 0
          ? supportedGamesMap[emu.id]
          : emu.supportedGames;

      return {
        ...emu,
        supportedGames: mergedSupported,
        release: releases[emu.id] ?? emu.fallbackRelease,
      };
    });
  });

  readonly activeDataSourceSummary = computed<DataSourceKind>(() => {
    const releases = this.releaseMapSignal();
    const sources = [
      releases['kytyps5']?.source,
      releases['sharpemu']?.source,
      releases['shadps4']?.source,
    ];
    if (sources.includes('github-live')) {
      return 'github-live';
    }
    if (sources.includes('local-cache')) {
      return 'local-cache';
    }
    return 'static-fallback';
  });

  constructor() {
    if (this.isBrowser) {
      void this.initializeClientData();
    }
  }

  private buildInitialReleaseMap(): Record<EmulatorId, EmulatorReleaseInfo> {
    const map: Record<string, EmulatorReleaseInfo> = {};
    for (const emu of TRACKED_EMULATORS) {
      map[emu.id] = emu.fallbackRelease;
    }
    return map;
  }

  async initializeClientData(): Promise<void> {
    if (!this.isBrowser) {
      return;
    }

    await this.loadStaticJsonFallback();

    const cached = this.readLocalCache();
    if (cached && isCacheValid(cached.cachedAt, REPO_CONFIG.cacheTtlMs, Date.now())) {
      this.releaseMapSignal.update((current) => ({ ...current, ...cached.releases }));
      this.lastSyncedAtSignal.set(this.formatTimeLabel(cached.cachedAt));
      this.syncNoticeSignal.set(
        'Serving cached GitHub API release metadata (30m TTL to protect rate limits).',
      );
      return;
    }

    await this.refreshFromGitHub(false);
  }

  async runAutomatedCompatibilitySync(): Promise<AutomationSyncResult | null> {
    if (!this.isBrowser || this.isAutoScanningSignal()) {
      return null;
    }
    this.isAutoScanningSignal.set(true);
    try {
      const res = await fetch('/api/automation/sync', { method: 'POST' });
      if (!res.ok) {
        this.syncNoticeSignal.set(
          'Automated compatibility sync unavailable; using cached GitHub release data.',
        );
        return null;
      }
      const payload = (await res.json()) as {
        result?: AutomationSyncResult;
        data?: Partial<TrackerDataPayload>;
      };
      if (payload.data) {
        this.applyPayloadToSignals(payload.data);
      }
      if (payload.result) {
        this.lastSyncedAtSignal.set(this.formatTimeLabel(Date.now()));
        this.syncNoticeSignal.set(payload.result.summary);
        return payload.result;
      }
      return null;
    } catch {
      return null;
    } finally {
      this.isAutoScanningSignal.set(false);
    }
  }

  async refreshFromGitHub(forceBypassCache = true): Promise<void> {
    if (!this.isBrowser || this.isRefreshingSignal()) {
      return;
    }

    if (!forceBypassCache) {
      const cached = this.readLocalCache();
      if (cached && isCacheValid(cached.cachedAt, REPO_CONFIG.cacheTtlMs, Date.now())) {
        this.releaseMapSignal.update((current) => ({ ...current, ...cached.releases }));
        this.lastSyncedAtSignal.set(this.formatTimeLabel(cached.cachedAt));
        return;
      }
    }

    this.isRefreshingSignal.set(true);
    const workingMap: Record<string, EmulatorReleaseInfo> = {
      ...this.releaseMapSignal(),
    };

    let liveFetchCount = 0;
    let rateLimited = false;

    const activeProjects = this.emulators();
    await Promise.all(
      activeProjects.map(async (emu) => {
        if (!emu.apiLatestReleaseUrl) {
          return;
        }
        // Only auto-fetch official verified release feeds unless the approved repo already verified a live GitHub Release
        const autoFeedIds = new Set(['kytyps5', 'sharpemu', 'shadps4']);
        const hasVerifiedLiveReleaseFeed =
          emu.autoApproved && emu.fallbackRelease.source === 'github-live';
        if (!autoFeedIds.has(emu.id) && !hasVerifiedLiveReleaseFeed) {
          return;
        }
        try {
          const response = await fetch(emu.apiLatestReleaseUrl, {
            headers: {
              Accept: 'application/vnd.github+json',
            },
          });

          if (response.status === 403 || response.status === 429) {
            rateLimited = true;
            return;
          }

          if (!response.ok) {
            return;
          }

          const raw = (await response.json()) as GitHubRawRelease;
          workingMap[emu.id] = normalizeGitHubRelease(
            raw,
            workingMap[emu.id] ?? emu.fallbackRelease,
            'github-live',
          );
          liveFetchCount += 1;
        } catch {
          // Network or sandbox restriction: preserve fallback gracefully
        }
      }),
    );

    this.releaseMapSignal.set(workingMap);

    const now = Date.now();
    if (liveFetchCount > 0) {
      this.writeLocalCache({
        cachedAt: now,
        releases: this.markCachedCopy(workingMap),
      });
      this.lastSyncedAtSignal.set(this.formatTimeLabel(now));
      this.syncNoticeSignal.set(
        `Synced ${liveFetchCount} official GitHub release feeds across ${this.emulators().length} tracked projects.`,
      );
    } else if (rateLimited) {
      this.syncNoticeSignal.set(
        'GitHub API rate limit reached; displaying verified static data.json release snapshot.',
      );
    } else {
      this.syncNoticeSignal.set(
        'Using verified static data.json release snapshot (official GitHub links remain active).',
      );
    }

    this.isRefreshingSignal.set(false);
  }

  private async loadStaticJsonFallback(): Promise<void> {
    try {
      const res = await fetch('/data.json');
      if (!res.ok) {
        return;
      }
      const data = (await res.json()) as Partial<TrackerDataPayload>;
      this.applyPayloadToSignals(data);
    } catch {
      // Keep embedded static fallback
    }
  }

  private applyPayloadToSignals(data: Partial<TrackerDataPayload>): void {
    if (Array.isArray(data.customEmulators)) {
      this.customEmulatorsSignal.set(data.customEmulators);
    }
    if (data.emulatorSupportedGames) {
      this.supportedGamesMapSignal.set(data.emulatorSupportedGames);
    }
    if (data.emulators) {
      this.releaseMapSignal.update((current) => {
        const next = { ...current };
        for (const [id, entry] of Object.entries(data.emulators ?? {})) {
          if (entry && entry.tagName) {
            const base = TRACKED_EMULATORS.find((e) => e.id === id)?.fallbackRelease;
            next[id] = {
              ...(base ?? entry),
              ...entry,
              source: 'static-fallback',
            };
          }
        }
        return next;
      });
    }
    if (Array.isArray(data.games) && data.games.length > 0) {
      this.gamesSignal.set(data.games);
    }
    if (data.generatedAt) {
      this.lastSyncedAtSignal.set(data.generatedAt.slice(0, 10));
    }
  }

  private markCachedCopy(
    sourceMap: Record<string, EmulatorReleaseInfo>,
  ): Record<string, EmulatorReleaseInfo> {
    const copy: Record<string, EmulatorReleaseInfo> = {};
    for (const [id, item] of Object.entries(sourceMap)) {
      copy[id] = {
        ...item,
        source: item.source === 'github-live' ? 'local-cache' : item.source,
      };
    }
    return copy;
  }

  private readLocalCache(): CachedReleasesEnvelope | null {
    try {
      const raw = window.localStorage.getItem(REPO_CONFIG.cacheStorageKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as CachedReleasesEnvelope;
      if (
        typeof parsed.cachedAt === 'number' &&
        parsed.releases &&
        parsed.releases['kytyps5'] &&
        parsed.releases['sharpemu']
      ) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  private writeLocalCache(envelope: CachedReleasesEnvelope): void {
    try {
      window.localStorage.setItem(
        REPO_CONFIG.cacheStorageKey,
        JSON.stringify(envelope),
      );
    } catch {
      // Ignore storage quota errors
    }
  }

  private formatTimeLabel(timestampMs: number): string {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(timestampMs));
  }
}
