import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../core/services/admin.service';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';
import { RmDataService } from '../../../core/services/rm-data.service';
import { ToastService } from '../../../core/services/toast.service';
import { Account, Alert, Customer, Product, Recommendation, Task, Transaction } from '../../../core/models';
import { FieldComponent } from '../../../shared/components/field/field.component';

type Tab = 'customer' | 'accounts' | 'transactions' | 'tasks' | 'alerts' | 'products' | 'recommendations';

const TABS: { id: Tab; label: string }[] = [
  { id: 'customer', label: 'Khách hàng' },
  { id: 'accounts', label: 'Tài khoản' },
  { id: 'transactions', label: 'Giao dịch' },
  { id: 'tasks', label: 'Việc cần làm' },
  { id: 'alerts', label: 'Cảnh báo' },
  { id: 'products', label: 'Sản phẩm' },
  { id: 'recommendations', label: 'Gợi ý' },
];

@Component({
  selector: 'app-admin-demo-data-page',
  standalone: true,
  imports: [CommonModule, FormsModule, FieldComponent],
  template: `
    <div class="max-w-6xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <div class="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
        <span class="text-lg">⚠️</span>
        <p class="text-sm text-amber-800">
          <strong>Demo environment</strong> — data is stored in local JSON files and must not be used with production
          customer data. Đây là môi trường demo, mọi thay đổi chỉ ảnh hưởng tới dữ liệu mô phỏng cục bộ.
        </p>
      </div>

      <div class="flex items-center justify-between flex-wrap gap-3">
        <h1 class="text-xl font-semibold text-ink-800">Quản lý dữ liệu demo</h1>
        <button class="btn-danger" (click)="resetAll()">↺ Reset Demo Data</button>
      </div>

      <div class="flex gap-1.5 overflow-x-auto pb-1">
        <button
          *ngFor="let tab of tabs"
          (click)="activeTab.set(tab.id)"
          class="px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors"
          [class.bg-brand-500]="activeTab() === tab.id"
          [class.text-white]="activeTab() === tab.id"
          [class.bg-white]="activeTab() !== tab.id"
          [class.text-ink-600]="activeTab() !== tab.id"
          [class.border]="activeTab() !== tab.id"
          [class.border-ink-200]="activeTab() !== tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- CUSTOMER -->
      <div class="card p-5 space-y-3" *ngIf="activeTab() === 'customer' && customerDraft">
        <div class="grid sm:grid-cols-2 gap-3">
          <app-field label="Tên doanh nghiệp"><input class="input" [(ngModel)]="customerDraft.companyName" /></app-field>
          <app-field label="Mã khách hàng (CIF)"><input class="input" [(ngModel)]="customerDraft.customerId" /></app-field>
          <app-field label="Ngành nghề"><input class="input" [(ngModel)]="customerDraft.industry" /></app-field>
          <app-field label="Quy mô"><input class="input" [(ngModel)]="customerDraft.companySize" /></app-field>
          <app-field label="Tên RM"><input class="input" [(ngModel)]="customerDraft.rmName" /></app-field>
          <app-field label="Liên hệ RM"><input class="input" [(ngModel)]="customerDraft.rmContact" /></app-field>
          <app-field label="Phân khúc khách hàng"><input class="input" [(ngModel)]="customerDraft.segment" /></app-field>
        </div>
        <button class="btn-primary" (click)="saveCustomer()">Lưu thay đổi</button>
      </div>

      <!-- ACCOUNTS -->
      <div class="space-y-3" *ngIf="activeTab() === 'accounts'">
        <div class="card p-5 space-y-3" *ngFor="let acc of accountDrafts">
          <p class="text-xs font-semibold text-ink-400">{{ acc.accountName }}</p>
          <div class="grid sm:grid-cols-4 gap-3">
            <app-field label="Số tài khoản"><input class="input" [(ngModel)]="acc.accountNumber" /></app-field>
            <app-field label="Loại tiền"><input class="input" [(ngModel)]="acc.currency" /></app-field>
            <app-field label="Số dư"><input class="input" type="number" [(ngModel)]="acc.balance" /></app-field>
            <app-field label="Số dư khả dụng"><input class="input" type="number" [(ngModel)]="acc.availableBalance" /></app-field>
          </div>
          <button class="btn-secondary" (click)="saveAccount(acc)">Lưu</button>
        </div>
      </div>

      <!-- TRANSACTIONS -->
      <div class="card p-4 overflow-x-auto" *ngIf="activeTab() === 'transactions'">
        <table class="w-full text-xs min-w-[900px]">
          <thead>
            <tr class="text-left text-ink-400 border-b border-ink-100">
              <th class="py-2 pr-2 font-medium">Ngày</th>
              <th class="py-2 pr-2 font-medium">Loại</th>
              <th class="py-2 pr-2 font-medium">Số tiền</th>
              <th class="py-2 pr-2 font-medium">Đối tác</th>
              <th class="py-2 pr-2 font-medium">Mô tả</th>
              <th class="py-2 pr-2 font-medium">Trạng thái</th>
              <th class="py-2 pr-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let t of transactionDrafts" class="border-b border-ink-50">
              <td class="py-1.5 pr-2"><input class="input !py-1" [(ngModel)]="t.date" /></td>
              <td class="py-1.5 pr-2">
                <select class="input !py-1" [(ngModel)]="t.type">
                  <option value="CREDIT">CREDIT</option>
                  <option value="DEBIT">DEBIT</option>
                </select>
              </td>
              <td class="py-1.5 pr-2"><input class="input !py-1 w-28" type="number" [(ngModel)]="t.amount" /></td>
              <td class="py-1.5 pr-2"><input class="input !py-1" [(ngModel)]="t.counterparty" /></td>
              <td class="py-1.5 pr-2"><input class="input !py-1 min-w-[200px]" [(ngModel)]="t.description" /></td>
              <td class="py-1.5 pr-2">
                <select class="input !py-1" [(ngModel)]="t.status">
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="PENDING_APPROVAL">PENDING_APPROVAL</option>
                  <option value="REJECTED">REJECTED</option>
                </select>
              </td>
              <td class="py-1.5"><button class="btn-secondary !px-2 !py-1 !text-xs" (click)="saveTransaction(t)">Lưu</button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- TASKS -->
      <div class="space-y-3" *ngIf="activeTab() === 'tasks'">
        <div class="card p-5 space-y-3" *ngFor="let t of taskDrafts">
          <div class="grid sm:grid-cols-2 gap-3">
            <app-field label="Tiêu đề"><input class="input" [(ngModel)]="t.title" /></app-field>
            <app-field label="Ưu tiên">
              <select class="input" [(ngModel)]="t.priority">
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
            </app-field>
            <app-field label="Hạn xử lý"><input class="input" [(ngModel)]="t.dueDate" /></app-field>
            <app-field label="Trạng thái">
              <select class="input" [(ngModel)]="t.status">
                <option value="OPEN">OPEN</option>
                <option value="COMPLETED">COMPLETED</option>
              </select>
            </app-field>
            <app-field label="Deep link"><input class="input" [(ngModel)]="t.actionLink" /></app-field>
            <app-field label="Mô tả"><input class="input" [(ngModel)]="t.description" /></app-field>
          </div>
          <button class="btn-secondary" (click)="saveTask(t)">Lưu</button>
        </div>
      </div>

      <!-- ALERTS -->
      <div class="space-y-3" *ngIf="activeTab() === 'alerts'">
        <div class="card p-5 space-y-3" *ngFor="let a of alertDrafts">
          <div class="grid sm:grid-cols-2 gap-3">
            <app-field label="Tiêu đề"><input class="input" [(ngModel)]="a.title" /></app-field>
            <app-field label="Mức độ">
              <select class="input" [(ngModel)]="a.severity">
                <option value="CRITICAL">CRITICAL</option>
                <option value="WARNING">WARNING</option>
                <option value="INFO">INFO</option>
              </select>
            </app-field>
            <app-field label="Ngày"><input class="input" [(ngModel)]="a.date" /></app-field>
            <app-field label="Deep link (Action)"><input class="input" [(ngModel)]="a.actionLink" /></app-field>
            <app-field class="sm:col-span-2" label="Mô tả"><input class="input" [(ngModel)]="a.description" /></app-field>
          </div>
          <button class="btn-secondary" (click)="saveAlert(a)">Lưu</button>
        </div>
      </div>

      <!-- PRODUCTS -->
      <div class="space-y-3" *ngIf="activeTab() === 'products'">
        <div class="card p-5 space-y-3" *ngFor="let p of productDrafts">
          <div class="grid sm:grid-cols-2 gap-3">
            <app-field label="Tên sản phẩm"><input class="input" [(ngModel)]="p.name" /></app-field>
            <app-field label="Danh mục"><input class="input" [(ngModel)]="p.category" /></app-field>
            <app-field label="CTA"><input class="input" [(ngModel)]="p.cta" /></app-field>
            <app-field label="Đối tượng phù hợp"><input class="input" [(ngModel)]="p.eligibility" /></app-field>
            <app-field class="sm:col-span-2" label="Mô tả"><input class="input" [(ngModel)]="p.description" /></app-field>
          </div>
          <button class="btn-secondary" (click)="saveProduct(p)">Lưu</button>
        </div>
      </div>

      <!-- RECOMMENDATIONS -->
      <div class="space-y-3" *ngIf="activeTab() === 'recommendations'">
        <div class="card p-5 space-y-3" *ngFor="let r of recommendationDrafts">
          <p class="text-[11px] text-ink-400">Rule: {{ r.ruleKey }} (không thể chỉnh sửa)</p>
          <div class="grid sm:grid-cols-2 gap-3">
            <app-field label="Tiêu đề"><input class="input" [(ngModel)]="r.title" /></app-field>
            <app-field label="Ưu tiên">
              <select class="input" [(ngModel)]="r.priority">
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
            </app-field>
            <app-field label="CTA"><input class="input" [(ngModel)]="r.cta" /></app-field>
            <app-field label="Sản phẩm liên kết (productId)"><input class="input" [(ngModel)]="r.productId" /></app-field>
            <app-field class="sm:col-span-2" label="Lý do gợi ý"><input class="input" [(ngModel)]="r.reason" /></app-field>
          </div>
          <button class="btn-secondary" (click)="saveRecommendation(r)">Lưu</button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .input {
        @apply w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400;
      }
    `,
  ],
})
export class AdminDemoDataPageComponent {
  readonly rmData = inject(RmDataService);
  private readonly admin = inject(AdminService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);

