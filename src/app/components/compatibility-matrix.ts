import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';
import { GithubTrackerService } from '../core/github-tracker.service';
import { EMULATOR_LABELS, EMULATOR_ORDER, REPO_CONFIG } from '../core/tracker-data';
import { filterGames, formatCountdown } from '../core/tracker-logic';
import { CompatibilityStatus, CoreMatrixEmulatorId, CountdownBreakdown } from '../core/tracker.types';
import { StatusBadge } from './status-badge';

const STATUS_FILTER_OPTIONS: readonly (CompatibilityStatus | 'All')[] = [
  'All',
  'In-Game',
  'Boots to Menu',
  'Pending Release',
  'Not Supported Yet',
];

const TRENDING_GAME_QUERIES: readonly string[] = [
  'GTA VI',
  'Ghost of Yōtei',
  'Astro Bot',
  'Bloodborne',
  "Demon's Souls",
  'Spider-Man 2',
];

@Component({
  selector: 'app-compatibility-matrix',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatIconModule, StatusBadge],
  template: `
    <section id="compatibility" class="scroll-mt-20 pt-10 pb-14 border-b border-slate-800/80">
      <div class="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <!-- High-CTR Hero & GTA VI Live Countdown Strip -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch mb-10">
          <div class="lg:col-span-7 flex flex-col justify-between">
            <div>
              <p class="text-xs font-semibold tracking-wide text-cyan-300 mb-3">
                Live 2026 PS5 Emulation Radar · Hourly Auto-Synced with GitHub
              </p>
              <h1 class="text-3xl sm:text-5xl font-bold tracking-tight text-white text-balance leading-[1.12] mb-4">
                PS5 Emulator Releases &amp; GTA VI Compatibility Hub
              </h1>
              <p class="text-base text-slate-300 leading-relaxed max-w-2xl mb-6">
                Download official open-source builds for <span class="text-white font-medium">Windows PC, Linux, macOS &amp; Android</span> across
                <span class="text-white font-medium">24+ PS5 emulators</span> including
                <span class="text-white font-medium">KytyPS5</span>,
                <span class="text-white font-medium">SharpEmu</span>,
                <span class="text-white font-medium">shadPS4</span>,
                <span class="text-white font-medium">Prosperity</span>, and
                <span class="text-white font-medium">AnyPS5</span>—with automated game compatibility scanning.
              </p>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <a
                href="#emulators"
                class="inline-flex items-center gap-2 rounded-lg bg-[#0070D1] hover:bg-[#0080EE] px-4 py-2.5 text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
              >
                <mat-icon class="!text-[18px] !h-[18px] !w-[18px]" aria-hidden="true">download</mat-icon>
                <span>Get Verified PS5 Builds</span>
              </a>
              <button
                type="button"
                (click)="onAutoScan()"
                [disabled]="isAutoScanning()"
                class="inline-flex items-center gap-2 rounded-lg border border-cyan-600/50 bg-[#0D1420] hover:bg-[#111A2B] disabled:opacity-60 px-4 py-2.5 text-sm font-medium text-cyan-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
              >
                <mat-icon
                  class="!text-[18px] !h-[18px] !w-[18px]"
                  [class.animate-spin]="isAutoScanning()"
                  aria-hidden="true"
                >
                  autorenew
                </mat-icon>
                <span>{{ isAutoScanning() ? 'Auto-Scanning GitHub...' : 'Auto-Scan Games & GTA VI' }}</span>
              </button>
              <a
                [href]="repoConfig.issuesReportUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0D1420] hover:bg-[#111A2B] px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
              >
                <mat-icon class="!text-[18px] !h-[18px] !w-[18px]" aria-hidden="true">bug_report</mat-icon>
                <span>Report Game</span>
              </a>
            </div>
          </div>

          <!-- Featured GTA VI Spotlight Panel -->
          @if (gtaEntry(); as gta) {
            <aside
              aria-label="Featured Title: Grand Theft Auto VI Tracker"
              class="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0D1420] p-6 flex flex-col justify-between"
            >
              <div>
                <div class="flex items-center justify-between gap-3 mb-3">
                  <span class="text-xs font-medium text-amber-300">
                    Featured Flagship Watch · Auto-Monitored
                  </span>
                  <app-status-badge status="Pending Release" />
                </div>

                <h2 class="text-xl font-bold text-white tracking-tight mb-1">
                  {{ gta.title }}
                </h2>
                <p class="text-xs text-slate-400 mb-5">
                  {{ gta.shortNote }} · Last verified {{ gta.lastVerifiedDate }}
                </p>

                <!-- Countdown Grid -->
                @if (gtaCountdown(); as cd) {
                  @if (!cd.isReleased) {
                    <div class="grid grid-cols-4 gap-2 mb-4" aria-label="GTA VI Launch Countdown">
                      <div class="rounded-lg border border-slate-800/90 bg-[#070B12] px-2.5 py-2 text-center">
                        <div class="font-mono-tabular text-lg font-semibold text-white">{{ cd.days }}</div>
                        <div class="text-[11px] text-slate-400">Days</div>
                      </div>
                      <div class="rounded-lg border border-slate-800/90 bg-[#070B12] px-2.5 py-2 text-center">
                        <div class="font-mono-tabular text-lg font-semibold text-white">{{ padTwo(cd.hours) }}</div>
                        <div class="text-[11px] text-slate-400">Hours</div>
                      </div>
                      <div class="rounded-lg border border-slate-800/90 bg-[#070B12] px-2.5 py-2 text-center">
                        <div class="font-mono-tabular text-lg font-semibold text-white">{{ padTwo(cd.minutes) }}</div>
                        <div class="text-[11px] text-slate-400">Mins</div>
                      </div>
                      <div class="rounded-lg border border-slate-800/90 bg-[#070B12] px-2.5 py-2 text-center">
                        <div class="font-mono-tabular text-lg font-semibold text-cyan-300">{{ padTwo(cd.seconds) }}</div>
                        <div class="text-[11px] text-slate-400">Secs</div>
                      </div>
                    </div>
                  } @else {
                    <div class="rounded-lg border border-emerald-700/40 bg-emerald-950/30 px-3 py-2.5 mb-4 text-xs font-medium text-emerald-300">
                      {{ cd.label }}
                    </div>
                  }
                }
              </div>

              <div class="pt-4 border-t border-slate-800/80 text-xs text-slate-300 leading-relaxed">
                {{ gta.performanceNote }}
              </div>
            </aside>
          }
        </div>

        <!-- Trending Games Compatibility Matrix Toolbar -->
        <div class="rounded-xl border border-slate-800 bg-[#0D1420] overflow-hidden">
          <div class="p-5 sm:p-6 border-b border-slate-800/80 space-y-4">
            <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h2 class="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  Trending Games Compatibility Matrix
                </h2>
                <p class="text-sm text-slate-400 mt-1">
                  Showing <span class="font-mono-tabular text-slate-200">{{ filteredGames().length }}</span>
                  of <span class="font-mono-tabular text-slate-200">{{ games().length }}</span> auto-scanned PS5 titles across core emulators
                </p>
              </div>

              <!-- Search & Emulator Filter Controls -->
              <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div class="relative flex-1 sm:w-72">
                  <label for="game-search-input" class="sr-only">Search PS5 games or aliases</label>
                  <mat-icon
                    class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 !text-[18px] !h-[18px] !w-[18px] pointer-events-none"
                    aria-hidden="true"
                  >
                    search
                  </mat-icon>
                  <input
                    id="game-search-input"
                    type="search"
                    [formControl]="searchControl"
                    placeholder="Search GTA 6, Bloodborne, Yōtei..."
                    class="w-full rounded-lg border border-slate-700/90 bg-[#070B12] pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-[#0070D1] focus:outline-none focus:ring-1 focus:ring-[#0070D1]"
                  />
                </div>

                <div class="sm:w-44">
                  <label for="emulator-filter-select" class="sr-only">Filter by emulator</label>
                  <select
                    id="emulator-filter-select"
                    [formControl]="emulatorControl"
                    class="w-full rounded-lg border border-slate-700/90 bg-[#070B12] px-3 py-2 text-sm text-slate-100 focus:border-[#0070D1] focus:outline-none focus:ring-1 focus:ring-[#0070D1]"
                  >
                    <option value="all">All Emulators</option>
                    @for (emuId of emulatorOrder; track emuId) {
                      <option [value]="emuId">{{ emulatorLabels[emuId] }}</option>
                    }
                  </select>
                </div>
              </div>
            </div>

            <!-- Status Filter Segmented Controls -->
            <div
              class="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label="Filter compatibility matrix by status"
            >
              @for (statusOpt of statusOptions; track statusOpt) {
                <button
                  type="button"
                  (click)="setStatusFilter(statusOpt)"
                  [attr.aria-pressed]="selectedStatus() === statusOpt"
                  class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                  [class]="
                    selectedStatus() === statusOpt
                      ? 'bg-[#0070D1] text-white'
                      : 'bg-[#070B12] text-slate-300 border border-slate-800 hover:border-slate-700 hover:text-white'
                  "
                >
                  {{ statusOpt }}
                </button>
              }

              @if (hasActiveFilters()) {
                <button
                  type="button"
                  (click)="resetFilters()"
                  class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-cyan-300 hover:text-cyan-200 hover:bg-slate-800/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer ml-auto"
                >
                  <mat-icon class="!text-[15px] !h-[15px] !w-[15px]" aria-hidden="true">restart_alt</mat-icon>
                  <span>Reset filters</span>
                </button>
              }
            </div>

            <!-- Broad Query Quick-Search Bar -->
            <div class="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <span class="text-slate-400 font-medium">Trending Queries:</span>
              @for (term of trendingQueries; track term) {
                <button
                  type="button"
                  (click)="applyQuickQuery(term)"
                  class="px-2.5 py-1 rounded-md border border-slate-800 bg-[#070B12] text-slate-300 hover:text-white hover:border-slate-600 transition-colors cursor-pointer"
                >
                  {{ term }}
                </button>
              }
            </div>
          </div>

          <!-- Populated vs Empty State -->
          @if (filteredGames().length === 0) {
            <div class="p-10 text-center" data-testid="matrix-empty-state">
              <mat-icon class="text-slate-500 !text-[32px] !h-[32px] !w-[32px] mb-2" aria-hidden="true">
                search_off
              </mat-icon>
              <h3 class="text-base font-semibold text-white mb-1">
                No tracked titles match your filter
              </h3>
              <p class="text-sm text-slate-400 mb-4 max-w-md mx-auto">
                Try clearing the search query or switching back to all compatibility statuses.
              </p>
              <button
                type="button"
                (click)="resetFilters()"
                class="inline-flex items-center gap-1.5 rounded-lg bg-[#0070D1] hover:bg-[#0080EE] px-4 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <mat-icon class="!text-[16px] !h-[16px] !w-[16px]" aria-hidden="true">clear_all</mat-icon>
                <span>Clear filters</span>
              </button>
            </div>
          } @else {
            <!-- Desktop Data Table -->
            <div class="hidden md:block overflow-x-auto">
              <table class="w-full text-left border-collapse" data-testid="compatibility-table">
                <thead>
                  <tr class="border-b border-slate-800 bg-[#0A101A] text-xs font-semibold text-slate-300">
                    <th scope="col" class="py-3.5 pl-6 pr-4 min-w-[270px]">Title &amp; Notes</th>
                    <th scope="col" class="py-3.5 px-3">KytyPS5</th>
                    <th scope="col" class="py-3.5 px-3">SharpEmu</th>
                    <th scope="col" class="py-3.5 px-3">Prosperity</th>
                    <th scope="col" class="py-3.5 px-3">AnyPS5</th>
                    <th scope="col" class="py-3.5 pl-3 pr-6 text-right whitespace-nowrap">Last Verified</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-800/70 text-sm">
                  @for (game of filteredGames(); track game.id) {
                    <tr class="hover:bg-[#111A2B]/65 transition-colors align-top">
                      <td class="py-4 pl-6 pr-4 min-w-[270px] max-w-[330px]">
                        <div class="font-semibold text-white leading-snug">{{ game.title }}</div>
                        <p class="text-xs text-slate-400 mt-0.5">
                          {{ game.shortNote }}
                          @if (game.featured) {
                            <span class="text-amber-300 font-medium"> · Flagship Watch</span>
                          }
                        </p>
                        <p class="text-xs text-slate-300/90 mt-1.5 leading-relaxed">
                          {{ game.performanceNote }}
                        </p>
                      </td>
                      <td class="py-4 px-3">
                        <app-status-badge [status]="game.statuses.kytyps5" />
                      </td>
                      <td class="py-4 px-3">
                        <app-status-badge [status]="game.statuses.sharpemu" />
                      </td>
                      <td class="py-4 px-3">
                        <app-status-badge [status]="game.statuses.prosperity" />
                      </td>
                      <td class="py-4 px-3">
                        <app-status-badge [status]="game.statuses.anyps5" />
                      </td>
                      <td class="py-4 pl-3 pr-6 text-right font-mono-tabular text-xs text-slate-300 whitespace-nowrap">
                        {{ game.lastVerifiedDate }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <!-- Mobile Stacked Cards (< 768px) -->
            <div class="md:hidden divide-y divide-slate-800/80" data-testid="compatibility-mobile-list">
              @for (game of filteredGames(); track game.id) {
                <article class="p-4 space-y-3">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <h3 class="text-base font-semibold text-white">{{ game.title }}</h3>
                      <p class="text-xs text-slate-400 mt-0.5">{{ game.shortNote }}</p>
                    </div>
                    <span class="font-mono-tabular text-xs text-slate-400 whitespace-nowrap shrink-0">
                      {{ game.lastVerifiedDate }}
                    </span>
                  </div>

                  <p class="text-xs text-slate-300 leading-relaxed">
                    {{ game.performanceNote }}
                  </p>

                  <div class="grid grid-cols-2 gap-2 pt-1">
                    @for (emuId of emulatorOrder; track emuId) {
                      <div class="flex flex-col gap-1 rounded-lg border border-slate-800/80 bg-[#070B12] p-2.5">
                        <span class="text-[11px] font-medium text-slate-400">
                          {{ emulatorLabels[emuId] }}
                        </span>
                        <div>
                          <app-status-badge [status]="game.statuses[emuId]" />
                        </div>
                      </div>
                    }
                  </div>
                </article>
              }
            </div>
          }
        </div>
      </div>
    </section>
  `,
})
export class CompatibilityMatrix {
  private readonly tracker = inject(GithubTrackerService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  readonly repoConfig = REPO_CONFIG;
  readonly emulatorOrder = EMULATOR_ORDER;
  readonly emulatorLabels = EMULATOR_LABELS;
  readonly statusOptions = STATUS_FILTER_OPTIONS;
  readonly trendingQueries = TRENDING_GAME_QUERIES;
  readonly isAutoScanning = this.tracker.isAutoScanning;

  readonly searchControl = new FormControl<string>('', { nonNullable: true });
  readonly emulatorControl = new FormControl<CoreMatrixEmulatorId | 'all'>('all', {
    nonNullable: true,
  });

  readonly selectedStatus = signal<CompatibilityStatus | 'All'>('All');
  private readonly nowMsSignal = signal<number>(Date.parse('2026-11-15T06:13:28-08:00'));

  private readonly searchValue = toSignal(
    this.searchControl.valueChanges.pipe(startWith('')),
    { initialValue: '' },
  );
  private readonly emulatorValue = toSignal(
    this.emulatorControl.valueChanges.pipe(startWith<'all' | CoreMatrixEmulatorId>('all')),
    { initialValue: 'all' as const },
  );

  readonly games = this.tracker.games;

  readonly gtaEntry = computed(() =>
    this.games().find((item) => item.id === 'gta-vi') ?? null,
  );

  readonly gtaCountdown = computed<CountdownBreakdown | null>(() => {
    const gta = this.gtaEntry();
    if (!gta?.releaseTargetIso) {
      return null;
    }
    return formatCountdown(gta.releaseTargetIso, this.nowMsSignal());
  });

  readonly filteredGames = computed(() =>
    filterGames(
      this.games(),
      this.searchValue(),
      this.selectedStatus(),
      this.emulatorValue(),
    ),
  );

  readonly hasActiveFilters = computed(
    () =>
      this.searchValue().trim().length > 0 ||
      this.selectedStatus() !== 'All' ||
      this.emulatorValue() !== 'all',
  );

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      const urlQuery = new URLSearchParams(window.location.search).get('q');
      if (urlQuery && urlQuery.trim().length > 0) {
        this.searchControl.setValue(urlQuery.trim());
      }
      this.nowMsSignal.set(Date.now());
      const timerId = window.setInterval(() => {
        this.nowMsSignal.set(Date.now());
      }, 1000);
      this.destroyRef.onDestroy(() => window.clearInterval(timerId));
    }
  }

  onAutoScan(): void {
    void this.tracker.runAutomatedCompatibilitySync();
  }

  applyQuickQuery(query: string): void {
    this.searchControl.setValue(query);
  }

  setStatusFilter(status: CompatibilityStatus | 'All'): void {
    this.selectedStatus.set(status);
  }

  resetFilters(): void {
    this.searchControl.setValue('');
    this.emulatorControl.setValue('all');
    this.selectedStatus.set('All');
  }

  padTwo(value: number): string {
    return String(value).padStart(2, '0');
  }
}
