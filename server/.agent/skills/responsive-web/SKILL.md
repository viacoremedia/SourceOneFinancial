---
name: Responsive Web Design Patterns
description: Mobile-first HTML/CSS/JS patterns — CSS architecture, accessibility, performance optimization, and cross-browser testing
---

# Responsive Web Design Skill

Patterns for building accessible, performant, mobile-first responsive websites.

## CSS Architecture

### Design Tokens via Custom Properties
```css
/* base.css */
:root {
  /* Colors */
  --color-primary: #2563eb;
  --color-primary-dark: #1e40af;
  --color-secondary: #7c3aed;
  --color-text: #1f2937;
  --color-text-muted: #6b7280;
  --color-bg: #ffffff;
  --color-bg-alt: #f9fafb;
  --color-border: #e5e7eb;

  /* Typography */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 1.875rem;

  /* Spacing */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;

  /* Layout */
  --container-max: 1200px;
  --container-padding: var(--space-4);

  /* Borders & Shadows */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 1rem;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.1);

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-base: 250ms ease;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  :root {
    --color-text: #f9fafb;
    --color-text-muted: #9ca3af;
    --color-bg: #111827;
    --color-bg-alt: #1f2937;
    --color-border: #374151;
  }
}
```

### File Organization
```
css/
├── base.css        ← Reset, variables, typography, global styles
├── layout.css      ← Grid, containers, page-level structure
├── components.css  ← Buttons, cards, forms, nav, modals
└── utilities.css   ← Helper classes (sr-only, flex, text-center)
```

### BEM Naming Convention
```css
/* Block */
.card { }

/* Element */
.card__title { }
.card__body { }
.card__footer { }

/* Modifier */
.card--featured { }
.card--compact { }
```

## Mobile-First Responsive

### Breakpoint System
```css
/* Mobile first — no media query needed for mobile base styles */
.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-4);
}

/* Tablet */
@media (min-width: 768px) {
  .grid { grid-template-columns: repeat(2, 1fr); }
}

/* Desktop */
@media (min-width: 1024px) {
  .grid { grid-template-columns: repeat(3, 1fr); }
}

/* Wide */
@media (min-width: 1280px) {
  .grid { grid-template-columns: repeat(4, 1fr); }
}
```

### Container Pattern
```css
.container {
  width: 100%;
  max-width: var(--container-max);
  margin-inline: auto;
  padding-inline: var(--container-padding);
}
```

## Accessibility Patterns

### Skip Navigation
```html
<a class="skip-link" href="#main-content">Skip to main content</a>

<header><!-- nav --></header>
<main id="main-content"><!-- content --></main>
```

```css
.skip-link {
  position: absolute;
  top: -100%;
  left: 0;
  z-index: 100;
  padding: var(--space-2) var(--space-4);
  background: var(--color-primary);
  color: white;
}
.skip-link:focus {
  top: 0;
}
```

### Focus Management
```css
/* Visible focus for keyboard users */
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* Remove focus ring for mouse users */
:focus:not(:focus-visible) {
  outline: none;
}
```

### ARIA Patterns
```html
<!-- Hamburger menu -->
<button aria-expanded="false" aria-controls="mobile-nav" aria-label="Toggle menu">
  <span class="hamburger-icon"></span>
</button>
<nav id="mobile-nav" aria-hidden="true"><!-- links --></nav>

<!-- Loading state -->
<div aria-live="polite" aria-busy="true">Loading results...</div>

<!-- Tab panel -->
<div role="tablist">
  <button role="tab" aria-selected="true" aria-controls="panel-1">Tab 1</button>
  <button role="tab" aria-selected="false" aria-controls="panel-2">Tab 2</button>
</div>
<div role="tabpanel" id="panel-1">Content 1</div>
```

## Performance Optimization

### Image Best Practices
```html
<!-- Responsive images with modern formats -->
<picture>
  <source srcset="hero.avif" type="image/avif">
  <source srcset="hero.webp" type="image/webp">
  <img src="hero.jpg" alt="Hero description"
       width="1200" height="600"
       loading="lazy"
       decoding="async">
</picture>
```

### Critical CSS
```html
<!-- Inline critical CSS for above-the-fold content -->
<style>
  /* Only layout + above-fold styles */
</style>

<!-- Defer non-critical CSS -->
<link rel="preload" href="/css/main.css" as="style" onload="this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="/css/main.css"></noscript>
```

### JavaScript Loading
```html
<!-- Defer non-critical JS -->
<script src="/js/main.js" defer></script>

<!-- Async for independent scripts -->
<script src="/js/analytics.js" async></script>
```

### Font Loading
```css
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter.woff2') format('woff2');
  font-display: swap;
  font-weight: 400 700;
}
```

## Cross-Browser Testing

### Testing Checklist
- [ ] Chrome (desktop + Android)
- [ ] Safari (desktop + iOS) — most common compatibility issues
- [ ] Firefox
- [ ] Edge
- [ ] Test at each breakpoint (320px, 768px, 1024px, 1280px)

### Common Pitfalls
- Safari: `gap` in flexbox not supported in older versions — use margins as fallback
- iOS Safari: viewport height issues (`100vh` includes address bar) — use `100dvh`
- Firefox: `backdrop-filter` needs `-webkit-` prefix
- All: test form elements — they render differently across browsers
