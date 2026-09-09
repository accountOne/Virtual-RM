import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RmDataService } from '../../core/services/rm-data.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-company-profile-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-2xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <h1 class="text-xl font-semibold text-ink-800">Hồ sơ doanh nghiệp</h1>

      <div class="card p-5" *ngIf="rmData.customer() as c">
        <div class="grid sm:grid-cols-2 gap-4 text-sm">
          <div><p class="text-xs text-ink-400">Tên doanh nghiệp</p><p class="text-ink-800 font-medium mt-0.5">{{ c.companyName }}</p></div>
          <div><p class="text-xs text-ink-400">Mã khách hàng (CIF)</p><p class="text-ink-800 font-medium mt-0.5">{{ c.customerId }}</p></div>
          <div><p class="text-xs text-ink-400">Ngành nghề</p><p class="text-ink-800 font-medium mt-0.5">{{ c.industry }}</p></div>
          <div><p class="text-xs text-ink-400">Quy mô</p><p class="text-ink-800 font-medium mt-0.5">{{ c.companySize }}</p></div>
          <div><p class="text-xs text-ink-400">Phân khúc khách hàng</p><p class="text-ink-800 font-medium mt-0.5">{{ c.segment }}</p></div>
          <div><p class="text-xs text-ink-400">Chuyên viên quan hệ khách hàng</p><p class="text-ink-800 font-medium mt-0.5">{{ c.rmName }}</p></div>
        </div>
      </div>

      <div class="card p-5">
        <h2 class="text-sm font-semibold text-ink-800 mb-2">Bổ sung giấy tờ</h2>
        <p class="text-sm text-ink-500">Giấy chứng nhận đăng ký kinh doanh (bản mới nhất), giấy tờ người đại diện pháp luật.</p>
        <div class="border-2 border-dashed border-ink-200 rounded-xl p-6 text-center mt-3" *ngIf="!uploaded">
          <p class="text-2xl">📎</p>
          <button class="btn-primary mt-2" (click)="uploaded = true">Tải lên tài liệu mẫu</button>
        </div>
        <div *ngIf="uploaded" class="flex items-center gap-2 text-sm text-positive mt-3">
          <span>✓</span> Đã tải lên: GCN_DKKD_2026.pdf
        </div>

        <button class="btn-primary w-full mt-5" [disabled]="!uploaded" (click)="finish()">Xác nhận hoàn tất hồ sơ</button>
      </div>
    </div>
  `,
})
export class CompanyProfilePageComponent {
  readonly rmData = inject(RmDataService);
  private readonly toast = inject(ToastService);
  uploaded = false;

  async finish(): Promise<void> {
    const tasks = this.rmData.tasks().filter((t) => t.actionLink === '/company/profile' && t.status === 'OPEN');
    for (const t of tasks) {
      await this.rmData.completeTask(t.id);
    }
    this.toast.success('Đã cập nhật hồ sơ doanh nghiệp.');
  }
}
