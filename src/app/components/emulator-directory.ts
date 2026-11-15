import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { startWith } from 'rxjs';
import { EmulatorViewModel, GithubTrackerService } from '../core/github-tracker.service';
import { EMULATOR_CATEGORIES, REPO_CONFIG } from '../core/tracker-data';
import { filterEmulators, formatBytes, parseChangelogLines } from '../core/tracker-logic';
import { ChangelogLine, EmulatorCategory, EmulatorId } from '../core/tracker.types';

const DIRECTORY_QUICK_QUERIES: readonly string[] = [
  'Windows',
  'Android',
  'Rust',
  'Vulkan',
  'Bloodborne',
  'Astro Bot',
];

@Component({
  selector: 'app-emulator-directory',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatIconModule],
  template: `
    <section id="emulators" class="scroll-mt-20 py-14 border-b border-slate-800/80">
      <div class="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <!-- Section Header & Live GitHub Sync Action -->
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div>
            <h2 class="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Tracked PS5 Emulators Directory
            </h2>
            <p class="text-sm text-slate-300 mt-1.5 max-w-2xl">
              Tracking <span class="font-mono-tabular font-semibold text-white">{{ emulators().length }}</span> verified open-source PS5 emulators, translators, and compatibility layers for PC, Linux, macOS, and Android.
            </p>
            <p class="text-xs text-slate-400 mt-2 font-mono-tabular">
              Source: {{ sourceLabel() }} · Last synced: {{ lastSyncedAt() }}
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2.5 shrink-0">
            <a
              [href]="repoConfig.submitIssueUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 rounded-lg bg-[#0070D1] hover:bg-[#0080EE] px-4 py-2.5 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
            >
              <mat-icon class="!text-[16px] !h-[16px] !w-[16px]" aria-hidden="true">open_in_new</mat-icon>
              <span>Contribute via GitHub</span>
            </a>

            <button
              type="button"
              (click)="onAutoScanRepo()"
              [disabled]="isAutoScanning()"
              class="inline-flex items-center gap-1.5 rounded-lg border border-cyan-600/50 bg-[#0D1420] hover:bg-[#111A2B] disabled:opacity-60 px-3.5 py-2.5 text-xs font-semibold text-cyan-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
            >
              <mat-icon
                class="!text-[16px] !h-[16px] !w-[16px]"
                [class.animate-spin]="isAutoScanning()"
                aria-hidden="true"
              >
                autorenew
              </mat-icon>
              <span>{{ isAutoScanning() ? 'Auto-Syncing...' : 'Auto-Scan Repo & Games' }}</span>
            </button>

            <button
              type="button"
              (click)="onRefresh()"
              [disabled]="isRefreshing()"
              class="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0D1420] hover:bg-[#111A2B] disabled:opacity-60 px-4 py-2.5 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
            >
              <mat-icon
                class="!text-[16px] !h-[16px] !w-[16px]"
                [class.animate-spin]="isRefreshing()"
                aria-hidden="true"
              >
                sync
              </mat-icon>
              <span>{{ isRefreshing() ? 'Syncing GitHub API...' : 'Refresh GitHub Data' }}</span>
            </button>
          </div>
        </div>

        <p class="text-xs text-slate-400 mb-5" aria-live="polite">
          {{ syncNotice() }}
        </p>

        <!-- Directory Search & Category Filter Bar -->
        <div class="rounded-xl border border-slate-800 bg-[#0D1420] p-4 sm:p-5 mb-6 space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="text-xs text-slate-300">
              Showing <span class="font-mono-tabular font-semibold text-white">{{ filteredEmulators().length }}</span>
              of <span class="font-mono-tabular font-semibold text-white">{{ emulators().length }}</span> tracked projects
            </div>

            <div class="relative w-full sm:w-80">
              <label for="emulator-search-input" class="sr-only">Search tracked PS5 emulators</label>
              <mat-icon
                class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 !text-[18px] !h-[18px] !w-[18px] pointer-events-none"
                aria-hidden="true"
              >
                search
              </mat-icon>
              <input
                id="emulator-search-input"
                type="search"
                [formControl]="searchControl"
                placeholder="Search emulator, PC, Android APK, game..."
                class="w-full rounded-lg border border-slate-700/90 bg-[#070B12] pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-[#0070D1] focus:outline-none focus:ring-1 focus:ring-[#0070D1]"
              />
            </div>
          </div>

          <div
            class="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Filter emulators by category"
          >
            @for (cat of categories; track cat) {
              <button
                type="button"
                (click)="selectedCategory.set(cat)"
                [attr.aria-pressed]="selectedCategory() === cat"
                class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                [class]="
                  selectedCategory() === cat
                    ? 'bg-[#0070D1] text-white'
                    : 'bg-[#070B12] text-slate-300 border border-slate-800 hover:border-slate-700 hover:text-white'
                "
              >
                {{ cat }}
              </button>
            }

            @if (hasDirectoryFilters()) {
              <button
                type="button"
                (click)="resetDirectoryFilters()"
                class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-cyan-300 hover:text-cyan-200 hover:bg-slate-800/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer ml-auto"
              >
                <mat-icon class="!text-[15px] !h-[15px] !w-[15px]" aria-hidden="true">restart_alt</mat-icon>
                <span>Reset</span>
              </button>
            }
          </div>

          <div class="flex flex-wrap items-center gap-2 text-xs">
            <span class="text-slate-400 font-medium">Quick Searches:</span>
            @for (term of quickQueries; track term) {
              <button
                type="button"
                (click)="applyQuickSearch(term)"
                class="px-2.5 py-1 rounded-md border border-slate-800 bg-[#070B12] text-slate-300 hover:text-white hover:border-slate-600 transition-colors cursor-pointer"
              >
                {{ term }}
              </button>
            }
          </div>
        </div>

        <!-- Empty State vs Emulator Cards Grid -->
        @if (filteredEmulators().length === 0) {
          <div class="rounded-xl border border-slate-800 bg-[#0D1420] p-10 text-center" data-testid="emulator-empty-state">
            <mat-icon class="text-slate-500 !text-[32px] !h-[32px] !w-[32px] mb-2" aria-hidden="true">
              search_off
            </mat-icon>
            <h3 class="text-base font-semibold text-white mb-1">
              No emulators match your filter
            </h3>
            <p class="text-sm text-slate-400 mb-4 max-w-md mx-auto">
              Clear your search term or switch back to all categories, or submit a new project below.
            </p>
            <button
              type="button"
              (click)="resetDirectoryFilters()"
              class="inline-flex items-center gap-1.5 rounded-lg bg-[#0070D1] hover:bg-[#0080EE] px-4 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <mat-icon class="!text-[16px] !h-[16px] !w-[16px]" aria-hidden="true">clear_all</mat-icon>
              <span>Show all emulators</span>
            </button>
          </div>
        } @else {
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start" data-testid="emulator-cards-grid">
            @for (emu of filteredEmulators(); track emu.id) {
              <article
                class="rounded-xl border border-slate-800 bg-[#0D1420] p-6 flex flex-col justify-between"
                [attr.data-testid]="'emulator-card-' + emu.id"
              >
                <div>
                  <!-- Title & Clean Text Metadata (Zero-Pill Rule) -->
                  <div class="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <h3 class="text-xl font-bold text-white tracking-tight">
                        {{ emu.name }}
                      </h3>
                      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400 mt-1">
                        <span [class]="emu.isMostActive ? 'text-cyan-300 font-medium' : 'text-slate-300'">
                          {{ emu.activityLabel }}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{{ emu.category }}</span>
                        <span aria-hidden="true">·</span>
                        <span>{{ emu.languages.join(', ') }}</span>
                        <span aria-hidden="true">·</span>
                        <span>{{ emu.graphicsBackends.join(' / ') }}</span>
                        <span aria-hidden="true">·</span>
                        <span>{{ emu.platforms.join(' & ') }}</span>
                      </div>
                    </div>

                    <a
                      [href]="emu.repoUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                      [attr.aria-label]="'View ' + emu.name + ' repository on GitHub'"
                      class="inline-flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 px-2 rounded-md hover:bg-slate-800/60"
                    >
                      <span>Repo</span>
                      <mat-icon class="!text-[14px] !h-[14px] !w-[14px]" aria-hidden="true">open_in_new</mat-icon>
                    </a>
                  </div>

                  <!-- Summary -->
                  <p class="text-sm text-slate-300 leading-relaxed mt-3 mb-4">
                    {{ emu.statusSummary }}
                  </p>

                  <!-- Detected / Verified Supported Games -->
                  @if (emu.supportedGames && emu.supportedGames.length > 0) {
                    <div class="mb-4 text-xs text-slate-300">
                      <span class="text-slate-400 font-medium">Detected / Verified Games: </span>
                      <span class="text-cyan-200">{{ emu.supportedGames.join(' · ') }}</span>
                    </div>
                  }

                  <!-- Release Telemetry Strip -->
                  <div class="grid grid-cols-2 gap-x-4 gap-y-3 py-3.5 border-y border-slate-800/80 mb-4 text-xs">
                    <div>
                      <div class="text-slate-400 mb-0.5">Latest Tag</div>
                      <div class="font-mono-tabular font-semibold text-white break-all">
                        {{ emu.release.tagName }}
                      </div>
                    </div>
                    <div>
                      <div class="text-slate-400 mb-0.5">Release Date</div>
                      <div class="font-mono-tabular text-slate-200">
                        {{ emu.release.formattedDate }}
                      </div>
                    </div>
                    <div class="col-span-2">
                      <div class="text-slate-400 mb-0.5">Primary Release Package</div>
                      <div class="font-mono-tabular text-cyan-300 truncate" [title]="formatAssetLabel(emu)">
                        {{ formatAssetLabel(emu) }}
                      </div>
                    </div>
                  </div>

                  <!-- Expandable Changelog Viewer -->
                  @if (isChangelogExpanded(emu.id)) {
                    <div
                      [id]="'changelog-' + emu.id"
                      class="mb-5 rounded-lg border border-slate-800 bg-[#070B12] p-4 max-h-60 overflow-y-auto changelog-scroll text-xs space-y-2"
                    >
                      <div class="font-semibold text-white text-[13px] mb-2">
                        {{ emu.release.releaseTitle }}
                      </div>
                      @for (line of getChangelogLines(emu.release.bodyNotes); track $index) {
                        @if (line.kind === 'heading') {
                          <div class="font-semibold text-cyan-300 pt-1">{{ line.text }}</div>
                        } @else if (line.kind === 'bullet') {
                          <div class="flex items-start gap-2 text-slate-300 leading-relaxed">
                            <span class="text-slate-500 select-none" aria-hidden="true">–</span>
                            <span>{{ line.text }}</span>
                          </div>
                        } @else {
                          <p class="text-slate-300 leading-relaxed">{{ line.text }}</p>
                        }
                      }
                    </div>
                  }
                </div>

                <!-- Card Actions -->
                <div class="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    (click)="toggleChangelog(emu.id)"
                    [attr.aria-expanded]="isChangelogExpanded(emu.id)"
                    [attr.aria-controls]="'changelog-' + emu.id"
                    class="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#070B12] hover:bg-[#111A2B] px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                  >
                    <mat-icon class="!text-[16px] !h-[16px] !w-[16px]" aria-hidden="true">
                      {{ isChangelogExpanded(emu.id) ? 'expand_less' : 'article' }}
                    </mat-icon>
                    <span>
                      {{ isChangelogExpanded(emu.id) ? 'Hide Release Notes' : 'View Release Notes' }}
                    </span>
                  </button>

                  <a
                    [href]="emu.release.directAssetUrl ?? emu.releasesPageUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1.5 rounded-lg bg-[#0070D1] hover:bg-[#0080EE] px-4 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                  >
                    <mat-icon class="!text-[16px] !h-[16px] !w-[16px]" aria-hidden="true">download</mat-icon>
                    <span>Download Latest Build</span>
                  </a>
                </div>
              </article>
            }
          </div>
        }
      </div>
    </section>
  `,
})
export class EmulatorDirectory {
  private readonly tracker = inject(GithubTrackerService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly repoConfig = REPO_CONFIG;
  readonly categories = EMULATOR_CATEGORIES;
  readonly quickQueries = DIRECTORY_QUICK_QUERIES;
  readonly emulators = this.tracker.emulators;
  readonly isRefreshing = this.tracker.isRefreshing;
  readonly isAutoScanning = this.tracker.isAutoScanning;
  readonly lastSyncedAt = this.tracker.lastSyncedAt;
  readonly syncNotice = this.tracker.syncNotice;

  readonly searchControl = new FormControl<string>('', { nonNullable: true });
  readonly selectedCategory = signal<EmulatorCategory>('All');

  private readonly searchValue = toSignal(
    this.searchControl.valueChanges.pipe(startWith('')),
    { initialValue: '' },
  );

  readonly filteredEmulators = computed(() =>
    filterEmulators(this.emulators(), this.searchValue(), this.selectedCategory()),
  );

  readonly hasDirectoryFilters = computed(
    () => this.searchValue().trim().length > 0 || this.selectedCategory() !== 'All',
  );

  readonly expandedIds = signal<Record<EmulatorId, boolean>>({});

  readonly sourceLabel = computed<string>(() => {
    switch (this.tracker.activeDataSourceSummary()) {
      case 'github-live':
        return 'GitHub REST API (Live)';
      case 'local-cache':
        return 'localStorage Cache (GitHub API)';
      case 'static-fallback':
      case 'community-approved':
        return 'Static Snapshot (data.json)';
    }
  });

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      const urlQuery = new URLSearchParams(window.location.search).get('q');
      if (urlQuery && urlQuery.trim().length > 0) {
        this.searchControl.setValue(urlQuery.trim());
      }
    }
  }

  onAutoScanRepo(): void {
    void this.tracker.runAutomatedCompatibilitySync();
  }

  onRefresh(): void {
    void this.tracker.refreshFromGitHub(true);
  }

  applyQuickSearch(term: string): void {
    this.searchControl.setValue(term);
  }

  resetDirectoryFilters(): void {
    this.searchControl.setValue('');
    this.selectedCategory.set('All');
  }

  isChangelogExpanded(id: EmulatorId): boolean {
    return this.expandedIds()[id] === true;
  }

  toggleChangelog(id: EmulatorId): void {
    this.expandedIds.update((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  getChangelogLines(notes: string): ChangelogLine[] {
    return parseChangelogLines(notes);
  }

  formatAssetLabel(emu: EmulatorViewModel): string {
    const preferred =
      emu.release.assets.find((asset) => asset.name === emu.release.directAssetName) ??
      emu.release.assets[0];
    if (preferred) {
      return `${preferred.name} (${formatBytes(preferred.sizeBytes)})`;
    }
    return emu.release.directAssetName ?? 'GitHub Releases';
  }
}
