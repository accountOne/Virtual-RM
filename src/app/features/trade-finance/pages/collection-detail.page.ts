import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Collection } from '../../../core/models';
import { TradeFinanceService } from '../../../core/services/trade-finance.service';
import { BadgeComponent } from '../../../shared/components/badge/badge.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { VndPipe } from '../../../shared/pipes/vnd.pipe';
import { DOCUMENT_STATUS_LABEL, statusLabel, statusTone } from '../trade-finance-ui.util';

@Component({
  selector: 'app-collection-detail-page',
  standalone: true,
  imports: [CommonModule, RouterLink, BadgeComponent, LoadingSpinnerComponent, VndPipe],
  template: `
    <div class="max-w-4xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <a routerLink="/trade-finance/collections" class="text-xs text-ink-400 hover:text-ink-600">← Danh sách nhờ thu</a>

      <app-loading-spinner *ngIf="loading()" />

      <ng-container *ngIf="!loading() && collection() as c">
        <div class="card p-5 sm:p-6">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="flex items-center gap-2">
                <h1 class="text-xl font-semibold text-ink-800">{{ c.collectionNumber }}</h1>
                <app-badge [tone]="statusTone(c.status)" [label]="statusLabel(c.status)" />
              </div>
              <p class="text-sm text-ink-500 mt-1">{{ c.direction === 'INWARD' ? 'Inward' : 'Outward' }} Collection · {{ c.subType === 'DP' ? 'Documents against Payment' : 'Documents against Acceptance' }}</p>
              <p class="text-2xl font-semibold text-ink-800 mt-2">{{ c.amount | vnd: c.currency }}</p>
            </div>
            <a routerLink="/virtual-rm" class="btn-secondary text-xs">Liên hệ RM</a>
          </div>
        </div>

        <div class="card p-5 sm:p-6">
          <p class="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-3">Các bên liên quan</p>
          <dl class="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div><dt class="text-ink-400">Drawer (bên ký phát)</dt><dd class="text-ink-800 font-medium">{{ c.drawer }}</dd></div>
            <div><dt class="text-ink-400">Drawee (bên trả tiền)</dt><dd class="text-ink-800 font-medium">{{ c.drawee }}</dd></div>
            <div><dt class="text-ink-400">Remitting Bank</dt><dd class="text-ink-800 font-medium">MSB</dd></div>
            <div><dt class="text-ink-400">Collecting Bank</dt><dd class="text-ink-800 font-medium">{{ c.direction === 'INWARD' ? 'MSB' : 'Ngân hàng đối tác' }}</dd></div>
            <div><dt class="text-ink-400">Due Date</dt><dd class="text-ink-800 font-medium">{{ c.dueDate }}</dd></div>
            <div><dt class="text-ink-400">Loại</dt><dd class="text-ink-800 font-medium">{{ c.type === 'IMPORT' ? 'Nhập khẩu' : 'Xuất khẩu' }}</dd></div>
          </dl>
        </div>

        <div class="card p-5 sm:p-6" *ngIf="c.documents.length > 0">
          <p class="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-3">Chứng từ</p>
          <ul class="space-y-2">
            <li *ngFor="let d of c.documents" class="flex items-center justify-between text-sm py-1.5 border-b border-ink-50 last:border-0">
              <span class="text-ink-700">{{ d.documentType }}</span>
              <app-badge [tone]="docTone(d.status)" [label]="docIcon(d.status) + ' ' + docLabel(d.status)" [dot]="false" />
            </li>
          </ul>
        </div>

        <div class="card p-5 sm:p-6">
          <p class="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-2">Thanh toán / Chấp nhận / Settlement</p>
          <p class="text-sm text-ink-600">
            Trạng thái hiện tại: <span class="font-medium text-ink-800">{{ statusLabel(c.status) }}</span>.
            {{ c.status === 'OVERDUE' ? 'Bộ chứng từ đã quá hạn xử lý — vui lòng liên hệ RM.' : '' }}
          </p>
        </div>
      </ng-container>

      <div *ngIf="!loading() && !collection()" class="card p-8 text-center text-sm text-ink-500">Không tìm thấy bộ nhờ thu này.</div>
    </div>
  `,
})
export class CollectionDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly tf = inject(TradeFinanceService);
  private readonly destroyRef = inject(DestroyRef);

  readonly collection = signal<Collection | undefined>(undefined);
  readonly loading = signal(true);

  readonly statusLabel = statusLabel;
  readonly statusTone = statusTone;

  ngOnInit(): void {
    // See lc-detail.page.ts's identical fix: Angular reuses this component across
    // param-only navigations, so a one-time `route.snapshot` read would leave the page stuck
    // on the first collection loaded.
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((pm) => {
      void this.loadCollection(pm.get('id'));
    });
  }

  private async loadCollection(id: string | null): Promise<void> {
    this.loading.set(true);
    this.collection.set(id ? await this.tf.collectionById(id) : undefined);
    this.loading.set(false);
  }

  docTone(status: string) {
    return DOCUMENT_STATUS_LABEL[status]?.tone ?? 'neutral';
  }
  docIcon(status: string): string {
    return DOCUMENT_STATUS_LABEL[status]?.icon ?? '·';
  }
  docLabel(status: string): string {
    return DOCUMENT_STATUS_LABEL[status]?.label ?? status;
  }
}
