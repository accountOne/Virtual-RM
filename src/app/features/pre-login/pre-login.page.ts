import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Capability {
  icon: string;
  title: string;
  description: string;
}

const CAPABILITIES: Capability[] = [
  {
    icon: '📊',
    title: 'Daily Business Briefing',
    description: 'Tổng hợp số dư, dòng tiền vào/ra và việc cần xử lý mỗi sáng — không cần tự tổng hợp báo cáo.',
  },
  {
    icon: '⚠️',
    title: 'Smart Alert & Action',
    description: 'Cảnh báo chủ động khi có giao dịch chờ duyệt, khoản vay đến hạn, số dư thấp — kèm hành động ngay.',
  },
  {
    icon: '💬',
    title: 'Ask Your Bank',
    description: 'Hỏi đáp tức thì về số dư, giao dịch, việc cần làm — trả lời từ đúng dữ liệu doanh nghiệp của bạn.',
  },
  {
    icon: '✅',
    title: 'Business Task Assistant',
    description: 'Danh sách việc cần xử lý được ưu tiên, mỗi việc dẫn thẳng tới đúng nghiệp vụ ngân hàng.',
  },
  {
    icon: '💡',
    title: 'Product Recommendation',
    description: 'Gợi ý sản phẩm phù hợp — FX, tiền gửi, khoản vay, quản lý dòng tiền — dựa trên hoạt động thực tế.',
  },
];

@Component({
  selector: 'app-pre-login-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="min-h-screen bg-white text-ink-800">
      <!-- Top nav -->
      <header class="h-16 flex items-center justify-between px-4 sm:px-8 border-b border-ink-100 sticky top-0 bg-white/90 backdrop-blur z-20">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-brand-500 text-white flex items-center justify-center font-bold text-sm">M</div>
          <span class="font-semibold text-ink-800">MSB Business Banking</span>
        </div>
        <nav class="hidden sm:flex items-center gap-6 text-sm font-medium text-ink-500">
          <a href="#capabilities" class="hover:text-ink-800">Virtual RM</a>
          <a href="#journey" class="hover:text-ink-800">Trải nghiệm</a>
        </nav>
        <a routerLink="/login" class="btn-primary !py-1.5 !px-4 text-sm">Đăng nhập</a>
      </header>

      <!-- Hero -->
      <section class="relative overflow-hidden" [style.background]="heroBg">
        <div class="max-w-5xl mx-auto px-4 sm:px-8 py-16 sm:py-24 text-white">
          <p class="text-xs font-semibold uppercase tracking-wider text-white/70 mb-3">Digital Business Banking</p>
          <h1 class="text-3xl sm:text-4xl font-semibold leading-tight max-w-2xl">
            Ngân hàng doanh nghiệp, với một Trợ lý Quan hệ Khách hàng luôn túc trực.
          </h1>
          <p class="text-white/85 text-base mt-4 max-w-xl leading-relaxed">
            Virtual RM theo dõi dòng tiền, chủ động cảnh báo, trả lời câu hỏi và gợi ý sản phẩm — ngay trong ứng dụng
            ngân hàng doanh nghiệp bạn dùng mỗi ngày.
          </p>
          <div class="flex flex-wrap items-center gap-3 mt-8">
            <a routerLink="/login" class="btn-primary !bg-white !text-brand-600 hover:!bg-white/90 !px-6 !py-2.5">
              Đăng nhập ngay
            </a>
            <a href="#capabilities" class="btn-ghost !text-white hover:!bg-white/10 !px-6 !py-2.5">
              Khám phá Virtual RM ↓
            </a>
          </div>
        </div>
      </section>

      <!-- Capabilities -->
      <section id="capabilities" class="max-w-5xl mx-auto px-4 sm:px-8 py-14">
        <h2 class="text-xl font-semibold text-ink-800 text-center">5 năng lực của Virtual RM</h2>
        <p class="text-sm text-ink-500 text-center mt-2 max-w-lg mx-auto">
          Được tích hợp tự nhiên vào trải nghiệm ngân hàng doanh nghiệp — không phải một chatbot tách biệt.
        </p>
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
          <div *ngFor="let c of capabilities" class="card p-5">
            <div class="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-lg mb-3">{{ c.icon }}</div>
            <p class="text-sm font-semibold text-ink-800">{{ c.title }}</p>
            <p class="text-sm text-ink-500 mt-1.5 leading-relaxed">{{ c.description }}</p>
          </div>
        </div>
      </section>

      <!-- Journey -->
      <section id="journey" class="bg-ink-50 border-y border-ink-100">
        <div class="max-w-5xl mx-auto px-4 sm:px-8 py-14">
          <h2 class="text-xl font-semibold text-ink-800 text-center">Trải nghiệm liền mạch</h2>
          <div class="flex flex-wrap items-center justify-center gap-2 mt-8 text-sm font-medium text-ink-600">
            <span class="badge bg-white border border-ink-200">Đăng nhập</span>
            <span class="text-ink-300">→</span>
            <span class="badge bg-white border border-ink-200">Tổng quan doanh nghiệp</span>
            <span class="text-ink-300">→</span>
            <span class="badge bg-white border border-ink-200">Tài khoản &amp; Thanh toán</span>
            <span class="text-ink-300">→</span>
            <span class="badge bg-white border border-ink-200">Phê duyệt</span>
            <span class="text-ink-300">→</span>
            <span class="badge bg-brand-500 text-white">Virtual RM</span>
          </div>
        </div>
      </section>

      <footer class="max-w-5xl mx-auto px-4 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-ink-400">
        <p>© 2026 MSB Business Banking — Virtual RM Demo</p>
        <p>Môi trường demo — không sử dụng dữ liệu khách hàng thật, không kết nối hệ thống ngân hàng thật.</p>
      </footer>
    </div>
  `,
})
export class PreLoginPageComponent {
  readonly capabilities = CAPABILITIES;
  readonly heroBg = 'radial-gradient(120% 140% at 0% 0%, #ff9f6e 0%, #ef4b2a 45%, #8a1e17 100%)';
}
