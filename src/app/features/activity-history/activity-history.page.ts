import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuditEvent, AuditEventType, CommandsService } from '../../core/services/commands.service';
import { AuthService } from '../../core/services/auth.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';

const EVENT_LABEL: Record<AuditEventType, string> = {
  DRAFT_CREATED: 'Tạo bản nháp',
  FIELD_UPDATED: 'Chỉnh sửa thông tin',
  VALIDATED: 'Kiểm tra hợp lệ',
  SUBMITTED: 'Gửi duyệt',
  VIEWED_BY_CHECKER: 'Checker đã xem',
  APPROVED: 'Đã phê duyệt',
  REJECTED: 'Đã từ chối',
  CANCELLED: 'Đã hủy',
  EXECUTED: 'Đã thực hiện (mô phỏng)',
  FAILED: 'Thất bại',
};

const ROLE_LABEL: Record<string, string> = { MAKER: 'Maker', CHECKER: 'Checker', ADMIN: 'Admin', SYSTEM: 'Hệ thống' };

/** "Lịch sử hoạt động" nav item (docs/ui-ux-audit.md #3) — a cross-command feed, unlike the
 * per-command audit timeline already on command-detail.page.ts. Server scopes visibility by role
 * (commandsService.activityHistoryFor()): Maker sees only their own commands' events, Checker/
 * Admin see everything (same as the unfiltered Checker queue already lets them see). */
@Component({
  selector: 'app-activity-history-page',
  standalone: true,
  imports: [CommonModule, RouterLink, LoadingSpinnerComponent, EmptyStateComponent],
  template: `
    <div class="max-w-3xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <div>
        <h1 class="text-xl font-semibold text-ink-800">Lịch sử hoạt động</h1>
        <p class="text-sm text-ink-500 mt-1" *ngIf="loaded()">{{ events().length }} sự kiện</p>
      </div>

      <app-loading-spinner *ngIf="!loaded()" />

      <app-empty-state
        *ngIf="loaded() && events().length === 0"
        icon="🕘"
        title="Chưa có hoạt động nào"
        subtitle="Mọi thao tác trên lệnh giao dịch (tạo, gửi duyệt, phê duyệt, từ chối...) sẽ hiện ở đây."
      />

      <div class="card divide-y divide-ink-100" *ngIf="loaded() && events().length > 0">
        <a
          *ngFor="let e of events()"
          [routerLink]="detailLink(e)"
          class="block px-4 py-3.5 hover:bg-ink-50 transition-colors"
        >
          <div class="flex items-start gap-2.5">
            <span class="w-1.5 h-1.5 rounded-full bg-brand-400 mt-2 flex-shrink-0"></span>
            <div class="min-w-0 flex-1">
              <p class="text-sm text-ink-800">
                <span class="font-medium">{{ eventLabel(e.eventType) }}</span>
                <span class="text-ink-400"> · {{ referenceNo(e.commandId) }} · {{ roleLabel(e.actorRole) }}</span>
              </p>
              <p class="text-xs text-ink-400 mt-0.5">{{ e.createdAt | date: 'dd/MM/yyyy HH:mm' }}</p>
            </div>
          </div>
        </a>
      </div>
    </div>
  `,
})
export class ActivityHistoryPageComponent implements OnInit {
  private readonly commands = inject(CommandsService);
  private readonly auth = inject(AuthService);

  readonly events = signal<AuditEvent[]>([]);
  readonly loaded = signal(false);
  private readonly referenceById = new Map<string, string>();

  ngOnInit(): void {
    this.load();
  }

  private async load(): Promise<void> {
    try {
      const isChecker = this.auth.hasRole('CHECKER', 'ADMIN');
      const [events, commands] = await Promise.all([
        this.commands.activityHistory(),
        isChecker ? this.commands.checkerQueue() : this.commands.list(),
      ]);
      for (const c of commands) this.referenceById.set(c.id, c.referenceNo);
      this.events.set(events);
    } finally {
      this.loaded.set(true);
    }
  }

  eventLabel(type: AuditEventType): string {
    return EVENT_LABEL[type] ?? type;
  }

  roleLabel(role: string): string {
    return ROLE_LABEL[role] ?? role;
  }

  referenceNo(commandId: string): string {
    return this.referenceById.get(commandId) ?? commandId.slice(0, 8);
  }

  detailLink(e: AuditEvent): string[] {
    return this.auth.hasRole('CHECKER', 'ADMIN') ? ['/payments/approval', e.commandId] : ['/payments/my-commands', e.commandId];
  }
}
