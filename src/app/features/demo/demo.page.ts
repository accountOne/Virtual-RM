import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { RmDataService } from '../../core/services/rm-data.service';

interface DemoStep {
  title: string;
  detail: string;
  action: { label: string; run: () => void };
}

@Component({
  selector: 'app-demo-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-3xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <div>
        <h1 class="text-xl font-semibold text-ink-800">🎬 Demo Mode</h1>
        <p class="text-sm text-ink-500 mt-1">
          Kịch bản demo: {{ rmData.customer()?.companyName }} — CFO trải nghiệm Virtual RM.
          Thực hiện lần lượt từng bước dưới đây để trình diễn đầy đủ hành trình khách hàng.
        </p>
      </div>

      <div class="space-y-2.5">
        <div
          *ngFor="let step of steps; let i = index"
          class="card p-4 flex items-start gap-3"
          [class.opacity-60]="visited().has(i)"
        >
          <div
            class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
            [class.bg-positive]="visited().has(i)"
            [class.text-white]="visited().has(i)"
            [class.bg-ink-100]="!visited().has(i)"
            [class.text-ink-600]="!visited().has(i)"
          >
            {{ visited().has(i) ? '✓' : i + 1 }}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-ink-800">{{ step.title }}</p>
            <p class="text-xs text-ink-500 mt-0.5">{{ step.detail }}</p>
          </div>
          <button class="btn-secondary shrink-0 !text-xs !py-1.5" (click)="run(i, step)">{{ step.action.label }}</button>
        </div>
      </div>

      <div class="flex justify-center">
        <button class="btn-ghost text-xs" (click)="resetProgress()">Đặt lại tiến trình demo</button>
      </div>
    </div>
  `,
})
export class DemoPageComponent {
  readonly rmData = inject(RmDataService);
  private readonly router = inject(Router);

  readonly visited = signal<Set<number>>(new Set());

  readonly steps: DemoStep[] = [
    {
      title: '1. Đăng nhập',
      detail: `Khách hàng ${this.rmData.customer()?.companyName ?? ''} đăng nhập Digital Business Banking (tài khoản Checker để có đủ quyền thao tác trong kịch bản này).`,
      action: { label: 'Vào Dashboard', run: () => this.router.navigateByUrl('/dashboard') },
    },
    {
      title: '2. Virtual RM chào khách hàng',
      detail: 'Virtual RM chào khách hàng và mở Business Briefing hôm nay.',
      action: { label: 'Mở Virtual RM', run: () => this.router.navigateByUrl('/virtual-rm') },
    },
    {
      title: '3. Xem Business Briefing',
      detail: 'RM tóm tắt số dư, dòng tiền vào/ra hôm qua, và RM Insight về chi phí tuần này.',
      action: { label: 'Xem Briefing', run: () => this.router.navigateByUrl('/virtual-rm') },
    },
    {
      title: '4. RM cảnh báo giao dịch chờ duyệt',
      detail: 'RM nhấn mạnh 3 giao dịch đang chờ phê duyệt, tổng giá trị 850 triệu VNĐ.',
      action: { label: 'Xem cảnh báo', run: () => this.router.navigateByUrl('/virtual-rm') },
    },
    {
      title: '5-6. Mở và phê duyệt giao dịch',
      detail: 'Khách hàng mở màn hình phê duyệt, chọn giao dịch và phê duyệt.',
      action: { label: 'Phê duyệt ngay', run: () => this.router.navigateByUrl('/payments/approval') },
    },
    {
      title: '7. RM gợi ý sản phẩm FX Business',
      detail: 'Sau khi xử lý xong, RM đề xuất giải pháp FX Business dựa trên hoạt động ngoại tệ gần đây.',
      action: { label: 'Xem gợi ý', run: () => this.router.navigateByUrl('/virtual-rm') },
    },
    {
      title: '8-9. Hỏi RM: "Hôm qua chi bao nhiêu?"',
      detail: 'Khách hàng mở chat và đặt câu hỏi, RM trả lời dựa trên dữ liệu giao dịch thực tế.',
      action: { label: 'Mở Chat RM', run: () => this.router.navigateByUrl('/virtual-rm/chat') },
    },
    {
      title: '10-11. Hỏi RM: "Tôi còn việc gì cần xử lý?"',
      detail: 'RM liệt kê các việc cần xử lý còn mở (duyệt giao dịch, bổ sung hồ sơ, ký hợp đồng...).',
      action: { label: 'Mở Chat RM', run: () => this.router.navigateByUrl('/virtual-rm/chat') },
    },
    {
      title: '12. Mở hồ sơ doanh nghiệp',
      detail: 'Khách hàng theo gợi ý của RM, mở màn hình hồ sơ doanh nghiệp để bổ sung giấy tờ.',
      action: { label: 'Mở hồ sơ', run: () => this.router.navigateByUrl('/company/profile') },
    },
  ];

  run(index: number, step: DemoStep): void {
    step.action.run();
    this.visited.update((set) => new Set(set).add(index));
  }

  resetProgress(): void {
    this.visited.set(new Set());
  }
}
