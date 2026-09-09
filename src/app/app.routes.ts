import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPageComponent),
    title: 'Dashboard — MSB Business Banking',
  },
  {
    path: 'virtual-rm',
    loadComponent: () =>
      import('./features/virtual-rm/pages/virtual-rm-dashboard/virtual-rm-dashboard.page').then(
        (m) => m.VirtualRmDashboardPageComponent,
      ),
    title: 'Virtual RM — MSB Business Banking',
  },
  {
    path: 'accounts',
    loadComponent: () => import('./features/accounts/accounts.page').then((m) => m.AccountsPageComponent),
    title: 'Tài khoản — MSB Business Banking',
  },
  {
    path: 'payments',
    loadComponent: () =>
      import('./features/payments/pages/payments-home/payments-home.page').then((m) => m.PaymentsHomePageComponent),
    title: 'Thanh toán — MSB Business Banking',
  },
  {
    path: 'payments/approval',
    loadComponent: () => import('./features/payments/pages/approval/approval.page').then((m) => m.ApprovalPageComponent),
    title: 'Phê duyệt giao dịch — MSB Business Banking',
  },
  {
    path: 'payments/single-transfer',
    loadComponent: () =>
      import('./features/payments/pages/single-transfer/single-transfer.page').then((m) => m.SingleTransferPageComponent),
    title: 'Chuyển tiền — MSB Business Banking',
  },
  {
    path: 'payments/batch-transfer',
    loadComponent: () =>
      import('./features/payments/pages/batch-transfer/batch-transfer.page').then((m) => m.BatchTransferPageComponent),
    title: 'Chuyển tiền hàng loạt — MSB Business Banking',
  },
  {
    path: 'company/profile',
    loadComponent: () => import('./features/company/company-profile.page').then((m) => m.CompanyProfilePageComponent),
    title: 'Hồ sơ doanh nghiệp — MSB Business Banking',
  },
  {
    path: 'contracts/sign',
    loadComponent: () => import('./features/contracts/contract-sign.page').then((m) => m.ContractSignPageComponent),
    title: 'Ký hợp đồng — MSB Business Banking',
  },
  {
    path: 'loans',
    loadComponent: () => import('./features/loans/loans.page').then((m) => m.LoansPageComponent),
    title: 'Khoản vay — MSB Business Banking',
  },
  {
    path: 'fx',
    loadComponent: () => import('./features/fx/fx.page').then((m) => m.FxPageComponent),
    title: 'FX Business — MSB Business Banking',
  },
  {
    path: 'products',
    loadComponent: () => import('./features/products/products.page').then((m) => m.ProductsPageComponent),
    title: 'Sản phẩm — MSB Business Banking',
  },
  {
    path: 'reports',
    loadComponent: () => import('./features/reports/reports.page').then((m) => m.ReportsPageComponent),
    title: 'Báo cáo — MSB Business Banking',
  },
  {
    path: 'admin/demo-data',
    loadComponent: () =>
      import('./features/admin/demo-data/admin-demo-data.page').then((m) => m.AdminDemoDataPageComponent),
    title: 'Quản lý dữ liệu demo — MSB Business Banking',
  },
  {
    path: 'demo',
    loadComponent: () => import('./features/demo/demo.page').then((m) => m.DemoPageComponent),
    title: 'Demo Mode — MSB Business Banking',
  },
  { path: '**', redirectTo: 'dashboard' },
];