  readonly tabs = TABS;
  readonly activeTab = signal<Tab>('customer');

  customerDraft: Customer | null = structuredClone(this.rmData.customer());
  accountDrafts: Account[] = structuredClone(this.rmData.accounts());
  transactionDrafts: Transaction[] = structuredClone(this.rmData.transactions());
  taskDrafts: Task[] = structuredClone(this.rmData.tasks());
  alertDrafts: Alert[] = structuredClone(this.rmData.alerts());
  productDrafts: Product[] = structuredClone(this.rmData.products());
  recommendationDrafts: Recommendation[] = structuredClone(this.rmData.recommendations());

  async saveCustomer(): Promise<void> {
    if (!this.customerDraft) return;
    await this.admin.updateCustomer(this.customerDraft);
    await this.rmData.loadAll();
    this.toast.success('Đã lưu thông tin khách hàng.');
  }

  async saveAccount(acc: Account): Promise<void> {
    await this.admin.updateAccount(acc.id, acc);
    await this.rmData.loadAll();
    this.toast.success('Đã lưu tài khoản.');
  }

  async saveTransaction(t: Transaction): Promise<void> {
    await this.admin.updateTransaction(t.id, t);
    await this.rmData.loadAll();
    this.toast.success('Đã lưu giao dịch.');
  }

