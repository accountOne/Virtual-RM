import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChatUiService } from '../../../../core/services/chat-ui.service';
import { RmDataService } from '../../../../core/services/rm-data.service';
import { VndShortPipe } from '../../../../shared/pipes/vnd.pipe';
import { RmChatComponent } from '../rm-chat/rm-chat.component';

@Component({
  selector: 'app-rm-widget',
  standalone: true,
  imports: [CommonModule, RouterLink, VndShortPipe, RmChatComponent],
  template: `
    <!-- Desktop persistent panel -->
    <aside class="hidden lg:flex lg:flex-col w-[320px] shrink-0 border-l border-ink-100 bg-white h-[calc(100vh-4rem)] sticky top-16">
      <ng-container *ngTemplateOutlet="panelContent"></ng-container>
    </aside>

    <!-- Mobile floating button -->
    <button
      *ngIf="!chatUi.mobileSheetOpen()"
      (click)="chatUi.openTeaser()"
      class="lg:hidden fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-brand-500 text-white shadow-pop flex items-center justify-center text-2xl"
      aria-label="Mở Virtual RM"
    >
      👩‍💼
    </button>

    <!-- Mobile bottom sheet -->
    <div *ngIf="chatUi.mobileSheetOpen()" class="lg:hidden fixed inset-0 z-40 bg-ink-900/40" (click)="chatUi.closeMobileSheet()"></div>
    <div
      class="lg:hidden fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-pop max-h-[85vh] flex flex-col transition-transform duration-200"
      [class.translate-y-full]="!chatUi.mobileSheetOpen()"
    >
      <div class="flex justify-center pt-2">
        <div class="w-10 h-1 rounded-full bg-ink-200"></div>
      </div>
      <div class="flex items-center justify-between px-4 pt-2">
        <span class="text-sm font-semibold text-ink-800">Virtual RM</span>
        <button class="text-ink-400 p-1" (click)="chatUi.closeMobileSheet()">✕</button>
      </div>
      <div class="flex-1 min-h-[50vh] overflow-hidden">
        <ng-container *ngTemplateOutlet="panelContent"></ng-container>
      </div>
    </div>

    <ng-template #panelContent>
      <div class="flex items-center gap-3 px-4 py-4 border-b border-ink-100">
        <div class="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-xl">👩‍💼</div>
        <div>
          <p class="text-sm font-semibold text-ink-800">Mai — Virtual RM</p>
          <p class="text-xs text-positive flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-positive inline-block"></span> Đang hoạt động
          </p>
        </div>
      </div>

      <ng-container *ngIf="!chatUi.chatMode(); else chatView">
        <div class="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <p class="text-sm text-ink-600 leading-relaxed">{{ rmData.briefing()?.greeting }}</p>

          <div class="grid grid-cols-3 gap-2">
            <div class="rounded-lg bg-ink-50 px-2 py-2.5 text-center">
              <p class="text-[10px] text-ink-400">Số dư</p>
              <p class="text-xs font-semibold text-ink-800">{{ rmData.briefing()?.balance | vndShort }}</p>
            </div>
            <div class="rounded-lg bg-ink-50 px-2 py-2.5 text-center">
              <p class="text-[10px] text-ink-400">Việc cần làm</p>
              <p class="text-xs font-semibold text-ink-800">{{ rmData.openTasks().length }}</p>
            </div>
            <div class="rounded-lg bg-ink-50 px-2 py-2.5 text-center">
              <p class="text-[10px] text-ink-400">Cảnh báo</p>
              <p class="text-xs font-semibold text-ink-800">{{ rmData.alerts().length }}</p>
            </div>
          </div>

          <div *ngIf="rmData.briefing()?.insight as insight" class="rounded-lg bg-brand-50 px-3 py-2.5">
            <p class="text-xs font-semibold text-brand-700 mb-0.5">💡 RM Insight</p>
            <p class="text-xs text-brand-700 leading-relaxed">{{ insight.message }}</p>
          </div>

          <a
            routerLink="/virtual-rm"
            (click)="chatUi.closeMobileSheet()"
            class="block text-center text-xs font-medium text-brand-600 hover:underline"
          >
            Xem toàn bộ Virtual RM Dashboard →
          </a>
        </div>

        <div class="p-4 border-t border-ink-100">
          <button class="btn-primary w-full" (click)="chatUi.chatMode.set(true)">💬 Hỏi Virtual RM</button>
        </div>
      </ng-container>

      <ng-template #chatView>
        <div class="px-4 py-2 border-b border-ink-100">
          <button class="text-xs text-ink-500 hover:text-ink-700" (click)="chatUi.showTeaser()">← Quay lại</button>
        </div>
        <div class="flex-1 min-h-0">
          <app-rm-chat class="h-full block" />
        </div>
      </ng-template>
    </ng-template>
  `,
})
export class RmWidgetComponent {
  readonly rmData = inject(RmDataService);
  readonly chatUi = inject(ChatUiService);
}
