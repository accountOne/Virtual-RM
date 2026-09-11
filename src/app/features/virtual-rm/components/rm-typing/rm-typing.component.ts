import { CommonModule } from '@angular/common';
import { Component, Input, inject } from '@angular/core';
import { RM_STATE_LABEL, RMState } from '../../interaction/rm-interaction.types';
import { RmTimingService } from '../../interaction/rm-timing.service';

/** Phase 5.6 typing/thinking indicator (spec §4/§25). Shows a high-level UX state label
 * ("Em đang phân tích...") — never chain-of-thought — with an animated dot unless the customer
 * has `prefers-reduced-motion` on, in which case the dots render static. Reused for both the
 * mid-conversation "thinking" bubble and the proactive-greeting reveal (hence its own component
 * per docs/phase-5.6-interaction-architecture.md §3). */
@Component({
  selector: 'app-rm-typing',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex">
      <div class="bg-ink-50 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm text-ink-500 flex items-center gap-2">
        <span>{{ label }}</span>
        <span class="inline-flex gap-1 items-center" [class.animate-pulse]="!reducedMotion">
          <span class="w-1.5 h-1.5 rounded-full bg-rose-300"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-brand-400"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-brand-600"></span>
        </span>
      </div>
    </div>
  `,
})
export class RmTypingComponent {
  @Input() state: RMState = 'PROCESSING';

  private readonly timing = inject(RmTimingService);
  readonly reducedMotion = this.timing.prefersReducedMotion();

  get label(): string {
    return RM_STATE_LABEL[this.state] ?? 'Em đang xử lý...';
  }
}
