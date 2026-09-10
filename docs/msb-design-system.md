# MSB Business Banking + Virtual RM — Design System

This documents the visual language used across the demo shell. It formalizes tokens
that already exist in `tailwind.config.js` and `src/styles.scss`, and mirrors them as
plain SCSS variables in `src/styles/design-tokens.scss` for the rare case a component
needs a raw value outside a Tailwind class (e.g. an inline gradient binding).

> Scope note: this is a **style language**, not a copy of any real bank's proprietary
> visual assets. No official MSB logo, icon, or trademarked mark is used anywhere in
> this repository — see the letter-mark treatment in `header.component.ts` and
> `pre-login.page.ts`. Colors and layout patterns follow common enterprise/business
> banking UX conventions.

## 1. Colors

| Token | Value | Usage |
|---|---|---|
| `brand-500` | `#ef4b2a` | Primary actions, active nav state, links |
| `brand-50`…`brand-900` | see `tailwind.config.js` | Tints/shades of the primary — hero gradients, badges, hover states |
| `ink-50`…`ink-900` | see `tailwind.config.js` | Neutral grayscale — text, borders, surfaces |
| `positive` | `#0d9488` | Credit amounts, success states |
| `negative` | `#dc2626` | Debit amounts, errors, destructive actions |
| `warn` | `#d97706` | Warnings, medium-priority tasks |

Background: page background is `ink-50`, surfaces (cards, header, sidebar) are white.

## 2. Typography

- Font family: **Satoshi** (loaded via Fontshare in `index.html`), falling back to the
  system sans-serif stack.
- Heading hierarchy (Tailwind classes actually used):
  - Page title: `text-xl font-semibold` (e.g. "Xin chào, {company}")
  - Section/card title: `text-sm font-semibold`
  - Body: `text-sm`
  - Caption/meta: `text-xs text-ink-400`
  - Dense stat labels (RM widget panel): `text-[10px]`
- Line height: `leading-snug` for large headings, `leading-relaxed` for body copy.

## 3. Spacing, radius, shadows, breakpoints

- Spacing follows Tailwind's default scale (`p-3`, `gap-4`, `space-y-5`, …).
- Border radius: `rounded-lg` (buttons, nav items, inputs), `rounded-xl` (stat tiles),
  `rounded-xl2` = `1rem` (cards, custom token), `rounded-full` (badges, avatars, dots).
- Shadows: `shadow-card` (resting cards), `shadow-pop` (dropdowns, sheets, modals).
- Breakpoints: mobile ≈ 390px, `lg` = 1024px (sidebar/RM panel switch from
  drawer/floating-button to persistent desktop layout), desktop ≈ 1440px.

## 4. Component patterns

Defined once in `src/styles.scss` under `@layer components` and reused everywhere —
no per-page duplicated styling:

| Class | Used for |
|---|---|
| `.card` | White surface, `rounded-xl2`, `shadow-card`, `border-ink-100` — the base container for every content block |
| `.btn-primary` / `.btn-secondary` / `.btn-ghost` / `.btn-danger` | All buttons across the app |
| `.badge` | Status pills (currency tags, category tags, alert severity) |
| `.input` (per-component, e.g. `login.page.ts`) | Text inputs — `text-base` (not `text-sm`) deliberately, to avoid iOS Safari auto-zoom on focus |
| `.quick-action` (dashboard) | Icon + label tile grid for shortcuts |

Navigation:
- **Header** (`shared/components/header/header.component.ts`): 64px (`h-16`) fixed top
  bar — brand mark, notifications bell with unread badge, profile menu.
- **Sidebar** (`shared/components/sidebar/sidebar.component.ts`): 256px (`w-64`) fixed
  left rail on desktop, slide-in drawer below `lg`. Active route highlighted with
  `brand-50` background + `brand-700` text.
- **Virtual RM panel** (`rm-widget.component.ts`): 320px persistent right rail on
  desktop; floating action button + bottom sheet on mobile.

Status badges use the semantic colors above (`positive`/`negative`/`warn`) rather than
one-off hex values.

## 5. Design tokens file

`src/styles/design-tokens.scss` — SCSS variables mirroring this document, grouped as:
colors, typography, spacing, radius, shadows, breakpoints, and component-specific
tokens (button/input/card/table/nav/status). Tailwind's `tailwind.config.js` remains
the single source of truth for the actual hex/scale values — keep both in sync if a
token changes.

## 6. Application shell reference

```
┌──────────────────────────────────────────────────────────┐
│ M  MSB Business Banking            🔔   [Avatar] Company │  ← header.component.ts (h-16)
├────────────────┬─────────────────────────────────────────┤
│ Tổng quan       │                                         │
│ Tài khoản       │                                         │
│ Thanh toán      │             <router-outlet>             │
│ Phê duyệt       │                                         │  + rm-widget.component.ts
│ Khoản vay       │                                         │    (320px right rail, desktop)
│ FX              │                                         │
│ Sản phẩm        │                                         │
│ Báo cáo         │                                         │
│ Virtual RM      │                                         │
├────────────────┴─────────────────────────────────────────┤
│ Demo Mode · Admin (role-gated)                            │
└──────────────────────────────────────────────────────────┘
```

On mobile (`< lg`), the sidebar becomes a drawer (hamburger in the header) and the
Virtual RM panel becomes a floating draggable button + bottom sheet.
