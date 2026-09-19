# 3D RM avatar — infrastructure & how to add a real model

The premium redesign spec asked for an optional 3D avatar for the Virtual RM persona, referencing
`github.com/efebaykaraa/meshy_downloader` as a source of assets. This document explains what was
actually built, why no real 3D model ships today, and the exact steps to add one later.

## What `meshy_downloader` actually is

Confirmed by reading its README before building anything: it is a **browser extension** (WXT +
Svelte, MPL-2.0 license) that adds a "one-click `.glb` download" popup while a human is browsing
meshy.ai or tripo3d.ai — third-party, paid, AI 3D-model-generation websites — in Chrome or Firefox.
It is:

- **Not** an npm package or library that can be installed/imported into this Angular app.
- **Not** itself a 3D model or asset pack.
- **Not** something an autonomous coding agent can operate — it requires a human, a browser GUI,
  and (for anything beyond that site's free tier) a paid account on a third-party service.

So "integrate `meshy_downloader`" cannot mean shipping a real MSB-branded 3D avatar as part of a
code change — there is no model to download without a human running that workflow themselves.
**Decision**: build the 3D *infrastructure* — a component that can render a real `.glb` the moment
one exists, with a polished, always-working static fallback — and document how to produce and
plug in a real asset later using that exact tool.

## What was built

`RmAvatarComponent` (`src/app/shared/components/rm-avatar/rm-avatar.component.ts`):

```ts
@Input() size: 'sm' | 'md' | 'lg' = 'md';
@Input() glbSrc?: string;   // unset everywhere in the app today
@Input() ariaLabel = 'Trợ lý RM ảo';
```

- **Default (no `glbSrc`)**: renders `public/avatar/rm-avatar-fallback.svg` — a small, on-brand,
  illustrated avatar (not a photorealistic human — see "Why not a photo" below). Zero
  dependencies, zero network cost beyond the SVG itself, works offline.
- **If `glbSrc` is ever set**: lazy `import('@google/model-viewer')` (the official Google web
  component, MIT-licensed) inside `ngOnInit`, raced against `customElements.whenDefined
  ('model-viewer')` with a 4-second timeout. On success, renders `<model-viewer [src]="glbSrc">`.
  On **any** failure — offline, a blocked CDN, an old browser, a missing/broken asset at
  `glbSrc` — it silently keeps the static SVG. A broken or blank avatar is strictly worse than the
  perfectly fine fallback, so failures are never surfaced to the customer.

`@google/model-viewer` is a real dependency in `package.json`, confirmed (via a production build)
to land in its own lazy chunk (~1.04 MB, ~242 KB gzipped) that is **not** part of the initial
bundle — since no screen sets `glbSrc` today, that chunk is never actually downloaded by any real
customer yet. This is working, tested code, not a TODO stub.

Used in 4 places (all previously a bare `👩‍💼` emoji):
`rm-chat-launcher.component.ts`, `virtual-rm-chat.page.ts`'s header, `briefing.component.ts`,
`daily-greeting.component.ts`.

## Why not a photorealistic human photo/avatar

The spec asks for "professional, human-like, not cartoon" — but a fabricated photorealistic photo
of a fictional bank employee raises its own concerns for a public demo (implies a real person, can
read as misleading). The static fallback SVG instead uses a clean, flat-design illustrated bust in
MSB's brand colors (`brand-500`/`ink-700`/`ink-50`) — professional and on-brand without depicting
an invented "real" person.

## How to add a real `.glb` avatar later

1. Generate a model on meshy.ai or tripo3d.ai (a human, paid-account, browser-GUI task).
2. Install the `meshy_downloader` browser extension from its GitHub releases page and use its
   one-click popup to download the generated model as a `.glb` file.
3. Place the file at `public/avatar/rm-avatar.glb` (anything under `public/` is served at the
   app's root — see `angular.json`'s `assets` config, which points at `public/`, not `src/assets/`
   — a real gotcha hit while building this: `src/assets/` is **not** wired into this project's
   asset pipeline).
4. Pass `glbSrc="/avatar/rm-avatar.glb"` on the 4 `<app-rm-avatar>` usages listed above (or thread
   it through a shared constant/config if you want it toggleable).
5. Rebuild and manually verify: `RmAvatarComponent` should now render the real model instead of the
   SVG fallback, and the `model-viewer` lazy chunk should load in the network tab the first time an
   avatar renders.

No other code changes are needed — the lazy-load/fallback logic already handles a real asset
correctly; it was written and tested with that path in mind from the start, even though no
`glbSrc` is set anywhere today.

## Performance notes

- The `model-viewer` chunk is never fetched unless `glbSrc` is set — confirmed via a production
  build's chunk breakdown.
- Keep any real `.glb` reasonably small for mobile (a few MB at most) — `model-viewer` itself
  doesn't optimize the model file, only how it's loaded/rendered.
- The 4-second load timeout means a slow real-world connection will fall back to the SVG rather
  than leave the customer staring at a loading avatar indefinitely; this is a deliberate
  "acceptable" behavior per the spec's own "Nếu 3D asset quá nặng: Initial load → Static avatar →
  Lazy load 3D" guidance.
