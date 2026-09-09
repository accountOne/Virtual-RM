import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RmDataService } from '../../core/services/rm-data.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-fx-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-2xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <h1 class="text-xl font-semibold text-ink-800">FX Business</h1>
      <p class="text-sm text-ink-500">
        Giải pháp quản lý ngoại tệ toàn diện dành cho {{ rmData.customer()?.companyName }} — mua/bán kỳ hạn,
        phòng ngừa rủi ro tỷ giá cho hoạt động xuất nhập khẩu.
      </p>

      <div class="card p-5">
        <h2 class="text-sm font-semibold text-ink-800 mb-3">Tỷ giá tham khảo hôm nay</h2>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-ink-400 border-b border-ink-100">
              <th class="py-2 font-medium">Loại tiền</th>
              <th class="py-2 font-medium text-right">Mua vào</th>
              <th class="py-2 font-medium text-right">Bán ra</th>
            </tr>
          </thead>
          <tbody>
            <tr class="border-b border-ink-50">
              <td class="py-2 text-ink-700">USD</td>
              <td class="py-2 text-right text-ink-800">25.180</td>
              <td class="py-2 text-right text-ink-800">25.480</td>
            </tr>
            <tr class="border-b border-ink-50">
              <td class="py-2 text-ink-700">EUR</td>
              <td class="py-2 text-right text-ink-800">27.050</td>
              <td class="py-2 text-right text-ink-800">27.480</td>
            </tr>
            <tr>
              <td class="py-2 text-ink-700">JPY (100)</td>
              <td class="py-2 text-right text-ink-800">16.720</td>
              <td class="py-2 text-right text-ink-800">17.020</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card p-5">
        <h2 class="text-sm font-semibold text-ink-800 mb-2">Đăng ký tư vấn giải pháp FX Business</h2>
        <p class="text-sm text-ink-500 mb-3">Chuyên viên MSB sẽ liên hệ trong 24h làm việc.</p>
        <button class="btn-primary" (click)="register()" [disabled]="registered">
          {{ registered ? '✓ Đã gửi yêu cầu' : 'Đăng ký ngay' }}
        </button>
      </div>
    </div>
  `,
})
export class FxPageComponent {
  readonly rmData = inject(RmDataService);
  private readonly toast = inject(ToastService);
  registered = false;

  register(): void {
    this.registered = true;
    this.toast.success('Đã gửi yêu cầu tư vấn FX Business tới RM của bạn.');
  }
}
