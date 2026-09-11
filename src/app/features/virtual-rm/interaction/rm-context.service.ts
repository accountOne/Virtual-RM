import { Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { enrichQuestion, parseEntityFromUrl } from './rm-context.util';

/** Phase 5.6 context-awareness (spec §15). Tracks which Business Banking screen the customer
 * is currently looking at, so a short follow-up question in chat ("Còn thiếu gì?") can resolve
 * against that screen's entity without asking the customer to repeat the LC/BG/collection
 * number — the same idea `ai/conversation-context.ts` already applies server-side to a
 * *previous chat turn*, extended here to *the screen currently open*, which the server has no
 * way to know on its own. Route parsing and question enrichment are pure functions in
 * `rm-context.util.ts` so they're unit-testable without a Router/TestBed. */
@Injectable({ providedIn: 'root' })
export class RmContextService {
  private readonly router = inject(Router);

  readonly currentRoute = signal(this.router.url);
  readonly currentEntityType = signal<string | undefined>(undefined);
  readonly currentEntityId = signal<string | undefined>(undefined);

  constructor() {
    this.parseEntity(this.router.url);
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((e) => {
      this.currentRoute.set(e.urlAfterRedirects);
      this.parseEntity(e.urlAfterRedirects);
    });
  }

  private parseEntity(url: string): void {
    const parsed = parseEntityFromUrl(url);
    this.currentEntityType.set(parsed?.entityType);
    this.currentEntityId.set(parsed?.entityId);
  }

  enrichWithContext(question: string): string {
    return enrichQuestion(question, this.currentEntityId());
  }
}
