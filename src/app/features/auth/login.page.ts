import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { Fido2Service } from '../../core/services/fido2.service';
import { HERO_DARK_BG } from '../../shared/ui-tokens';

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

/** 'welcome' is the new dark full-bleed hero entry screen (mobile mockup screen 1 — previously
 * this hero was `hidden` below the `md:` breakpoint, so a phone saw nothing but a bare white
 * form; that's fixed here by giving mobile its own dedicated hero screen instead of hiding it).
 * 'credentials' is the existing username/password form + demo-account quick-fill, unchanged in
 * substance. The "Demo FIDO2" step (mockup screen 2) isn't a third local phase — it's the shared
 * `Fido2ModalComponent`, already mounted at the app shell, opened after a successful password
 * check (see submit()). */
type LoginPhase = 'welcome' | 'credentials';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen flex flex-col text-white" [style.background]="heroBg">
      <div class="absolute -top-16 -left-16 w-64 h-64 rounded-full bg-white/10 blur-2xl pointer-events-none"></div>
      <div class="absolute -bottom-24 -right-10 w-72 h-72 rounded-full bg-white/10 blur-2xl pointer-events-none"></div>

      <!-- Brand lockup — present on every phase/breakpoint. -->
      <div class="relative flex items-center gap-2 px-6 pt-8 sm:px-10">
        <div class="w-9 h-9 rounded-lg bg-white/20 backdrop-blur flex items-center justify-center font-bold">M</div>
        <span class="font-semibold text-lg">MSB Business Banking</span>
      </div>

      <!-- Phase 1: welcome hero (mockup "Xin chào!") -->
      <div *ngIf="phase() === 'welcome'" class="relative flex-1 flex flex-col justify-between px-6 py-10 sm:px-10 lg:items-center">
        <div></div>
        <div class="lg:text-center lg:max-w-md">
          <h1 class="text-4xl font-semibold leading-tight">Xin chào!</h1>
          <p class="text-white/80 mt-2">Đăng nhập để tiếp tục</p>
        </div>
        <div class="space-y-3 lg:max-w-md lg:w-full">
          <button type="button" class="btn-primary w-full !py-3 !text-base" (click)="phase.set('credentials')">Đăng nhập</button>
          <button
            type="button"
            class="w-full !py-3 !text-base rounded-lg font-medium border border-white/30 text-white hover:bg-white/10 transition-colors"
            (click)="phase.set('credentials')"
          >
            Tài khoản demo
          </button>
          <p class="text-xs text-white/60 text-center pt-2">Demo environment — không sử dụng dữ liệu khách hàng thật · Phiên bản 1.0.0</p>
        </div>
      </div>

      <!-- Phase 2: credentials form -->
      <div *ngIf="phase() === 'credentials'" class="relative flex-1 flex flex-col lg:flex-row lg:items-center">
        <!-- Hero copy — visible on every breakpoint now (previously hidden below the md
             breakpoint, invisible on mobile entirely, the single biggest gap the redesign audit
             found). Compact on mobile, full column on lg. -->
        <div class="px-6 pt-4 pb-8 sm:px-10 lg:flex-1 lg:py-8 lg:pr-4">
          <p class="text-2xl lg:text-3xl font-semibold leading-snug max-w-sm">
            Trải nghiệm Virtual RM<br />ngay trong ứng dụng ngân hàng doanh nghiệp.
          </p>
          <p class="text-sm text-white/80 mt-3 max-w-xs hidden lg:block">
            Trợ lý quan hệ khách hàng ảo giúp anh/chị theo dõi dòng tiền, xử lý phê duyệt và nhận gợi ý sản phẩm theo
            thời gian thực.
          </p>
        </div>

        <!-- Form card — always a light card, on every breakpoint, so field contrast/readability
             never depends on viewport width. -->
        <div class="bg-white text-ink-800 rounded-t-2xl lg:rounded-2xl lg:flex-1 lg:max-w-md lg:my-8 lg:mr-8 p-6 sm:p-8 shadow-pop">
          <button type="button" class="text-xs text-ink-400 hover:text-ink-600 mb-4 flex items-center gap-1" (click)="phase.set('welcome')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Quay lại
          </button>

          <h2 class="text-xl font-semibold text-ink-800">Đăng nhập</h2>
          <p class="text-sm text-ink-500 mt-1 mb-6">Đăng nhập để bắt đầu trải nghiệm Virtual RM.</p>

          <form (ngSubmit)="submit()" class="space-y-4">
            <div>
              <label class="text-xs font-medium text-ink-600 mb-1 block">Tên đăng nhập</label>
              <input [(ngModel)]="username" name="username" type="text" autocomplete="username" class="input" placeholder="msb_mk" />
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

            <button type="submit" class="btn-primary w-full" [disabled]="!username.trim() || !password || submitting()">
              {{ submitting() ? 'Đang đăng nhập...' : 'Đăng nhập' }}
            </button>
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
      :host {
        display: block;
        position: relative;
      }
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
  private readonly fido2 = inject(Fido2Service);

  readonly demoAccounts = DEMO_ACCOUNTS;
  readonly error = signal('');
  readonly passwordVisible = signal(false);
  readonly submitting = signal(false);
  readonly phase = signal<LoginPhase>('welcome');
  // Premium dark hero (mockup screens 1/2) — dark navy/near-black base with a warm orange glow as
  // an ACCENT, not the dominant fill. The earlier version used the site's bright orange-to-red
  // brand gradient full-bleed, which read as a vivid orange screen — visibly off from the
  // reference mockup's much darker, moodier tone. Shared with Fido2ModalComponent so the login →
  // FIDO2 transition reads as one continuous screen, not a jump between two different palettes.
  readonly heroBg = HERO_DARK_BG;

  username = '';
  password = '';

  fill(acc: DemoAccount): void {
    this.username = acc.username;
    this.password = acc.password;
    this.error.set('');
  }

  async submit(): Promise<void> {
    if (this.submitting()) return;
    this.error.set('');
    this.submitting.set(true);
    try {
      const result = await this.auth.login(this.username, this.password);
      if (!result.ok) {
        this.error.set(result.message);
        return;
      }
      // Demo FIDO2 step-up (docs/fido2-demo-design.md) — the real session already exists at this
      // point (auth.login() succeeded); this is a step-up confirmation, not the thing granting
      // access, so a cancelled FIDO2 attempt just leaves the customer on this page rather than
      // undoing a real login.
      const fido2Result = await this.fido2.authenticate('login');
      if (!fido2Result.ok) return;
      // Voice UX upgrade (spec §9) — login lands the customer straight on the full-screen
      // Virtual RM chat (which speaks the daily briefing once it's there, see
      // rm-chat-session.service.ts) instead of Dashboard, UNLESS they were sent to /login by a
      // guard while trying to reach a specific page (`returnUrl`, e.g. a deep link) — that intent
      // still wins.
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      this.router.navigateByUrl(returnUrl || '/virtual-rm/chat');
    } finally {
      this.submitting.set(false);
    }
  }
}
