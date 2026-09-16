import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { RmDataService } from '../../core/services/rm-data.service';
import { RmVoiceService } from '../virtual-rm/interaction/rm-voice.service';

const ROLE_LABEL: Record<string, string> = { MAKER: 'Maker — Người lập lệnh', CHECKER: 'Checker — Người phê duyệt', ADMIN: 'Quản trị viên' };

/** "Cài đặt" nav item (docs/ui-ux-audit.md #4) — minimal on purpose: read-only account info plus
 * the one real user-facing preference that existed before this page (Virtual RM voice output),
 * moved here from being buried in the chat header only. No new persisted settings invented —
 * matches Phase 9's ban on over-engineering a focused demo app. */
@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-2xl mx-auto p-4 sm:p-6 space-y-6 pb-24">
      <h1 class="text-xl font-semibold text-ink-800">Cài đặt</h1>

      <div class="card p-5 space-y-3">
        <p class="text-xs font-semibold text-ink-500 uppercase tracking-wide">Tài khoản</p>
        <dl class="text-sm space-y-2">
          <div class="flex justify-between">
            <dt class="text-ink-400">Tên đăng nhập</dt>
            <dd class="text-ink-800 font-medium">{{ auth.currentUser()?.displayName }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-ink-400">Vai trò</dt>
            <dd class="text-ink-800 font-medium">{{ roleLabel() }}</dd>
          </div>
          <div class="flex justify-between" *ngIf="rmData.customer() as customer">
            <dt class="text-ink-400">Doanh nghiệp</dt>
            <dd class="text-ink-800 font-medium">{{ customer.companyName }}</dd>
          </div>
        </dl>
      </div>

      <div class="card p-5 space-y-3">
        <p class="text-xs font-semibold text-ink-500 uppercase tracking-wide">Trợ lý RM ảo</p>
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-ink-800">Đọc phản hồi bằng giọng nói</p>
            <p class="text-xs text-ink-500 mt-0.5">Bật để Virtual RM đọc to câu trả lời khi trò chuyện.</p>
          </div>
          <button
            type="button"
            role="switch"
            [attr.aria-checked]="voice.speechEnabled()"
            aria-label="Đọc phản hồi bằng giọng nói"
            class="w-11 h-6 rounded-full transition-colors relative shrink-0"
            [class.bg-brand-500]="voice.speechEnabled()"
            [class.bg-ink-200]="!voice.speechEnabled()"
            (click)="voice.toggleSpeechOutput()"
          >
            <span class="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform" [class.translate-x-[22px]]="voice.speechEnabled()" [class.translate-x-0.5]="!voice.speechEnabled()"></span>
          </button>
        </div>
      </div>
    </div>
  `,
})
export class SettingsPageComponent {
  readonly auth = inject(AuthService);
  readonly rmData = inject(RmDataService);
  readonly voice = inject(RmVoiceService);

  roleLabel(): string {
    const role = this.auth.currentUser()?.role;
    return role ? ROLE_LABEL[role] ?? role : '';
  }
}
