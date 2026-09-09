import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

interface DemoAccount {
  role: string;
  username: string;
  password: string;
}

// Admin (msb_ad) is intentionally not advertised here — it still works if typed
// manually, it's just not surfaced as a one-tap option on the login screen.
const DEMO_ACCOUNTS: DemoAccount[] = [
  { role: 'Maker', username: 'msb_mk', password: 'msb_mk@2026' },
  { role: 'Checker', username: 'msb_ck', password: 'msb_ck@2026' },
];

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-ink-50 p-4">
      <div class="w-full max-w-4xl grid md:grid-cols-2 rounded-2xl overflow-hidden shadow-pop bg-white">
        <!-- Brand hero -->
        <div class="relative hidden md:flex flex-col justify-between p-8 text-white overflow-hidden" [style.background]="heroBg">
          <div class="absolute -top-16 -left-16 w-64 h-64 rounded-full bg-white/10 blur-2xl"></div>
          <div class="absolute -bottom-24 -right-10 w-72 h-72 rounded-full bg-white/10 blur-2xl"></div>
          <div class="relative flex items-center gap-2">
            <div class="w-9 h-9 rounded-lg bg-white/20 backdrop-blur flex items-center justify-center font-bold">M</div>
            <span class="font-semibold text-lg">MSB Business Banking</span>
          </div>
          <div class="relative">
            <p class="text-2xl font-semibold leading-snug">
              Trải nghiệm Virtual RM<br />ngay trong ứng dụng ngân hàng doanh nghiệp.
            </p>
            <p class="text-sm text-white/80 mt-3 max-w-xs">
              Trợ lý quan hệ khách hàng ảo giúp anh/chị theo dõi dòng tiền, xử lý phê duyệt và nhận gợi ý sản phẩm
              theo thời gian thực.
            </p>
          </div>
          <p class="relative text-xs text-white/60">Demo environment — không sử dụng dữ liệu khách hàng thật.</p>
        </div>

        <!-- Login form -->
        <div class="p-8 flex flex-col justify-center">
          <div class="md:hidden flex items-center gap-2 mb-6">
            <div class="w-9 h-9 rounded-lg bg-brand-500 text-white flex items-center justify-center font-bold">M</div>
            <span class="font-semibold text-ink-800 text-lg">MSB Business Banking</span>
          </div>

          <h1 class="text-xl font-semibold text-ink-800">Đăng nhập</h1>
          <p class="text-sm text-ink-500 mt-1 mb-6">Đăng nhập để bắt đầu trải nghiệm Virtual RM.</p>

          <form (ngSubmit)="submit()" class="space-y-4">
            <div>
              <label class="text-xs font-medium text-ink-600 mb-1 block">Tên đăng nhập</label>
              <input
                [(ngModel)]="username"
                name="username"
                type="text"
                autocomplete="username"
                class="input"
                placeholder="msb_mk"
              />
            </div>
            <div>
              <label class="text-xs font-medium text-ink-600 mb-1 block">Mật khẩu</label>
              <div class="relative">
                <input
                  [(ngModel)]="password"
                  name="password"
                  [type]="passwordVisible() ? 'text' : 'password'"
                  autocomplete="current-password"
                  class="input pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  (click)="passwordVisible.set(!passwordVisible())"
                  class="absolute inset-y-0 right-0 px-3 flex items-center text-ink-400 hover:text-ink-600"
                  [attr.aria-label]="passwordVisible() ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'"
                >
                  <svg *ngIf="!passwordVisible()" width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/>
                  </svg>
                  <svg *ngIf="passwordVisible()" width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M9.9 5.1A11.6 11.6 0 0 1 12 5c7 0 11 7 11 7a13.4 13.4 0 0 1-3.2 3.9M6.6 6.6C3.5 8.6 1 12 1 12s4 7 11 7a10.6 10.6 0 0 0 4.2-.86" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>

            <p *ngIf="error()" class="text-sm text-negative">{{ error() }}</p>

            <button type="submit" class="btn-primary w-full" [disabled]="!username.trim() || !password">Đăng nhập</button>
          </form>

          <div class="mt-6 rounded-lg bg-ink-50 border border-ink-100 p-3.5">
            <p class="text-xs font-semibold text-ink-600 mb-2">Tài khoản demo</p>
            <div class="space-y-1.5">
              <button
                *ngFor="let acc of demoAccounts"
                type="button"
                (click)="fill(acc)"
                class="flex w-full items-center justify-between text-xs text-ink-500 hover:text-brand-600 hover:bg-white rounded px-2 py-1.5 transition-colors"
              >
                <span class="font-medium">{{ acc.role }}</span>
                <span class="font-mono">{{ acc.username }} / {{ acc.password }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .input {
        /* text-base (16px), not text-sm — under 16px, iOS Safari auto-zooms the page on focus */
        @apply w-full rounded-lg border border-ink-200 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400;
      }
    `,
  ],
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly demoAccounts = DEMO_ACCOUNTS;
  readonly error = signal('');
  readonly passwordVisible = signal(false);
  readonly heroBg = 'radial-gradient(120% 140% at 0% 0%, #ff9f6e 0%, #ef4b2a 45%, #8a1e17 100%)';

  username = '';
  password = '';

  fill(acc: DemoAccount): void {
    this.username = acc.username;
    this.password = acc.password;
    this.error.set('');
  }

  submit(): void {
    const ok = this.auth.login(this.username, this.password);
    if (!ok) {
      this.error.set('Tên đăng nhập hoặc mật khẩu không đúng.');
      return;
    }
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    this.router.navigateByUrl(returnUrl || '/dashboard');
  }
}
