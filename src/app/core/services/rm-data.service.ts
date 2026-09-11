import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  Account,
  Alert,
  Briefing,
  Customer,
  Product,
  Recommendation,
  RmAnswer,
  Task,
  Transaction,
} from '../models';

/** Mirrors business-semantics/navigation-actions.json's route field — the semantic engine
 * returns a navigation action id (e.g. "OPEN_APPROVAL"), the frontend owns turning that into
 * an actual Angular route, per the Business Banking Semantic Pack spec. */
const NAV_ACTION_ROUTES: Record<string, string> = {
  OPEN_DASHBOARD: '/dashboard',
  OPEN_ACCOUNT: '/accounts',
  OPEN_TRANSACTION: '/accounts',
  OPEN_PAYMENT: '/payments',
  OPEN_SINGLE_TRANSFER: '/payments/single-transfer',
  OPEN_BATCH_TRANSFER: '/payments/batch-transfer',
  OPEN_APPROVAL: '/payments/approval',
  OPEN_PAYROLL: '/payments',
  OPEN_FX: '/fx',
  OPEN_LC: '/trade-finance/lc',
  OPEN_LC_DETAIL: '/trade-finance/lc',
  OPEN_LC_DOCUMENTS: '/trade-finance/lc',
  OPEN_LC_DISCREPANCY: '/trade-finance/lc',
  OPEN_LC_AMENDMENT: '/trade-finance/lc',
  OPEN_LC_CREATE: '/trade-finance/lc/create',
  OPEN_GUARANTEE: '/trade-finance/guarantees',
  OPEN_GUARANTEE_DETAIL: '/trade-finance/guarantees',
  OPEN_GUARANTEE_CLAIM: '/trade-finance/guarantees',
  OPEN_GUARANTEE_CREATE: '/trade-finance/guarantees/create',
  OPEN_COLLECTION: '/trade-finance/collections',
  OPEN_COLLECTION_DETAIL: '/trade-finance/collections',
  OPEN_TRADE_FINANCE: '/trade-finance',
  OPEN_LOAN: '/loans',
  OPEN_PRODUCT: '/products',
  OPEN_TASK: '/virtual-rm',
  OPEN_ALERT: '/virtual-rm',
};

/** Phase 7 — a query-string-anchor suffix so OPEN_LC_DOCUMENTS/_DISCREPANCY/_AMENDMENT and
 * OPEN_GUARANTEE_CLAIM land directly on the right section of the (single) LC/Guarantee
 * detail page instead of just its top. */
const TARGET_ANCHOR: Record<string, string> = {
  OPEN_LC_DOCUMENTS: '#documents',
  OPEN_LC_DISCREPANCY: '#discrepancy',
  OPEN_LC_AMENDMENT: '#amendment',
  OPEN_GUARANTEE_CLAIM: '#claims',
};

/** Exported for `rm-message-builder.ts` (Phase 5.6) so a navigation `RMAction`'s `route` is built
 * from the exact same table the flattened `RmAnswer` CTAs already use — one source of truth for
 * "semantic nav target -> Angular route", not a second copy. */
export function buildLink(target: string, entityId?: string): string {
  const base = NAV_ACTION_ROUTES[target] ?? '/dashboard';
  if (!entityId) return base;
  return `${base}/${entityId}${TARGET_ANCHOR[target] ?? ''}`;
}

export interface SemanticMetric {
  label: string;
  value: string;
}

export interface SemanticAnswerAction {
  label: string;
  type: 'NAVIGATE';
  target: string;
  entityId?: string;
}

export interface SemanticAnswer {
  title: string;
  summary: string;
  metrics: SemanticMetric[];
  records: unknown[];
  action?: SemanticAnswerAction;
  /** Phase 7 — an answer about several records (e.g. "2 LC sắp hết hạn") carries one CTA per
   * highlighted record plus a "view all"; falls back to `action` alone when absent. */
  actions?: SemanticAnswerAction[];
  suggestedQuestions?: string[];
  /** Phase 5 (AI Reasoning) — populated only when the Reasoning Engine produced this
   * answer (see server/src/ai/reasoning-engine.ts). */
  insights?: string[];
  recommendation?: { title: string; description: string };
}

export interface SemanticQueryApiResult {
  success: true;
  semantic: { intent: string; confidence: number; reasoningRequired?: boolean };
  answer: SemanticAnswer;
}

/**
 * Single shared data hub for everything the Virtual RM experience needs.
 * Loaded once at app start, refreshed after any mutating action, so every
 * widget/page reading these signals always reflects the latest mock state.
 */
@Injectable({ providedIn: 'root' })
export class RmDataService {
  private readonly http = inject(HttpClient);

  readonly customer = signal<Customer | null>(null);
  readonly accounts = signal<Account[]>([]);
  readonly transactions = signal<Transaction[]>([]);
  readonly tasks = signal<Task[]>([]);
  readonly alerts = signal<Alert[]>([]);
  readonly products = signal<Product[]>([]);
  readonly recommendations = signal<Recommendation[]>([]);
  readonly briefing = signal<Briefing | null>(null);
  readonly loading = signal<boolean>(false);
  readonly loaded = signal<boolean>(false);

  readonly openTasks = computed(() => this.tasks().filter((t) => t.status === 'OPEN'));
  readonly pendingTransactions = computed(() => this.transactions().filter((t) => t.status === 'PENDING_APPROVAL'));

