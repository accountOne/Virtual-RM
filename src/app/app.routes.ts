import { Routes } from '@angular/router';
import { authGuard, guestOnlyGuard, roleGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/pre-login/pre-login.page').then((m) => m.PreLoginPageComponent),
    canActivate: [guestOnlyGuard],
    pathMatch: 'full',
    title: 'MSB Business Banking — Virtual RM',
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPageComponent),
    canActivate: [guestOnlyGuard],
    title: 'Đăng nhập — MSB Business Banking',
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPageComponent),
    canActivate: [authGuard],
    title: 'Dashboard — MSB Business Banking',
  },
  {
    path: 'virtual-rm',
    loadComponent: () =>
      import('./features/virtual-rm/pages/virtual-rm-dashboard/virtual-rm-dashboard.page').then(
        (m) => m.VirtualRmDashboardPageComponent,
      ),
    canActivate: [authGuard],
    title: 'Virtual RM — MSB Business Banking',
  },
  {
    // Full-screen chat (UI redesign) — replaces the old popup/bottom-sheet widget entirely,
    // see rm-chat-session.service.ts and virtual-rm-chat.page.ts's doc comments.
    path: 'virtual-rm/chat',
    loadComponent: () =>
      import('./features/virtual-rm/pages/virtual-rm-chat/virtual-rm-chat.page').then((m) => m.VirtualRmChatPageComponent),
    canActivate: [authGuard],
    title: 'Virtual RM — MSB Business Banking',
  },
  {
    path: 'accounts',
    loadComponent: () => import('./features/accounts/accounts.page').then((m) => m.AccountsPageComponent),
    canActivate: [authGuard],
    title: 'Tài khoản — MSB Business Banking',
  },
  {
    path: 'payments',
    loadComponent: () =>
      import('./features/payments/pages/payments-home/payments-home.page').then((m) => m.PaymentsHomePageComponent),
    canActivate: [authGuard],
    title: 'Thanh toán — MSB Business Banking',
  },
  {
    path: 'payments/approval',
    loadComponent: () => import('./features/payments/pages/approval/approval.page').then((m) => m.ApprovalPageComponent),
    canActivate: [authGuard, roleGuard('CHECKER', 'ADMIN')],
    title: 'Phê duyệt giao dịch — MSB Business Banking',
  },
  {
    path: 'payments/single-transfer',
    loadComponent: () =>
      import('./features/payments/pages/single-transfer/single-transfer.page').then((m) => m.SingleTransferPageComponent),
    canActivate: [authGuard],
    title: 'Chuyển tiền — MSB Business Banking',
  },
  {
    path: 'payments/batch-transfer',
    loadComponent: () =>
      import('./features/payments/pages/batch-transfer/batch-transfer.page').then((m) => m.BatchTransferPageComponent),
    canActivate: [authGuard],
    title: 'Chuyển tiền hàng loạt — MSB Business Banking',
  },
  {
    path: 'company/profile',
    loadComponent: () => import('./features/company/company-profile.page').then((m) => m.CompanyProfilePageComponent),
    canActivate: [authGuard],
    title: 'Hồ sơ doanh nghiệp — MSB Business Banking',
  },
  {
    path: 'contracts/sign',
    loadComponent: () => import('./features/contracts/contract-sign.page').then((m) => m.ContractSignPageComponent),
    canActivate: [authGuard],
    title: 'Ký hợp đồng — MSB Business Banking',
  },
  {
    path: 'loans',
    loadComponent: () => import('./features/loans/loans.page').then((m) => m.LoansPageComponent),
    canActivate: [authGuard],
    title: 'Khoản vay — MSB Business Banking',
  },
  {
    path: 'fx',
    loadComponent: () => import('./features/fx/fx.page').then((m) => m.FxPageComponent),
    canActivate: [authGuard],
    title: 'FX Business — MSB Business Banking',
  },
  {
    path: 'products',
    loadComponent: () => import('./features/products/products.page').then((m) => m.ProductsPageComponent),
    canActivate: [authGuard],
    title: 'Sản phẩm — MSB Business Banking',
  },
  {
    path: 'trade-finance',
    loadComponent: () =>
      import('./features/trade-finance/pages/trade-finance-dashboard.page').then((m) => m.TradeFinanceDashboardPageComponent),
    canActivate: [authGuard],
    title: 'Trade Finance — MSB Business Banking',
  },
  {
    path: 'trade-finance/lc/create',
    loadComponent: () => import('./features/trade-finance/pages/lc-create.page').then((m) => m.LcCreatePageComponent),
    canActivate: [authGuard],
    title: 'Yêu cầu mở LC — MSB Business Banking',
  },
  {
    path: 'trade-finance/lc/:id',
    loadComponent: () => import('./features/trade-finance/pages/lc-detail.page').then((m) => m.LcDetailPageComponent),
    canActivate: [authGuard],
    title: 'Chi tiết LC — MSB Business Banking',
  },
  {
    path: 'trade-finance/lc',
    loadComponent: () => import('./features/trade-finance/pages/lc-list.page').then((m) => m.LcListPageComponent),
    canActivate: [authGuard],
    title: 'Thư tín dụng — MSB Business Banking',
  },
  {
    path: 'trade-finance/guarantees/create',
    loadComponent: () =>
      import('./features/trade-finance/pages/guarantee-create.page').then((m) => m.GuaranteeCreatePageComponent),
    canActivate: [authGuard],
    title: 'Yêu cầu phát hành bảo lãnh — MSB Business Banking',
  },
  {
    path: 'trade-finance/guarantees/:id',
    loadComponent: () =>
      import('./features/trade-finance/pages/guarantee-detail.page').then((m) => m.GuaranteeDetailPageComponent),
    canActivate: [authGuard],
    title: 'Chi tiết bảo lãnh — MSB Business Banking',
  },
  {
    path: 'trade-finance/guarantees',
    loadComponent: () =>
      import('./features/trade-finance/pages/guarantee-list.page').then((m) => m.GuaranteeListPageComponent),
    canActivate: [authGuard],
    title: 'Bảo lãnh ngân hàng — MSB Business Banking',
  },
  {
    path: 'trade-finance/collections/create',
    loadComponent: () =>
      import('./features/trade-finance/pages/collection-create.page').then((m) => m.CollectionCreatePageComponent),
    canActivate: [authGuard],
    title: 'Yêu cầu nhờ thu — MSB Business Banking',
  },
  {
    path: 'trade-finance/collections/:id',
    loadComponent: () =>
      import('./features/trade-finance/pages/collection-detail.page').then((m) => m.CollectionDetailPageComponent),
    canActivate: [authGuard],
    title: 'Chi tiết nhờ thu — MSB Business Banking',
  },
  {
    path: 'trade-finance/collections',
    loadComponent: () =>
      import('./features/trade-finance/pages/collection-list.page').then((m) => m.CollectionListPageComponent),
    canActivate: [authGuard],
    title: 'Nhờ thu — MSB Business Banking',
  },
  {
    path: 'reports',
    loadComponent: () => import('./features/reports/reports.page').then((m) => m.ReportsPageComponent),
    canActivate: [authGuard],
    title: 'Báo cáo — MSB Business Banking',
  },
  {
    path: 'admin/demo-data',
    loadComponent: () =>
      import('./features/admin/demo-data/admin-demo-data.page').then((m) => m.AdminDemoDataPageComponent),
    canActivate: [authGuard, roleGuard('ADMIN')],
    title: 'Quản lý dữ liệu demo — MSB Business Banking',
  },
  {
    path: 'demo',
    loadComponent: () => import('./features/demo/demo.page').then((m) => m.DemoPageComponent),
    canActivate: [authGuard],
    title: 'Demo Mode — MSB Business Banking',
  },
  { path: '**', redirectTo: 'dashboard' },
];
