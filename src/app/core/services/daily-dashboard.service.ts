import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DailyDashboard } from '../models';

/** Phase 5.5 BRD alignment — Daily Dashboard. Same signals-loaded-once pattern as
 * TradeFinanceService, reading from the new GET /api/virtual-rm/daily-dashboard endpoint
 * (server/src/services/daily-dashboard.service.ts) instead of the legacy /api/rm/briefing path
 * RmDataService still uses for the chat widget's small teaser card
 * (docs/phase-5.5-brd-gap-analysis.md §3.5/§3.6). */
@Injectable({ providedIn: 'root' })
export class DailyDashboardService {
  private readonly http = inject(HttpClient);

  readonly dashboard = signal<DailyDashboard | null>(null);
  readonly loaded = signal(false);
  readonly loading = signal(false);

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const dashboard = await firstValueFrom(this.http.get<DailyDashboard>('/api/virtual-rm/daily-dashboard'));
      this.dashboard.set(dashboard);
      this.loaded.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