  async saveTask(t: Task): Promise<void> {
    await this.admin.updateTask(t.id, t);
    await this.rmData.loadAll();
    this.toast.success('Đã lưu việc cần làm.');
  }

  async saveAlert(a: Alert): Promise<void> {
    await this.admin.updateAlert(a.id, a);
    await this.rmData.loadAll();
    this.toast.success('Đã lưu cảnh báo.');
  }

  async saveProduct(p: Product): Promise<void> {
    await this.admin.updateProduct(p.id, p);
    await this.rmData.loadAll();
    this.toast.success('Đã lưu sản phẩm.');
  }

  async saveRecommendation(r: Recommendation): Promise<void> {
    await this.admin.updateRecommendation(r.id, r);
    await this.rmData.loadAll();
    this.toast.success('Đã lưu gợi ý.');
  }

  async resetAll(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Reset Demo Data',
      message: 'This will restore the original demo scenario. Toàn bộ dữ liệu sẽ được khôi phục về trạng thái demo gốc.',
      confirmLabel: 'Reset',
      danger: true,
    });
    if (!ok) return;
    await this.admin.reset();
    await this.rmData.loadAll();
    this.reloadDrafts();
    this.toast.success('Đã khôi phục dữ liệu demo gốc.');
  }

  private reloadDrafts(): void {
    this.customerDraft = structuredClone(this.rmData.customer());
    this.accountDrafts = structuredClone(this.rmData.accounts());
    this.transactionDrafts = structuredClone(this.rmData.transactions());
    this.taskDrafts = structuredClone(this.rmData.tasks());
    this.alertDrafts = structuredClone(this.rmData.alerts());
    this.productDrafts = structuredClone(this.rmData.products());
    this.recommendationDrafts = structuredClone(this.rmData.recommendations());
  }
}
