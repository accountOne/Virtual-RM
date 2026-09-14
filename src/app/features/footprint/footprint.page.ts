import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Footprint, FootprintPeriod, FootprintScope } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { FootprintService } from '../../core/services/footprint.service';
import { ToastService } from '../../core/services/toast.service';

const CANVAS_WIDTH = 720;
const CANVAS_HEIGHT = 1000;
const BRAND_700 = '#b02417';
const BRAND_900 = '#5c1512';

/**
 * Phase 5.5 BRD alignment — "Dấu ấn cá nhân/doanh nghiệp" (Personal/Business Footprint), spec
 * §B.2's Option 4.3: "Hệ thống tự động khởi tạo (generate) ảnh dấu ấn → Khách hàng xem trực tiếp
 * và chọn Download". The infographic is drawn with the HTML5 Canvas 2D API directly from the
 * real numbers `FootprintService` returns — no AI image-generation call, since a generative
 * image model can't reliably render exact figures/company names (see decision recorded in this
 * phase's plan). `canvas.toDataURL()` is what makes the "Download" button work.
 */
@Component({
  selector: 'app-footprint-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-xl mx-auto p-4 sm:p-6 space-y-4 pb-24">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold text-ink-800">🎖️ Dấu ấn</h1>
        <button class="text-sm text-ink-400 hover:text-ink-600" (click)="router.navigateByUrl('/virtual-rm')">← Về Virtual RM</button>
      </div>

      <div class="flex gap-2">
        <button
          *ngFor="let s of scopes"
          class="flex-1 text-sm py-2 rounded-lg border transition-colors"
          [class.bg-brand-500]="scope() === s.value"
          [class.text-white]="scope() === s.value"
          [class.border-brand-500]="scope() === s.value"
          [class.border-ink-200]="scope() !== s.value"
          [class.text-ink-600]="scope() !== s.value"
          (click)="setScope(s.value)"
        >
          {{ s.label }}
        </button>
      </div>

      <div class="flex gap-2">
        <button
          *ngFor="let p of periods"
          class="flex-1 text-xs py-1.5 rounded-full border transition-colors"
          [class.bg-ink-800]="period() === p.value"
          [class.text-white]="period() === p.value"
          [class.border-ink-800]="period() === p.value"
          [class.border-ink-200]="period() !== p.value"
          [class.text-ink-500]="period() !== p.value"
          (click)="setPeriod(p.value)"
        >
          {{ p.label }}
        </button>
      </div>

      <!-- Canvas always stays mounted (never behind *ngIf) — @ViewChild only resolves once the
           element has actually rendered, and gating it behind the loading signal raced draw()
           against Angular re-inserting the element, leaving a blank canvas on first load
           (confirmed live: getImageData came back fully transparent). A loading overlay sits on
           top instead, so the element itself is always there for draw() to paint into. -->
      <div class="card p-3 overflow-x-auto relative">
        <div *ngIf="loading()" class="absolute inset-0 flex items-center justify-center bg-white/80 z-10 rounded-lg">
          <p class="text-sm text-ink-400">Đang tạo ảnh dấu ấn...</p>
        </div>
        <canvas #canvas [width]="canvasWidth" [height]="canvasHeight" class="w-full h-auto rounded-lg"></canvas>
      </div>

      <div class="flex gap-2" *ngIf="!loading()">
        <button class="btn-primary flex-1" (click)="download()">⬇️ Tải ảnh về</button>
        <button class="btn-secondary flex-1" *ngIf="canShare" (click)="share()">📤 Chia sẻ</button>
      </div>
    </div>
  `,
})
export class FootprintPageComponent {
  readonly router = inject(Router);
  private readonly footprintService = inject(FootprintService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  @ViewChild('canvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  readonly canvasWidth = CANVAS_WIDTH;
  readonly canvasHeight = CANVAS_HEIGHT;
  readonly canShare = typeof navigator !== 'undefined' && !!navigator.share;

  readonly scopes: { value: FootprintScope; label: string }[] = [
    { value: 'personal', label: '👤 Cá nhân' },
    { value: 'business', label: '🏢 Doanh nghiệp' },
  ];
  readonly periods: { value: FootprintPeriod; label: string }[] = [
    { value: 'month', label: '1 tháng qua' },
    { value: 'quarter', label: '1 quý qua' },
    { value: 'year', label: '1 năm qua' },
  ];

  readonly scope = signal<FootprintScope>('personal');
  readonly period = signal<FootprintPeriod>('year');
  readonly loading = signal(true);
  private data: Footprint | null = null;

  constructor() {
    effect(() => {
      // Re-runs whenever scope()/period() changes; reads them here so the effect tracks them.
      const scope = this.scope();
      const period = this.period();
      void this.loadAndDraw(scope, period);
    });
  }

  setScope(scope: FootprintScope): void {
    this.scope.set(scope);
  }

  setPeriod(period: FootprintPeriod): void {
    this.period.set(period);
  }

  private async loadAndDraw(scope: FootprintScope, period: FootprintPeriod): Promise<void> {
    this.loading.set(true);
    try {
      this.data = await this.footprintService.get(scope, period);
      this.draw();
    } catch {
      this.toast.error('Không thể tạo dấu ấn lúc này. Vui lòng thử lại sau.');
    } finally {
      this.loading.set(false);
    }
  }

  download(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `dau-an-${this.scope()}-${this.period()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  async share(): Promise<void> {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !navigator.share) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], 'dau-an.png', { type: 'image/png' });
      try {
        await navigator.share({ files: [file], title: 'Dấu ấn MSB Business' });
      } catch {
        // user cancelled the native share sheet — nothing to do
      }
    }, 'image/png');
  }

  private draw(): void {
    const canvas = this.canvasRef?.nativeElement;
    const data = this.data;
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, BRAND_700);
    gradient.addColorStop(1, BRAND_900);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    let y = 70;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 22px "Be Vietnam Pro", sans-serif';
    ctx.fillText('MSB BUSINESS BANKING', CANVAS_WIDTH / 2, y);

    y += 60;
    ctx.font = '700 40px "Be Vietnam Pro", sans-serif';
    const displayName = data.scope === 'personal' ? this.auth.currentUser()?.displayName ?? data.name : data.name;
    this.wrapText(ctx, displayName, CANVAS_WIDTH / 2, y, CANVAS_WIDTH - 80, 46);
    y += displayName.length > 24 ? 100 : 55;

    y += 20;
    ctx.font = '700 32px "Be Vietnam Pro", sans-serif';
    ctx.fillText(data.rankLabel, CANVAS_WIDTH / 2, y);

    y += 45;
    ctx.font = '400 16px "Be Vietnam Pro", sans-serif';
    ctx.globalAlpha = 0.9;
    this.wrapText(ctx, data.rankMessage, CANVAS_WIDTH / 2, y, CANVAS_WIDTH - 120, 24);
    ctx.globalAlpha = 1;
    y += 80;

    ctx.font = '400 14px "Be Vietnam Pro", sans-serif';
    ctx.globalAlpha = 0.8;
    ctx.fillText(data.sinceLabel, CANVAS_WIDTH / 2, y);
    ctx.globalAlpha = 1;

    // Stats card — white rounded rectangle with a 2-column grid of label/value rows.
    y += 40;
    const cardX = 40;
    const cardWidth = CANVAS_WIDTH - 80;
    const rowHeight = 56;
    const cardHeight = Math.ceil(data.stats.length / 2) * rowHeight + 40;
    this.roundedRect(ctx, cardX, y, cardWidth, cardHeight, 16);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.textAlign = 'left';
    const colWidth = cardWidth / 2;
    data.stats.forEach((stat, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const sx = cardX + 28 + col * colWidth;
      const sy = y + 34 + row * rowHeight;
      ctx.fillStyle = '#64748b';
      ctx.font = '400 12px "Be Vietnam Pro", sans-serif';
      ctx.fillText(stat.label, sx, sy);
      ctx.fillStyle = '#1e293b';
      ctx.font = '700 20px "Be Vietnam Pro", sans-serif';
      ctx.fillText(stat.value, sx, sy + 24);
    });
    y += cardHeight + 30;

    const peopleList = data.topPeople ?? data.topPartners?.received;
    if (peopleList && peopleList.length > 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 16px "Be Vietnam Pro", sans-serif';
      ctx.fillText(data.scope === 'business' ? '🤝 Đối tác nổi bật' : '🤝 Tương tác nổi bật', CANVAS_WIDTH / 2, y);
      y += 30;
      ctx.font = '400 14px "Be Vietnam Pro", sans-serif';
      for (const person of peopleList.slice(0, 3)) {
        ctx.fillText(`${person.name} — ${person.detail}`, CANVAS_WIDTH / 2, y);
        y += 24;
      }
    }

    ctx.textAlign = 'center';
    ctx.font = 'italic 400 13px "Be Vietnam Pro", sans-serif';
    ctx.globalAlpha = 0.85;
    this.wrapText(ctx, data.wishMessage, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 40, CANVAS_WIDTH - 100, 20);
    ctx.globalAlpha = 1;
  }

  private roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): void {
    const words = text.split(' ');
    let line = '';
    let lineY = y;
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && line) {
        ctx.fillText(line, x, lineY);
        line = word;
        lineY += lineHeight;
      } else {
        line = testLine;
      }
    }
    if (line) ctx.fillText(line, x, lineY);
  }
}
