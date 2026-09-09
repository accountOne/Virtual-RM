import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-payments-home-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="max-w-3xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <h1 class="text-xl font-semibold text-ink-800">Thanh toán</h1>
      <div class="grid sm:grid-cols-3 gap-4">
        <a routerLink="/payments/single-transfer" class="card p-5 hover:shadow-pop transition-shadow">
          <span class="text-2xl">💸</span>
          <p class="text-sm font-semibold text-ink-800 mt-2">Chuyển tiền</p>
          <p class="text-xs text-ink-500 mt-1">Chuyển khoản đơn lẻ trong và ngoài hệ thống</p>
        </a>
        <a routerLink="/payments/batch-transfer" class="card p-5 hover:shadow-pop transition-shadow">
          <span class="text-2xl">📦</span>
          <p class="text-sm font-semibold text-ink-800 mt-2">Chuyển tiền hàng loạt</p>
          <p class="text-xs text-ink-500 mt-1">Tải file hoặc nhập danh sách chi lương, thanh toán NCC</p>
        </a>
        <a routerLink="/payments/approval" class="card p-5 hover:shadow-pop transition-shadow">
          <span class="text-2xl">✅</span>
          <p class="text-sm font-semibold text-ink-800 mt-2">Phê duyệt giao dịch</p>
          <p class="text-xs text-ink-500 mt-1">Xem và xử lý các giao dịch đang chờ phê duyệt</p>
        </a>
      </div>
    </div>
  `,
})
export class PaymentsHomePageComponent {}