  async loadAll(): Promise<void> {
    this.loading.set(true);
    try {
      const [customer, accounts, transactions, tasks, alerts, products, recommendations, briefing] = await Promise.all([
        firstValueFrom(this.http.get<Customer>('/api/customer')),
        firstValueFrom(this.http.get<Account[]>('/api/accounts')),
        firstValueFrom(this.http.get<Transaction[]>('/api/transactions')),
        firstValueFrom(this.http.get<Task[]>('/api/tasks')),
        firstValueFrom(this.http.get<Alert[]>('/api/alerts')),
        firstValueFrom(this.http.get<Product[]>('/api/products')),
        firstValueFrom(this.http.get<Recommendation[]>('/api/recommendations')),
        firstValueFrom(this.http.get<Briefing>('/api/rm/briefing')),
      ]);
      this.customer.set(customer);
      this.accounts.set(accounts);
      this.transactions.set(transactions);
      this.tasks.set(tasks);
      this.alerts.set(alerts);
      this.products.set(products);
      this.recommendations.set(recommendations);
      this.briefing.set(briefing);
      this.loaded.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** Re-pulls the data most likely to change after a mutating action (approve/reject/complete):
   * approving/rejecting a transaction moves money (accounts), changes the pending queue
   * (transactions), and can clear the seeded approval task/alert (tasks, alerts, briefing). */
  async refreshDynamic(): Promise<void> {
    const [accounts, transactions, tasks, alerts, briefing, recommendations] = await Promise.all([
      firstValueFrom(this.http.get<Account[]>('/api/accounts')),
      firstValueFrom(this.http.get<Transaction[]>('/api/transactions')),
      firstValueFrom(this.http.get<Task[]>('/api/tasks')),
      firstValueFrom(this.http.get<Alert[]>('/api/alerts')),
      firstValueFrom(this.http.get<Briefing>('/api/rm/briefing')),
      firstValueFrom(this.http.get<Recommendation[]>('/api/recommendations')),
    ]);
    this.accounts.set(accounts);
    this.transactions.set(transactions);
    this.tasks.set(tasks);
    this.alerts.set(alerts);
    this.briefing.set(briefing);
    this.recommendations.set(recommendations);
  }

  async approveTransaction(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`/api/transactions/${id}/approve`, {}));
    await this.refreshDynamic();
  }

  async rejectTransaction(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`/api/transactions/${id}/reject`, {}));
    await this.refreshDynamic();
  }

  async completeTask(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`/api/tasks/${id}/complete`, {}));
    await this.refreshDynamic();
  }

  /** Routes "Ask Your Bank" through the Business Banking Semantic Pack (deterministic,
   * local — see /business-semantics and docs/semantic-engine.md), not an LLM. The richer
   * {title, summary, metrics, records, action} answer is flattened into the chat's plain
   * {message, cta} shape so rm-chat.component.ts doesn't need to change, while still
   * surfacing real numbers (RM style: short, numeric, action — not chatbot prose). */
  async askRm(question: string): Promise<RmAnswer> {
    return this.toRmAnswer(await this.query(question));
  }

  /** Phase 5.6 — same call as `askRm()`, but returns the full structured
   * {semantic, answer} shape instead of the flattened {message, ctas} one, so the RM
   * Interaction Engine's message builder can render metrics/insights/recommendation/actions
   * as distinct rich message bubbles instead of one joined string. */
  async askRmRaw(question: string): Promise<SemanticQueryApiResult> {
    return this.query(question);
  }

  /** Login & Session Security upgrade: `userId`/`role` used to be sent here from the client —
   * removed, since Virtual RM must run inside the caller's authenticated session, never an
   * identity the frontend asserts (server/src/controllers/semantic.controller.ts::query now
   * reads `req.session!.userId`/`req.session!.role`; `stripIdentityOverrides` would delete
   * these fields anyway if a client still sent them). */
  private async query(question: string): Promise<SemanticQueryApiResult> {
    return firstValueFrom(
      this.http.post<SemanticQueryApiResult>('/api/virtual-rm/query', {
        message: question,
      }),
    );
  }

  private toRmAnswer(res: SemanticQueryApiResult): RmAnswer {
    const { intent } = res.semantic;
    const { answer } = res;

    const lines = [answer.summary];
    for (const metric of answer.metrics.slice(0, 5)) {
      lines.push(`${metric.label}: ${metric.value}`);
    }
    // Phase 5 (AI Reasoning): Insight/Recommendation sections (spec §20's RMResponse shape),
    // rendered as extra lines in the same plain chat bubble — the spec explicitly says not to
    // redesign the UI into card-based sections, so this stays a text flow like everything else.
    for (const insight of answer.insights ?? []) {
      lines.push(insight);
    }
    if (answer.recommendation) {
      lines.push(`💡 ${answer.recommendation.title}: ${answer.recommendation.description}`);
    }
    if (answer.suggestedQuestions?.length) {
      lines.push(`Gợi ý: ${answer.suggestedQuestions.slice(0, 3).join(' · ')}`);
    }

    const source = answer.actions?.length ? answer.actions : answer.action ? [answer.action] : [];
    const ctas = source.map((a) => ({ label: a.label, link: buildLink(a.target, a.entityId) }));

    return {
      intent: intent as RmAnswer['intent'],
      message: lines.join('\n'),
      ctas,
      data: answer.records,
    };
  }

  accountById(id: string): Account | undefined {
    return this.accounts().find((a) => a.id === id);
  }
}
