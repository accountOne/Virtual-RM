import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  BankGuarantee,
  Collection,
  CreateCollectionRequest,
  CreateGuaranteeRequest,
  CreateLcRequest,
  LetterOfCredit,
  TradeFinanceSummary,
} from '../models';

/** Phase 7 — dedicated Trade Finance Business Banking screens read from these real REST
 * endpoints (server/src/controllers/trade-finance.controller.ts), separate from the Virtual
 * RM chat query API. Same pattern as RmDataService: signals loaded once, refreshed after a
 * mutating action (here, submitting a create-request form). */
@Injectable({ providedIn: 'root' })
export class TradeFinanceService {
  private readonly http = inject(HttpClient);

  readonly lcs = signal<LetterOfCredit[]>([]);
  readonly guarantees = signal<BankGuarantee[]>([]);
  readonly collections = signal<Collection[]>([]);
  readonly summary = signal<TradeFinanceSummary | null>(null);
  readonly loaded = signal(false);
  readonly loading = signal(false);

  async loadAll(): Promise<void> {
    this.loading.set(true);
    try {
      const [lcs, guarantees, collections, summary] = await Promise.all([
        firstValueFrom(this.http.get<LetterOfCredit[]>('/api/trade-finance/lc')),
        firstValueFrom(this.http.get<BankGuarantee[]>('/api/trade-finance/guarantees')),
        firstValueFrom(this.http.get<Collection[]>('/api/trade-finance/collections')),
        firstValueFrom(this.http.get<TradeFinanceSummary>('/api/trade-finance/summary')),
      ]);
      this.lcs.set(lcs);
      this.guarantees.set(guarantees);
      this.collections.set(collections);
      this.summary.set(summary);
      this.loaded.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded() && !this.loading()) await this.loadAll();
  }

  async lcById(id: string): Promise<LetterOfCredit | undefined> {
    await this.ensureLoaded();
    const cached = this.lcs().find((l) => l.lcNumber === id);
    if (cached) return cached;
    try {
      return await firstValueFrom(this.http.get<LetterOfCredit>(`/api/trade-finance/lc/${id}`));
    } catch {
      return undefined;
    }
  }

  async guaranteeById(id: string): Promise<BankGuarantee | undefined> {
    await this.ensureLoaded();
    const cached = this.guarantees().find((g) => g.bgNumber === id);
    if (cached) return cached;
    try {
      return await firstValueFrom(this.http.get<BankGuarantee>(`/api/trade-finance/guarantees/${id}`));
    } catch {
      return undefined;
    }
  }

  async collectionById(id: string): Promise<Collection | undefined> {
    await this.ensureLoaded();
    const cached = this.collections().find((c) => c.collectionNumber === id);
    if (cached) return cached;
    try {
      return await firstValueFrom(this.http.get<Collection>(`/api/trade-finance/collections/${id}`));
    } catch {
      return undefined;
    }
  }

  /** BRD §26: LC issuance is Maker-initiated — the server rejects a Checker's request with a
   * 403, checking the role on the caller's authenticated session (see
   * server/src/controllers/trade-finance.controller.ts::createLc), never a value the client
   * sends — Login & Session Security upgrade removed the `role` field this request used to
   * carry in its body precisely because a client-supplied role can't be trusted for that check. */
  async createLc(payload: CreateLcRequest): Promise<LetterOfCredit> {
    const created = await firstValueFrom(this.http.post<LetterOfCredit>('/api/trade-finance/lc', payload));
    await this.loadAll();
    return created;
  }

  async createGuarantee(payload: CreateGuaranteeRequest): Promise<BankGuarantee> {
    const created = await firstValueFrom(this.http.post<BankGuarantee>('/api/trade-finance/guarantees', payload));
    await this.loadAll();
    return created;
  }

  async createCollection(payload: CreateCollectionRequest): Promise<Collection> {
    const created = await firstValueFrom(this.http.post<Collection>('/api/trade-finance/collections', payload));
    await this.loadAll();
    return created;
  }
}
