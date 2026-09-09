import { Injectable, signal } from '@angular/core';

/** Coordinates the persistent Virtual RM widget: whether the mobile bottom sheet is
 * open, and whether the panel/sheet is showing the briefing teaser or the full chat. */
@Injectable({ providedIn: 'root' })
export class ChatUiService {
  readonly mobileSheetOpen = signal(false);
  readonly chatMode = signal(false);

  openChat(): void {
    this.mobileSheetOpen.set(true);
    this.chatMode.set(true);
  }

  openTeaser(): void {
    this.mobileSheetOpen.set(true);
    this.chatMode.set(false);
  }

  closeMobileSheet(): void {
    this.mobileSheetOpen.set(false);
  }

  showTeaser(): void {
    this.chatMode.set(false);
  }
}
