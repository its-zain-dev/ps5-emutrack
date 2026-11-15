import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { GithubTrackerService } from '../core/github-tracker.service';
import { FAQ_ITEMS, PYTHON_UPDATER_SNIPPET, REPO_CONFIG } from '../core/tracker-data';

@Component({
  selector: 'app-automation-and-faq',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <!-- Automation Section -->
    <section id="automation" class="scroll-mt-20 py-14 border-b border-slate-800/80">
      <div class="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div class="lg:col-span-5">
            <h2 class="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-3">
              Automated Hourly Fallback Pipeline
            </h2>
            <p class="text-sm text-slate-300 leading-relaxed mb-4">
              To eliminate GitHub unauthenticated rate limits (60 req/hr per IP), PS5 EmuTrack pairs 30-minute client-side
              <code class="font-mono-tabular text-cyan-300">localStorage</code> caching with a static
              <code class="font-mono-tabular text-cyan-300">data.json</code> snapshot updated hourly via GitHub Actions.
            </p>
            <p class="text-sm text-slate-400 leading-relaxed mb-6">
              New PS5 emulators are added exclusively via GitHub Pull Requests or maintainer-approved GitHub Issues—fork the repo, push your entry, and GitHub Actions automatically enriches metadata and updates <code class="font-mono-tabular text-cyan-300">data.json</code> &amp; <code class="font-mono-tabular text-cyan-300">README.md</code>. You can also download the complete self-hostable project source &amp; automation bundle directly as a <code class="font-mono-tabular text-cyan-300">.zip</code> archive.
            </p>

            <div class="flex flex-wrap items-center gap-3">
              <a
                href="/api/project-archive"
                download="ps5-emutrack-full-project.zip"
                class="inline-flex items-center gap-1.5 rounded-lg bg-[#0070D1] hover:bg-[#0080EE] px-3.5 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
              >
                <mat-icon class="!text-[16px] !h-[16px] !w-[16px]" aria-hidden="true">folder_zip</mat-icon>
                <span>Download Full Project (.zip)</span>
              </a>
              <a
                href="/data.json"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0D1420] hover:bg-[#111A2B] px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0"
              >
                <mat-icon class="!text-[16px] !h-[16px] !w-[16px]" aria-hidden="true">data_object</mat-icon>
                <span>Inspect /data.json</span>
              </a>
              <a
                [href]="repoConfig.submitIssueUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0D1420] hover:bg-[#111A2B] px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0"
              >
                <mat-icon class="!text-[16px] !h-[16px] !w-[16px]" aria-hidden="true">open_in_new</mat-icon>
                <span>Push via GitHub PR / Issue</span>
              </a>
            </div>
          </div>

          <div class="lg:col-span-7 rounded-xl border border-slate-800 bg-[#0D1420] overflow-hidden">
            <div class="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 bg-[#0A101A]">
              <div class="flex items-center gap-1.5" role="tablist" aria-label="Automation code preview">
                <button
                  type="button"
                  role="tab"
                  [attr.aria-selected]="activeCodeTab() === 'json'"
                  (click)="activeCodeTab.set('json')"
                  class="px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  [class]="
                    activeCodeTab() === 'json'
                      ? 'bg-[#0070D1] text-white'
                      : 'text-slate-300 hover:text-white'
                  "
                >
                  data.json Schema
                </button>
                <button
                  type="button"
                  role="tab"
                  [attr.aria-selected]="activeCodeTab() === 'python'"
                  (click)="activeCodeTab.set('python')"
                  class="px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  [class]="
                    activeCodeTab() === 'python'
                      ? 'bg-[#0070D1] text-white'
                      : 'text-slate-300 hover:text-white'
                  "
                >
                  Hourly Python Updater
                </button>
              </div>

              <button
                type="button"
                (click)="copySnippet()"
                class="inline-flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 px-2 rounded-md hover:bg-slate-800/60"
              >
                <mat-icon class="!text-[15px] !h-[15px] !w-[15px]" aria-hidden="true">
                  {{ copiedRecently() ? 'check' : 'content_copy' }}
                </mat-icon>
                <span>{{ copiedRecently() ? 'Copied' : 'Copy' }}</span>
              </button>
            </div>

            <pre class="p-4 text-xs font-mono-tabular text-slate-200 overflow-x-auto max-h-72 changelog-scroll leading-relaxed"><code>{{ activeSnippet() }}</code></pre>
          </div>
        </div>
      </div>
    </section>

    <!-- FAQ Section -->
    <section id="faq" class="scroll-mt-20 py-14">
      <div class="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <div class="max-w-3xl mb-8">
          <h2 class="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">
            Frequently Asked Questions
          </h2>
          <p class="text-sm text-slate-400">
            Current state of open-source PlayStation 5 emulation, GTA VI tracking, and verification standards.
          </p>
        </div>

        <div class="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-[#0D1420]">
          @for (item of faqItems; track item.id) {
            <div class="p-5 sm:px-6">
              <button
                type="button"
                (click)="toggleFaq(item.id)"
                [attr.aria-expanded]="openFaqId() === item.id"
                [attr.aria-controls]="'faq-panel-' + item.id"
                class="w-full flex items-center justify-between gap-4 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 rounded-md"
              >
                <span class="text-base font-semibold text-white">
                  {{ item.question }}
                </span>
                <mat-icon
                  class="text-slate-400 shrink-0 transition-transform duration-200"
                  [class.rotate-180]="openFaqId() === item.id"
                  aria-hidden="true"
                >
                  expand_more
                </mat-icon>
              </button>

              @if (openFaqId() === item.id) {
                <div
                  [id]="'faq-panel-' + item.id"
                  class="pt-3 pr-8 text-sm text-slate-300 leading-relaxed"
                >
                  {{ item.answer }}
                </div>
              }
            </div>
          }
        </div>
      </div>
    </section>
  `,
})
export class AutomationAndFaq {
  private readonly tracker = inject(GithubTrackerService);

  readonly repoConfig = REPO_CONFIG;
  readonly faqItems = FAQ_ITEMS;

  readonly activeCodeTab = signal<'json' | 'python'>('json');
  readonly openFaqId = signal<string | null>(FAQ_ITEMS[0]?.id ?? null);
  readonly copiedRecently = signal<boolean>(false);

  readonly jsonPreview = computed<string>(() => {
    const list = this.tracker.emulators();
    const previewObj = {
      generatedAt: new Date().toISOString().slice(0, 19) + 'Z',
      repoUrl: REPO_CONFIG.repoUrl,
      emulators: Object.fromEntries(
        list.map((emu) => [
          emu.id,
          {
            tagName: emu.release.tagName,
            publishedAt: emu.release.publishedAt,
            releaseUrl: emu.release.releaseUrl,
          },
        ]),
      ),
    };
    return JSON.stringify(previewObj, null, 2);
  });

  readonly activeSnippet = computed<string>(() =>
    this.activeCodeTab() === 'json' ? this.jsonPreview() : PYTHON_UPDATER_SNIPPET,
  );

  toggleFaq(id: string): void {
    this.openFaqId.update((current) => (current === id ? null : id));
  }

  async copySnippet(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.activeSnippet());
      this.copiedRecently.set(true);
      window.setTimeout(() => this.copiedRecently.set(false), 1800);
    } catch {
      // Clipboard unavailable in restricted contexts
    }
  }
}
