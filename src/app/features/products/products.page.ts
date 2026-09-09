import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { RmDataService } from '../../core/services/rm-data.service';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-products-page',
  standalone: true,
  imports: [CommonModule, LoadingSpinnerComponent],
  template: `
    <div class="max-w-5xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <app-loading-spinner *ngIf="rmData.loading() && !rmData.loaded()" />
      <ng-container *ngIf="rmData.loaded()">
        <div>
          <h1 class="text-xl font-semibold text-ink-800">Sản phẩm & Giải pháp doanh nghiệp</h1>
          <p class="text-sm text-ink-500 mt-1">Các giải pháp ngân hàng dành riêng cho doanh nghiệp của bạn.</p>
        </div>

        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div *ngFor="let p of rmData.products()" class="card p-5 flex flex-col">
            <span class="badge bg-brand-50 text-brand-600 self-start">{{ p.category }}</span>
            <p class="text-base font-semibold text-ink-800 mt-3">{{ p.name }}</p>
            <p class="text-sm text-ink-500 mt-1.5 leading-relaxed flex-1">{{ p.description }}</p>
            <p class="text-xs text-ink-400 mt-3">Đối tượng: {{ p.eligibility }}</p>
            <button class="btn-primary mt-3" (click)="router.navigateByUrl(p.ctaLink)">{{ p.cta }}</button>
          </div>
        </div>
      </ng-container>
    </div>
  `,
})
export class ProductsPageComponent {
  readonly rmData = inject(RmDataService);
  readonly router = inject(Router);
}
