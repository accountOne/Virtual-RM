import { CommonModule } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, Component, Input, OnChanges, SimpleChanges, signal } from '@angular/core';

const SIZE_CLASS: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-10 h-10',
  md: 'w-14 h-14',
  lg: 'w-24 h-24',
};

/** How long to wait for `<model-viewer>` to register as a custom element before giving up and
 * falling back to the static avatar — covers a slow/blocked CDN without hanging the UI. */
const MODEL_VIEWER_TIMEOUT_MS = 4000;

/**
 * The RM persona avatar — replaces the bare `👩‍💼` emoji used in 4 places across the app.
 * Always renders the static illustrated SVG by default (zero dependencies, zero load cost,
 * works offline). Only if a real `.glb` is ever supplied via `glbSrc` does it lazy-load
 * `@google/model-viewer` and attempt the 3D upgrade — no screen in this app sets `glbSrc` today
 * (see docs/3d-avatar-guide.md for how to produce and wire in a real asset later), so this dynamic
 * import never runs for any customer yet; it exists so the upgrade path is real, working code
 * rather than a TODO.
 */
@Component({
  selector: 'app-rm-avatar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative shrink-0 rounded-full overflow-hidden" [ngClass]="sizeClass" [attr.aria-label]="ariaLabel" role="img">
      <model-viewer
        *ngIf="modelReady()"
        [attr.src]="glbSrc"
        camera-controls="false"
        auto-rotate="false"
        disable-zoom
        interaction-prompt="none"
        class="w-full h-full"
      ></model-viewer>
      <img *ngIf="!modelReady()" src="/avatar/rm-avatar-fallback.svg" [alt]="ariaLabel" class="w-full h-full object-cover" />
    </div>
  `,
  // model-viewer is a native custom element, registered lazily (see tryLoadModelViewer) only
  // when a real .glb is ever supplied — Angular's template compiler doesn't know about it
  // statically, hence the schema opt-out (the *ngIf guards it from ever rendering unregistered).
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class RmAvatarComponent implements OnChanges {
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() glbSrc?: string;
  @Input() ariaLabel = 'Trợ lý RM ảo';

  readonly modelReady = signal(false);

  get sizeClass(): string {
    return SIZE_CLASS[this.size];
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['glbSrc'] && this.glbSrc) void this.tryLoadModelViewer();
  }

  private async tryLoadModelViewer(): Promise<void> {
    try {
      await Promise.race([
        import('@google/model-viewer'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('model-viewer load timeout')), MODEL_VIEWER_TIMEOUT_MS)),
      ]);
      await Promise.race([
        customElements.whenDefined('model-viewer'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('model-viewer register timeout')), MODEL_VIEWER_TIMEOUT_MS)),
      ]);
      this.modelReady.set(true);
    } catch {
      // Offline, blocked CDN, old browser, or no asset at glbSrc — the static SVG stays up,
      // silently, since a broken/blank avatar would be worse than the (perfectly fine) fallback.
      this.modelReady.set(false);
    }
  }
}
