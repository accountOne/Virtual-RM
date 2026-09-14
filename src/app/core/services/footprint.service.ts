import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Footprint, FootprintPeriod, FootprintScope } from '../models';

/** Phase 5.5 BRD alignment — "Dấu ấn cá nhân/doanh nghiệp" (Footprint). Each call is a fresh
 * fetch (no cached signal like RmDataService/TradeFinanceService) since scope/period change
 * per user interaction on the footprint page rather than loading once at app start. */
@Injectable({ providedIn: 'root' })
export class FootprintService {
  private readonly http = inject(HttpClient);

  async get(scope: FootprintScope, period: FootprintPeriod): Promise<Footprint> {
    return firstValueFrom(this.http.get<Footprint>('/api/virtual-rm/footprint', { params: { scope, period } }));
  }
}
