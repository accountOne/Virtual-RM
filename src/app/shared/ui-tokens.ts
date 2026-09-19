/** Shared "premium dark hero" background (mockup screens 1/2/5: login, Demo FIDO2, voice capture)
 * — a dark navy/near-black base with a warm brand-orange glow as an ACCENT, not the dominant
 * fill. Centralized so every screen using this treatment (login, the FIDO2 takeover, the voice
 * overlay) reads as one consistent visual language instead of each screen picking its own shade.
 *
 * Written as TWO layers — a translucent glow `radial-gradient` ending in `transparent`, over a
 * plain opaque `#05070a` base — rather than one gradient whose own last stop is opaque. A single-
 * gradient version with percentage-based ellipse sizing (`90% 65%`) produces an ellipse far
 * larger than the viewport on a real phone screen, so most of the visible area falls inside the
 * gradient's translucent transition zone instead of past its "opaque" stop — confirmed live: the
 * FIDO2 modal shown over the (light-background) Checker approval page let that page's buttons/
 * text visibly bleed through. An explicit opaque base layer makes this correct regardless of
 * viewport size or what's rendered behind it. */
export const HERO_DARK_BG =
  'radial-gradient(90% 65% at 15% 100%, rgba(239,75,42,0.45) 0%, rgba(138,30,23,0.25) 20%, transparent 50%), #05070a';
