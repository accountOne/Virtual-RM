import { Injectable, signal } from '@angular/core';
import { RMState } from './rm-interaction.types';

/** Phase 5.6 RM state machine (spec §4). One instance shared across the whole chat surface —
 * a single Virtual RM "presence" the customer is interacting with, not per-message state. */
@Injectable({ providedIn: 'root' })
export class RmStateService {
  readonly state = signal<RMState>('IDLE');

  set(next: RMState): void {
    this.state.set(next);
  }

  is(...states: RMState[]): boolean {
    return states.includes(this.state());
  }
}
