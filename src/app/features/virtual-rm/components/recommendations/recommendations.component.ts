import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { Router } from '@angular/router';
import { Recommendation } from '../../../../core/models';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-recommendations-list',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent],
  template: `
    <div class="card p-5">
      <h3 class="text-sm font-semibold text-ink-800 mb-3">💡 Gợi ý dành riêng cho doanh nghiệp</h3>
      <app-empty-state
        *ngIf="recommendations.length === 0"
        icon="🔍"
        title="Chưa có gợi ý phù hợp"
        subtitle="Tôi sẽ cập nhật khi có sản phẩm phù hợp với hoạt động của doanh nghiệp."
      />
      <div class="grid sm:grid-cols-2 gap-3">
        <div
          *ngFor="let rec of recommendations"
          class="rounded-xl border border-ink-100 p-4 hover:border-brand-200 transition-colors"
        >
          <p class="text-sm font-semibold text-brand-700">{{ rec.title }}</p>
          <p class="text-xs text-ink-500 mt-1.5 leading-relaxed">{{ rec.reason }}</p>
          <button
            (click)="router.navigateByUrl(rec.ctaLink)"
            class="text-xs font-semibold text-brand-600 mt-2.5 hover:underline"
          >
            {{ rec.cta }} →
          </button>
        </div>
      </div>
    </div>
  `,
})
export class RecommendationsListComponent {
  @Input() recommendations: Recommendation[] = [];

  constructor(readonly router: Router) {}
}
