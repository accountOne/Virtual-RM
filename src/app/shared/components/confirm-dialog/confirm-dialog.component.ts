import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      *ngIf="dialog.state() as req"
      class="fixed inset-0 z-[60] bg-ink-900/40 flex items-center justify-center p-4"
      (click)="dialog.resolve(false)"
    >
      <div class="card w-full max-w-sm p-5 shadow-pop" (click)="$event.stopPropagation()">
        <h3 class="text-base font-semibold text-ink-800">{{ req.title }}</h3>
        <p class="text-sm text-ink-500 mt-2">{{ req.message }}</p>
        <div class="flex justify-end gap-2 mt-5">
          <button class="btn-secondary" (click)="dialog.resolve(false)">{{ req.cancelLabel || 'Huỷ' }}</button>
          <button [class]="req.danger ? 'btn-danger' : 'btn-primary'" (click)="dialog.resolve(true)">
            {{ req.confirmLabel || 'Xác nhận' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ConfirmDialogComponent {
  readonly dialog = inject(ConfirmDialogService);
}
