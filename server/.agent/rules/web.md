# Web Project Rules (HTML/CSS/JS, PHP, WordPress)

These rules apply to all consumer-facing web projects — static sites, custom PHP
applications, and WordPress builds. They supplement the team-standards.md rules.

## 1. Project Structure

### Static / Custom Sites
```
project-root/
├── src/              ← Source files
│   ├── css/          ← Stylesheets
│   ├── js/           ← JavaScript
│   ├── images/       ← Optimized images
│   └── fonts/        ← Web fonts
├── dist/             ← Build output (gitignored)
├── specs/            ← Feature specifications
├── docs/             ← Documentation
├── .agent/           ← Antigravity agent config
└── .specify/         ← Spec Kit memory and templates
```

### WordPress Projects
```
project-root/
├── wp-content/
│   ├── themes/
│   │   └── client-theme/    ← Custom theme (or child theme)
│   │       ├── template-parts/
│   │       ├── inc/          ← PHP includes, custom post types
│   │       ├── assets/       ← CSS, JS, images
│   │       ├── functions.php
│   │       └── style.css
│   └── plugins/
│       └── client-plugin/    ← Custom plugins (if needed)
├── specs/
├── docs/
├── .agent/
└── .specify/
```

### PHP Applications
```
project-root/
├── public/           ← Web root (index.php, .htaccess)
├── app/
│   ├── controllers/  ← Request handlers
│   ├── models/       ← Data access
│   ├── views/        ← Templates
│   └── helpers/      ← Utility functions
├── config/           ← Configuration files
├── specs/
├── docs/
├── .agent/
└── .specify/
```

## 2. Accessibility (WCAG 2.1 AA)

All consumer-facing sites MUST meet WCAG 2.1 Level AA compliance:

- All images MUST have descriptive `alt` text (or `alt=""` for decorative images)
- Form inputs MUST have associated `<label>` elements
- Color contrast ratios MUST meet AA minimums (4.5:1 for normal text, 3:1 for large)
- All interactive elements MUST be keyboard-navigable
- Focus states MUST be visible and clearly styled
- ARIA landmarks MUST be used for page regions (`<nav>`, `<main>`, `<aside>`, etc.)
- Skip navigation links MUST be present on multi-section pages
- Dynamic content updates MUST use ARIA live regions

## 3. Performance

### Core Web Vitals Targets
| Metric | Target |
|--------|--------|
| Largest Contentful Paint (LCP) | < 2.5s |
| First Input Delay (FID) | < 100ms |
| Cumulative Layout Shift (CLS) | < 0.1 |
| Time to First Byte (TTFB) | < 800ms |

### Optimization Requirements
- Images MUST be served in modern formats (WebP/AVIF with fallbacks)
- Images MUST have explicit `width` and `height` attributes to prevent CLS
- CSS MUST be loaded in `<head>`, JavaScript MUST be deferred or loaded async
- Critical CSS should be inlined for above-the-fold content
- Fonts MUST use `font-display: swap` to prevent invisible text
- Lazy load images and iframes below the fold
- Minimize third-party scripts — each must justify its performance cost

## 4. SEO

Every page MUST have:
- A unique, descriptive `<title>` tag (50–60 characters)
- A unique `<meta name="description">` (150–160 characters)
- A single `<h1>` with proper heading hierarchy (h1 → h2 → h3, no skipping)
- Semantic HTML5 elements (`<header>`, `<nav>`, `<main>`, `<article>`, `<footer>`)
- Canonical URL tag
- Open Graph and Twitter Card meta tags for social sharing
- Structured data (JSON-LD) where applicable (business, product, article)
- An XML sitemap
- A robots.txt file
- Clean, descriptive URLs (no query params for primary content)

## 5. Responsive Design

- **Mobile-first**: Start with mobile layout, enhance upward
- Breakpoint system:
  - Mobile: < 768px
  - Tablet: 768px – 1024px
  - Desktop: > 1024px
- Touch targets MUST be at least 44x44px
- No horizontal scrolling at any breakpoint
- Test on real devices, not just browser dev tools
- Navigation MUST be accessible on all screen sizes (hamburger menu for mobile)

## 6. CSS Architecture

- Use CSS custom properties (variables) for design tokens:
  - Colors, typography, spacing, border radius, shadows
- Avoid deeply nested selectors (max 3 levels)
- Use a consistent naming convention (BEM recommended for vanilla CSS)
- No inline styles in HTML
- Media queries: mobile-first (`min-width`)
- Organize stylesheets by concern:
  - `base.css` — resets, typography, variables
  - `layout.css` — grid, containers, page structure
  - `components.css` — buttons, cards, forms, navs
  - `utilities.css` — helper classes

## 7. JavaScript

- Vanilla JS preferred for simple sites (no framework bloat)
- Use ES modules (`import`/`export`) where build tools support it
- Progressive enhancement: core content works without JS
- Event delegation for dynamic element lists
- Debounce/throttle scroll and resize handlers
- No jQuery in new projects (use native DOM APIs)

## 8. WordPress Specifics

- ALWAYS use a child theme when customizing an existing theme
- Enqueue scripts and styles properly via `wp_enqueue_script/style` — NEVER hardcode
- Use WordPress Coding Standards for PHP
- Custom post types and taxonomies in `inc/custom-post-types.php`
- ACF (Advanced Custom Fields) for structured content — never rely on custom meta queries
- Escape ALL output: `esc_html()`, `esc_attr()`, `esc_url()`, `wp_kses_post()`
- Sanitize ALL input: `sanitize_text_field()`, `absint()`, etc.
- Use `wp_nonce_field` / `wp_verify_nonce` for form security
- Keep plugins minimal — prefer custom code for client-specific functionality

## 9. PHP Security

- NEVER trust user input — validate and sanitize everything
- Use prepared statements (PDO or WordPress `$wpdb->prepare()`) — NO raw SQL
- Escape output for the context (HTML, attributes, URLs, JavaScript)
- Set `Content-Security-Policy` headers
- Protect against CSRF with tokens on all state-changing forms
- Keep PHP version current (8.1+)
- Error reporting: OFF in production, detailed in development

## 10. Browser Compatibility

- Support the last 2 versions of: Chrome, Firefox, Safari, Edge
- Test on actual mobile Safari (iOS) and Chrome (Android)
- Use `@supports` or feature detection for progressive enhancement
- Provide graceful fallbacks for modern CSS (grid, custom properties, container queries)
