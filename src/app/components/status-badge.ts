import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CompatibilityStatus } from '../core/tracker.types';

@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <span
      class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0"
      [class]="badgeClasses()"
    >
      <mat-icon class="!text-[14px] !h-[14px] !w-[14px] leading-none" aria-hidden="true">
        {{ iconName() }}
      </mat-icon>
      <span>{{ status() }}</span>
    </span>
  `,
})
export class StatusBadge {
  readonly status = input.required<CompatibilityStatus>();

  readonly iconName = computed<string>(() => {
    switch (this.status()) {
      case 'In-Game':
        return 'check_circle';
      case 'Boots to Menu':
        return 'play_circle';
      case 'Pending Release':
        return 'schedule';
      case 'Not Supported Yet':
        return 'cancel';
    }
  });

  readonly badgeClasses = computed<string>(() => {
    switch (this.status()) {
      case 'In-Game':
        return 'border-emerald-600/50 bg-emerald-950/70 text-emerald-300';
      case 'Boots to Menu':
        return 'border-sky-600/50 bg-sky-950/70 text-sky-300';
      case 'Pending Release':
        return 'border-amber-500/50 bg-amber-950/70 text-amber-300';
      case 'Not Supported Yet':
        return 'border-rose-600/50 bg-rose-950/70 text-rose-300';
    }
  });
}
