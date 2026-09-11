import { Injectable, inject } from '@angular/core';
import { RMMessage } from './rm-interaction.types';
import { RmTimingService } from './rm-timing.service';

/** Phase 5.6 progressive reveal (spec §6). No backend token-streaming endpoint exists to stream
 * from (see docs/phase-5.6-interaction-architecture.md §2), so this reveals an already-fetched
 * `RMMessage[]` one bubble at a time with natural pacing — visually equivalent to streaming for
 * a demo, without inventing a backend contract nothing implements. `onMessage` is called
 * synchronously for each message in order; callers push it straight into their message list. */
@Injectable({ providedIn: 'root' })
export class RmStreamService {
  private readonly timing = inject(RmTimingService);

  async reveal(messages: RMMessage[], onMessage: (message: RMMessage) => void): Promise<void> {
    for (let i = 0; i < messages.length; i++) {
      if (i > 0) await this.timing.betweenMessages();
      onMessage(messages[i]);
    }
  }
}
